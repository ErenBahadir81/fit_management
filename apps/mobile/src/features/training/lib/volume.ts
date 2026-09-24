/**
 * VOLUME, PRESENTED — how the editor and the program tab draw and talk about weekly sets per
 * muscle. The numbers themselves come from core (`programVolume`, `rateVolume`, `volumeAdvice`);
 * this file only decides the bar's geometry, its colour ramp, its words, the next exercise to
 * suggest and which advice is new enough for Floo to say.
 *
 * Colour is continuous on purpose: the bands are 5 / 10 / 15 / 20+, but a bar at 9.8 sets and
 * one at 10.2 must look nearly the same. The ramp is interpolated between anchor points, never
 * stepped, and every bar also carries its words (`volumeWord`) so colour is never the only cue.
 */
import {
  exerciseNameKey,
  RECOMMENDED_WEEKLY_SETS,
  VOLUME_BANDS,
  volumeRisk,
  volumeZone,
  type ExerciseDTO,
  type MuscleVolume,
  type PlannedMuscleVolume,
  type VolumeAdvice,
  type VolumeSeverity,
} from "@fitfloow/core";

/** The bar's axis ends here; anything above pins to the end (the words still say how far). */
export const VOLUME_AXIS_MAX = 25;

/** Where on the axis (0..1) a weekly set count sits. */
export function volumeFraction(sets: number): number {
  const s = Number.isFinite(sets) ? Math.max(0, sets) : 0;
  return Math.min(1, s / VOLUME_AXIS_MAX);
}

/** The recommended 10–15 band and the band ticks, as axis fractions. */
export const VOLUME_GUIDES = {
  recommended: { from: volumeFraction(RECOMMENDED_WEEKLY_SETS.min), to: volumeFraction(RECOMMENDED_WEEKLY_SETS.max) },
  ticks: [VOLUME_BANDS.maintain, VOLUME_BANDS.grow, VOLUME_BANDS.optimal, VOLUME_BANDS.excessive].map((s) => ({ sets: s, at: volumeFraction(s) })),
} as const;

export interface VolumeRampColors {
  inkSubtle: string;
  primary: string;
  success: string;
  warningFill: string;
  danger: string;
}

/**
 * Anchor points of the colour ramp (weekly sets → colour). Between anchors the bar blends, so
 * crossing 10 or 20 is a drift, not a jump: grey below maintenance, blue while maintaining, green
 * across the recommended band and up to ~18, amber as the overuse risk starts (≈21), red by 25.
 */
export const VOLUME_RAMP_INPUT = [0, VOLUME_BANDS.maintain, VOLUME_BANDS.grow, 18, 21.5, VOLUME_AXIS_MAX] as const;

export function volumeRampOutput(c: VolumeRampColors): string[] {
  return [c.inkSubtle, c.primary, c.success, c.success, c.warningFill, c.danger];
}

/** Short words for a weekly set count — shown next to every bar, so colour is never alone. */
export function volumeWord(sets: number): string {
  const s = Math.max(0, sets || 0);
  const risk = volumeRisk(s);
  if (risk >= 0.5) return "Çok fazla";
  if (risk >= 0.15) return "Üst sınır";
  switch (volumeZone(s)) {
    case "none":
      return "Çalışmıyor";
    case "low":
      return "Yetersiz";
    case "maintain":
      return "Koruma";
    case "grow":
      return "Gelişim";
    default:
      return "İdeal";
  }
}

/** "12,4" — one decimal only when there is one. */
export function fmtSets(sets: number): string {
  const r = Math.round(Math.max(0, sets || 0) * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace(".", ",");
}

export interface VolumeRow {
  key: string;
  name: string;
  sets: number;
  word: string;
  inRange: boolean;
}

const inRange = (s: number) => s >= RECOMMENDED_WEEKLY_SETS.min - 0.5 && volumeRisk(s) < 0.15;

/** Planned volume rows, in the muscles' own order (bars never jump around while you edit). */
export function plannedRows(rows: readonly PlannedMuscleVolume[]): VolumeRow[] {
  return rows.map((r) => ({ key: r.key, name: r.name, sets: r.weekly, word: volumeWord(r.weekly), inRange: inRange(r.weekly) }));
}

/** What the last 7 days actually did, same shape. */
export function doneRows(rows: readonly MuscleVolume[]): VolumeRow[] {
  return rows.map((r) => ({ key: r.key, name: r.name, sets: r.done, word: volumeWord(r.done), inRange: inRange(r.done) }));
}

/* ------------------------------- suggestions ------------------------------ */

export type CatalogLike = Pick<ExerciseDTO, "id" | "name" | "muscles" | "metric" | "active" | "defaultSets" | "defaultReps">;

/**
 * The catalog exercise that works `muscleKey` hardest, leaving out what the program already has.
 * Ties go to the more isolated exercise (less of it spills onto other muscles), then by name.
 * Mobility work never counts toward volume, so it is never suggested.
 */
export function suggestExercise<T extends CatalogLike>(catalog: readonly T[], muscleKey: string, exclude: Iterable<string> = []): T | null {
  const taken = new Set([...exclude].map(exerciseNameKey));
  let best: { ex: T; load: number; spill: number } | null = null;
  for (const ex of catalog ?? []) {
    if (!ex || ex.active === false || ex.metric === "stretch" || taken.has(exerciseNameKey(ex.name))) continue;
    const load = ex.muscles.find((m) => m.key === muscleKey)?.load ?? 0;
    if (load <= 0) continue;
    const spill = ex.muscles.reduce((a, m) => a + (m.key === muscleKey ? 0 : m.load), 0);
    if (
      !best ||
      load > best.load ||
      (load === best.load && spill < best.spill) ||
      (load === best.load && spill === best.spill && ex.name.localeCompare(best.ex.name, "tr") < 0)
    ) {
      best = { ex, load, spill };
    }
  }
  return best?.ex ?? null;
}

/** Muscles that deserve a suggestion: under the growth band. */
export function needsMore(sets: number): boolean {
  return sets < RECOMMENDED_WEEKLY_SETS.min - 0.5;
}

/* ------------------------------ Floo's timing ------------------------------ */

const RANK: Record<VolumeSeverity, number> = { none: 0, info: 1, warn: 2, alert: 3 };

/**
 * Advice worth saying *now*: a muscle whose note just became a warning (or worse) because of the
 * last edit. Opening the editor says nothing (`prev === null`); a warning that was already there
 * is not repeated; "not trained at all" stays an info in the bars — with 17 muscles a focused
 * program always leaves some at zero, and Floo nagging about each one would be noise.
 */
export function newVolumeAlerts(prev: readonly VolumeAdvice[] | null, next: readonly VolumeAdvice[]): VolumeAdvice[] {
  if (prev === null) return [];
  const before = new Map(prev.map((a) => [a.key, RANK[a.severity]]));
  return next.filter((a) => RANK[a.severity] >= RANK.warn && RANK[a.severity] > (before.get(a.key) ?? 0));
}

/** Floo's `volumeWarning` band for an advice (the bus copy speaks in these). */
export function adviceBand(a: Pick<VolumeAdvice, "kind">): "low" | "high" | "injury" {
  if (a.kind === "excessive") return "injury";
  if (a.kind === "high") return "high";
  return "low";
}
