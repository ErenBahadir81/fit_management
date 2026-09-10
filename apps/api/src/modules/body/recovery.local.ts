/**
 * Minimal per-muscle recovery used by the home composite.
 *
 * TODO(B2): the canonical recovery engine lives in `packages/core/src/training` (module B2).
 * Once it exports `computeRecovery`, delete this file and call it instead — the shape below is
 * deliberately the same subset the HomeDTO needs.
 * Curve: 0 % at the moment of training, 70 % at half the muscle's full-recovery time, 100 % at full.
 */
import type { MuscleDTO, RecoveryStatus } from "@fitfloow/core";
import { clamp } from "@fitfloow/core";

export interface RecoveryLogInput {
  date: Date;
  strength: Array<{ muscles: Array<{ key: string; load: number }>; sets: unknown[]; skipped?: boolean }>;
}

export interface MuscleReadinessLite {
  key: string;
  name: string;
  readiness: number;
  status: RecoveryStatus;
  color: string;
}

export interface RecoveryOverview {
  readiness: number;
  status: RecoveryStatus;
  readyCount: number;
  fatiguedCount: number;
  top: MuscleReadinessLite[];
}

export function readinessFor(hoursSince: number | null, fullRecoveryHours: number): number {
  if (hoursSince === null) return 100;
  const full = Math.max(1, fullRecoveryHours);
  if (hoursSince >= full) return 100;
  const half = full / 2;
  const pct = hoursSince <= half ? (70 * hoursSince) / half : 70 + (30 * (hoursSince - half)) / half;
  return clamp(Math.round(pct), 0, 100);
}

export function statusFor(readiness: number): RecoveryStatus {
  if (readiness < 40) return "fatigued";
  if (readiness < 85) return "recovering";
  return "ready";
}

export function computeLocalRecovery(muscles: MuscleDTO[], logs: RecoveryLogInput[], now: Date): RecoveryOverview {
  const lastTrained = new Map<string, number>();
  for (const log of logs) {
    for (const e of log.strength ?? []) {
      if (e.skipped || (e.sets?.length ?? 0) === 0) continue;
      for (const m of e.muscles ?? []) {
        if ((m.load ?? 1) <= 0) continue;
        const at = log.date.getTime();
        if (!lastTrained.has(m.key) || at > lastTrained.get(m.key)!) lastTrained.set(m.key, at);
      }
    }
  }

  const rows: MuscleReadinessLite[] = muscles.map((m) => {
    const at = lastTrained.get(m.key);
    const hoursSince = at === undefined ? null : (now.getTime() - at) / 3_600_000;
    const readiness = readinessFor(hoursSince, m.fullRecoveryHours);
    return { key: m.key, name: m.name, readiness, status: statusFor(readiness), color: m.color };
  });

  const overall = rows.length === 0 ? 100 : Math.round(rows.reduce((a, r) => a + r.readiness, 0) / rows.length);
  return {
    readiness: overall,
    status: statusFor(overall),
    readyCount: rows.filter((r) => r.status === "ready").length,
    fatiguedCount: rows.filter((r) => r.status === "fatigued").length,
    // Least recovered first: that is what the home screen has to warn about.
    top: [...rows].sort((a, b) => a.readiness - b.readiness).slice(0, 3),
  };
}
