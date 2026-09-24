/**
 * VOLUME BANDS — how good a weekly set count is for one muscle, and what to say about it.
 *
 * Sets count fractionally: an exercise adds `sets × activation` to every muscle it works
 * (bench press 3 sets at chest 0.9 → 2.7 chest sets), so 9.9 chest sets is a real answer.
 *
 * Bands (weekly effective sets per muscle):
 *   < 5   low       — not even maintenance
 *   5+    maintain  — keeps the muscle
 *   10+   grow      — enough to grow (recommended 10–15)
 *   15+   optimal   — very good, the upper end
 *   20+   excessive — heading toward overuse / injury
 *
 * The zone is a label; everything that drives colour and warnings is continuous, so there is
 * no cliff at a threshold: 19 sets is fine, 20 is a mild note, the real warning starts ~23.
 * - `score` (0..1): diminishing-returns stimulus `1 − e^(−s/6)` (5 → .57, 10 → .81, 15 → .92)
 *   damped by the overuse risk.
 * - `risk` (0..1): smoothstep from 18 to 25 sets (19 → .07, 20 → .20, 22 → .61, 24 → .94).
 */
import { round } from "../utils/index";
import type {
  MuscleDTO,
  MuscleVolume,
  PlannedMuscleVolume,
  ProgramMode,
  ProgramVolume,
  VolumeAdvice,
  VolumeRating,
  VolumeSeverity,
  VolumeZone,
} from "../schemas/index";
import { catalogIndex, exerciseNameKey, type CatalogExerciseLike } from "./program";
import { normalizeMuscleLoads } from "./types";

export const VOLUME_BANDS = { maintain: 5, grow: 10, optimal: 15, excessive: 20 } as const;
/** What the app recommends per muscle per week. */
export const RECOMMENDED_WEEKLY_SETS = { min: 10, max: 15 } as const;
/** Overuse risk ramps between these (smoothstep). */
export const RISK_RAMP = { from: 18, to: 25 } as const;
/** `risk` at which the note becomes a warning, and a real alert. */
const RISK_INFO = 0.15;
const RISK_WARN = 0.5;
const RISK_ALERT = 0.9;
/** Half a set of slack below 10 before "under" — transitions are soft. */
const UNDER_SLACK = 0.5;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function volumeRisk(sets: number): number {
  return round(smoothstep(RISK_RAMP.from, RISK_RAMP.to, Math.max(0, sets || 0)), 3);
}

export function volumeScore(sets: number): number {
  const s = Math.max(0, sets || 0);
  return round((1 - Math.exp(-s / 6)) * (1 - volumeRisk(s)), 3);
}

export function volumeZone(sets: number): VolumeZone {
  const s = Math.max(0, sets || 0);
  if (s < 0.05) return "none";
  if (s < VOLUME_BANDS.maintain) return "low";
  if (s < VOLUME_BANDS.grow) return "maintain";
  if (s < VOLUME_BANDS.optimal) return "grow";
  if (s < VOLUME_BANDS.excessive) return "optimal";
  return "excessive";
}

export function volumeSeverity(sets: number): VolumeSeverity {
  const s = Math.max(0, sets || 0);
  const risk = volumeRisk(s);
  if (risk >= RISK_ALERT) return "alert";
  if (risk >= RISK_WARN) return "warn";
  if (risk >= RISK_INFO) return "info";
  if (s < 0.05) return "info";
  if (s < VOLUME_BANDS.maintain) return "warn";
  if (s < VOLUME_BANDS.grow - UNDER_SLACK) return "info";
  return "none";
}

export function rateVolume(sets: number): VolumeRating {
  return { zone: volumeZone(sets), score: volumeScore(sets), risk: volumeRisk(sets), severity: volumeSeverity(sets) };
}

/** Legacy 4-state status, derived from the same continuous rating. */
export function bandStatus(sets: number): MuscleVolume["status"] {
  const s = Math.max(0, sets || 0);
  if (s <= 0.001) return "none";
  if (volumeRisk(s) >= RISK_INFO) return "over";
  if (s < RECOMMENDED_WEEKLY_SETS.min - UNDER_SLACK) return "under";
  return "in";
}

/** Planned sets in one pass of a cycle → per week. A weekly program is a 7-day cycle. */
export function perWeek(perCycle: number, cycleLength: number): number {
  if (!Number.isFinite(perCycle) || cycleLength <= 0) return 0;
  return (perCycle * 7) / cycleLength;
}

const fmt = (n: number) => String(round(n, 1)).replace(".", ",");

