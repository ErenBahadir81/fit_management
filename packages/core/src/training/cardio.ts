/**
 * CARDIO (run / swim) — totals and target progression, ported from v1 `program-util.ts`.
 * Progression rule: next target minutes = best logged pace × target km, never worse than the
 * current target and never below a 3 min/km sanity floor.
 */
import { clamp, round } from "../utils/index";
import type { CardioEntryDTO, CardioTargetDTO } from "../schemas/index";

export interface CardioSegmentLike {
  km?: number;
  min?: number;
}

/** Best (lowest) pace in min/km over the segments, or `null` when nothing usable was logged. */
export function bestPace(segments: readonly CardioSegmentLike[]): number | null {
  let best = Infinity;
  for (const s of segments ?? []) {
    const km = Number(s?.km) || 0;
    const min = Number(s?.min) || 0;
    if (km > 0 && min > 0) best = Math.min(best, min / km);
  }
  return Number.isFinite(best) ? best : null;
}

export function cardioTotals(segments: readonly CardioSegmentLike[]): { totalKm: number; totalMin: number } {
  let totalKm = 0;
  let totalMin = 0;
  for (const s of segments ?? []) {
    totalKm += Number(s?.km) || 0;
    totalMin += Number(s?.min) || 0;
  }
  return { totalKm: round(totalKm, 2), totalMin: round(totalMin, 2) };
}

/** The logged cardio entry, or `null` when the user did not actually run/swim. */
export function buildCardioEntry(
  segments: readonly CardioSegmentLike[],
  targetKm: number,
  targetMin: number
): CardioEntryDTO | null {
  const clean = (segments ?? [])
    .map((s) => ({ km: clamp(Number(s?.km) || 0, 0, 200), min: clamp(Number(s?.min) || 0, 0, 1440) }))
    .filter((s) => s.km > 0 || s.min > 0);
  if (clean.length === 0) return null;
  const { totalKm, totalMin } = cardioTotals(clean);
  return { segments: clean, totalKm, totalMin, targetKm: Math.max(0, targetKm || 0), targetMin: Math.max(0, targetMin || 0) };
}

/**
 * Next occurrence's target for this cardio slot: `round(bestPace × targetKm)`, clamped to
 * `[targetKm × 3, currentTargetMin]` — so the target only ever gets faster (or stays put).
 */
export function nextCardioTarget(target: CardioTargetDTO | null, entry: { segments?: readonly CardioSegmentLike[] } | null): CardioTargetDTO | null {
  if (!target) return target;
  if (!entry) return target;
  const pace = bestPace(entry.segments ?? []);
  if (pace === null || !(target.targetKm > 0) || !(target.targetMin > 0)) return target;
  const projected = Math.round(pace * target.targetKm);
  const floor = Math.round(target.targetKm * 3);
  const targetMin = clamp(projected, Math.min(floor, target.targetMin), target.targetMin);
  return targetMin === target.targetMin ? target : { ...target, targetMin };
}
