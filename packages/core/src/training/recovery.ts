/**
 * FATIGUE / RECOVERY ENGINE (ported from v1 `src/lib/services/fatigue.ts`).
 *
 * Single source of truth: the workout logs. Completely independent of the program pointer —
 * whatever day is "next", fatigue only comes from what was really logged, with each exercise's
 * own muscles and its own timestamp.
 *
 * Recovery curve: 0 % right after the session → 70 % at half the window → 100 % at the full
 * window (piecewise linear). The window is per muscle (`fullRecoveryHours`, admin-editable).
 *
 * v2 change: a hit carries the exercise→muscle `load` (0..1). The effective work of a hit is
 * `sets × load`, so an exercise that only partially involves a muscle fatigues it partially.
 */
import { clamp, round } from "../utils/index";
import type { MuscleDTO, MuscleReadiness, RecoveryStatus, RecoveryView } from "../schemas/index";
import { HOUR_MS, WEEK_MS, normalizeMuscleLoads, toMs, type WorkoutLogLike } from "./types";

export const RECOVERY_STATUS_TR: Record<RecoveryStatus, string> = {
  fatigued: "Yorgun",
  recovering: "Yenileniyor",
  ready: "Hazır",
};

/** One exercise → one muscle, at one instant. `sets` is the real set count, `load` the 0..1 share. */
export interface MuscleHit {
  key: string;
  sets: number;
  load: number;
  at: number; // epoch ms
}

/** Work a hit contributes to its muscle. */
export function effectiveSets(hit: MuscleHit): number {
  return hit.sets * hit.load;
}

/** 0 → 0.7 at half the window → 1.0 at the full window (v1 curve, unchanged). */
export function recoveredFraction(elapsedHours: number, fullHours: number): number {
  if (!(fullHours > 0)) return 1;
  if (elapsedHours <= 0) return 0;
  const half = fullHours / 2;
  if (elapsedHours <= half) return 0.7 * (elapsedHours / half);
  if (elapsedHours <= fullHours) return 0.7 + 0.3 * ((elapsedHours - half) / half);
  return 1;
}

export function recoveryStatusOf(readiness: number): RecoveryStatus {
  if (readiness < 40) return "fatigued";
  if (readiness < 85) return "recovering";
  return "ready";
}

/**
 * Muscle hits from raw workout logs.
 * - off-day logs are skipped
 * - skipped exercises are skipped
 * - `metric: "stretch"` is skipped (mobility work carries no fatigue)
 * - set count is the number of *logged* sets (`sets.length`) — never `plannedSets`
 */
export function buildHits(logs: readonly WorkoutLogLike[]): MuscleHit[] {
  const hits: MuscleHit[] = [];
  for (const log of logs ?? []) {
    if (!log || log.isOffDay) continue;
    const at = toMs(log.date);
    if (!Number.isFinite(at)) continue;
    for (const entry of log.strength ?? []) {
      if (!entry || entry.skipped) continue;
      if (entry.metric === "stretch") continue;
      const sets = Array.isArray(entry.sets) ? entry.sets.length : 0;
      if (sets <= 0) continue;
      for (const m of normalizeMuscleLoads(entry.muscles)) {
        if (m.load <= 0) continue;
        hits.push({ key: m.key, sets, load: m.load, at });
      }
    }
  }
  return hits;
}

/**
 * Readiness per muscle (0..100, 100 = fresh), in the order the muscles are given.
 * `readiness = 100 × (1 − Σ setsₑ·(1−recovered) / reference)`, where `reference` is the heaviest
 * session that is *still* fatiguing (fully recovered sessions never inflate it).
 * Hits whose muscle key is not in `muscles` (removed/renamed by an admin) are ignored.
 */
export function computeReadiness(
  hits: readonly MuscleHit[],
  muscles: readonly MuscleDTO[],
  now: Date | number | string
): MuscleReadiness[] {
  const nowMs = toMs(now);
  const byMuscle = new Map<string, MuscleHit[]>();
  for (const h of hits ?? []) {
    if (!h || !Number.isFinite(h.at) || h.at > nowMs) continue;
    const list = byMuscle.get(h.key);
    if (list) list.push(h);
    else byMuscle.set(h.key, [h]);
  }

  return (muscles ?? []).map((cfg) => {
    const list = byMuscle.get(cfg.key) ?? [];
    let weeklySets = 0;
    let residual = 0;
    let reference = 0;
    let lastTrainedAt: number | null = null;

    for (const h of list) {
      const eff = effectiveSets(h);
      if (nowMs - h.at <= WEEK_MS) weeklySets += eff;
      if (lastTrainedAt === null || h.at > lastTrainedAt) lastTrainedAt = h.at;
      const elapsedH = (nowMs - h.at) / HOUR_MS;
      if (elapsedH >= cfg.fullRecoveryHours) continue; // fully recovered → no contribution
      const remaining = 1 - recoveredFraction(elapsedH, cfg.fullRecoveryHours);
      if (remaining <= 0) continue;
      residual += eff * remaining;
      reference = Math.max(reference, eff);
    }

    const readiness = reference <= 0 ? 100 : Math.round(100 * (1 - clamp(residual / reference, 0, 1)));
    const hoursSince = lastTrainedAt === null ? null : round((nowMs - lastTrainedAt) / HOUR_MS, 1);
    const hoursToFull =
      lastTrainedAt === null ? null : round(Math.max(0, cfg.fullRecoveryHours - (nowMs - lastTrainedAt) / HOUR_MS), 1);

    return {
      key: cfg.key,
      name: cfg.name,
      short: cfg.short,
      size: cfg.size,
      color: cfg.color,
      fullRecoveryHours: cfg.fullRecoveryHours,
      readiness,
      status: recoveryStatusOf(readiness),
      lastTrainedAt: lastTrainedAt === null ? null : new Date(lastTrainedAt).toISOString(),
      hoursSince,
      hoursToFull,
      residualSets: round(residual, 1),
      weeklySets: round(weeklySets, 1),
      weeklyTarget: cfg.weeklyTarget,
    };
  });
}

/** Mean readiness over the muscles plus ready/fatigued counts. */
export function overallReadiness(list: readonly MuscleReadiness[]): RecoveryView["overall"] {
  if (list.length === 0) return { readiness: 100, status: "ready", readyCount: 0, fatiguedCount: 0 };
  const readiness = Math.round(list.reduce((s, m) => s + m.readiness, 0) / list.length);
  return {
    readiness,
    status: recoveryStatusOf(readiness),
    readyCount: list.filter((m) => m.status === "ready").length,
    fatiguedCount: list.filter((m) => m.status === "fatigued").length,
  };
}

/** Raw logs → the full `GET /recovery` payload. */
export function computeRecovery(
  logs: readonly WorkoutLogLike[],
  muscles: readonly MuscleDTO[],
  now: Date | number | string
): RecoveryView {
  const list = computeReadiness(buildHits(logs), muscles, now);
  return { muscles: list, overall: overallReadiness(list), generatedAt: new Date(toMs(now)).toISOString() };
}