/** One short sentence Floo / the editor can say. `null` when there is nothing to say. */
export function volumeAdvice(key: string, name: string, weekly: number): VolumeAdvice | null {
  const s = round(Math.max(0, weekly || 0), 1);
  const severity = volumeSeverity(s);
  if (severity === "none") return null;
  const risk = volumeRisk(s);
  if (risk >= RISK_INFO) {
    const kind = risk >= RISK_WARN ? "excessive" : "high";
    const message =
      kind === "excessive"
        ? `${name} haftada ${fmt(s)} set, sakatlık riskine doğru gidiyor. 15–18 sete indirmeyi düşün.`
        : `${name} haftada ${fmt(s)} set, üst sınırdasın. Daha fazlası yerine toparlanmaya odaklan.`;
    return { key, name, severity, kind, weekly: s, message };
  }
  if (s < 0.05) {
    return { key, name, severity, kind: "missing", weekly: 0, message: `${name} bu programda hiç çalışmıyor. Gelişmesi için haftada 10–15 set hedefle.` };
  }
  if (s < VOLUME_BANDS.maintain) {
    return { key, name, severity, kind: "low", weekly: s, message: `${name} haftada ${fmt(s)} set, korumak için bile az. En az 5, gelişim için 10 set hedefle.` };
  }
  const missing = round(RECOMMENDED_WEEKLY_SETS.min - s, 1);
  return {
    key,
    name,
    severity,
    kind: "maintain",
    weekly: s,
    message: `${name} haftada ${fmt(s)} set ile korunuyor. Gelişim için ${fmt(missing)} set daha ekleyebilirsin.`,
  };
}

/* ----------------------------- planned volume ----------------------------- */

export interface VolumeDayLike {
  kind?: string;
  exercises?: ReadonlyArray<{
    name?: string;
    targetSets?: number;
    metric?: string;
    muscles?: ReadonlyArray<{ key: string; load?: number } | string>;
  }>;
}

export interface ProgramVolumeOptions {
  mode?: ProgramMode;
  /** Current catalog: its activation values (even an empty list) win over the program's snapshot. */
  catalog?: readonly CatalogExerciseLike[];
}

type MuscleMeta = Pick<MuscleDTO, "key" | "name"> & Partial<Pick<MuscleDTO, "order" | "active">>;

const SEVERITY_RANK: Record<VolumeSeverity, number> = { alert: 3, warn: 2, info: 1, none: 0 };

/**
 * A program's planned weekly volume for every given (active) muscle, rated, plus the advice
 * list — worst first. Mobility work (`metric: "stretch"`) never counts.
 */
export function programVolume(
  days: ReadonlyArray<VolumeDayLike>,
  muscles: readonly MuscleMeta[],
  opts: ProgramVolumeOptions = {}
): ProgramVolume {
  const list = days ?? [];
  const cycleLength = opts.mode === "weekly" ? 7 : list.length;
  const catalog = opts.catalog ? catalogIndex(opts.catalog) : null;

  const perCycle = new Map<string, number>();
  const sources = new Map<string, Map<string, number>>();
  for (const day of list) {
    for (const ex of day?.exercises ?? []) {
      if (ex?.metric === "stretch") continue;
      const sets = typeof ex?.targetSets === "number" && Number.isFinite(ex.targetSets) ? Math.max(0, ex.targetSets) : 0;
      if (sets <= 0) continue;
      // An exercise the (active) catalog knows counts with the catalog's values — even none, so an
      // admin who takes every muscle off an exercise is obeyed; unknown exercises use the snapshot.
      const fromCatalog = catalog?.get(exerciseNameKey(ex.name))?.muscles;
      const loads = normalizeMuscleLoads(fromCatalog ?? ex.muscles);
      for (const { key, load } of loads) {
        if (load <= 0) continue;
        perCycle.set(key, (perCycle.get(key) ?? 0) + sets * load);
        const src = sources.get(key) ?? new Map<string, number>();
        const name = String(ex.name ?? "").trim() || "Hareket";
        src.set(name, (src.get(name) ?? 0) + sets * load);
        sources.set(key, src);
      }
    }
  }

  const rows: PlannedMuscleVolume[] = [...(muscles ?? [])]
    .filter((m) => m && m.active !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((m) => {
      const cyc = perCycle.get(m.key) ?? 0;
      const weekly = round(perWeek(cyc, cycleLength), 1);
      const src = [...(sources.get(m.key) ?? new Map<string, number>()).entries()]
        .map(([name, sets]) => ({ name, sets: round(perWeek(sets, cycleLength), 1) }))
        .sort((a, b) => b.sets - a.sets);
      return { key: m.key, name: m.name, perCycle: round(cyc, 2), weekly, sources: src, ...rateVolume(weekly) };
    });

  const advice = rows
    .map((r) => volumeAdvice(r.key, r.name, r.weekly))
    .filter((a): a is VolumeAdvice => a !== null)
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.weekly - a.weekly);

  return { cycleLength, muscles: rows, advice };
}
