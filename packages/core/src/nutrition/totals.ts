import { round } from "../utils/index";
import type { Per100g, Totals } from "../schemas/nutrition";

/** kcal is stored as a whole number, macros with one decimal — the precision users actually see. */
const KCAL_DIGITS = 0;
const MACRO_DIGITS = 1;

export function emptyTotals(): Totals {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
}

function roundTotals(t: Totals): Totals {
  return {
    kcal: round(t.kcal, KCAL_DIGITS),
    protein: round(t.protein, MACRO_DIGITS),
    carbs: round(t.carbs, MACRO_DIGITS),
    fat: round(t.fat, MACRO_DIGITS),
  };
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** `grams × per100g / 100`, rounded. The single source of truth for a logged meal entry. */
export function entryTotals(grams: number, per100g: Per100g): Totals {
  if (!Number.isFinite(grams) || grams <= 0) return emptyTotals();
  const f = grams / 100;
  return roundTotals({
    kcal: num(per100g?.kcal) * f,
    protein: num(per100g?.protein) * f,
    carbs: num(per100g?.carbs) * f,
    fat: num(per100g?.fat) * f,
  });
}

/** Sum raw (already rounded) totals and round once, so a day's total never drifts. */
export function sumTotals(list: readonly Totals[]): Totals {
  const acc = emptyTotals();
  for (const t of list) {
    acc.kcal += num(t?.kcal);
    acc.protein += num(t?.protein);
    acc.carbs += num(t?.carbs);
    acc.fat += num(t?.fat);
  }
  return roundTotals(acc);
}

/** Mean of `list` over `divisor` days (divisor may exceed list.length: unlogged days count as 0). */
export function avgTotals(list: readonly Totals[], divisor: number): Totals {
  if (!Number.isFinite(divisor) || divisor <= 0) return emptyTotals();
  const s = sumTotals(list);
  return roundTotals({ kcal: s.kcal / divisor, protein: s.protein / divisor, carbs: s.carbs / divisor, fat: s.fat / divisor });
}

export interface MacroTarget {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Target − eaten (may be negative when the user is over). */
export function remaining(target: MacroTarget, eaten: Totals): Totals {
  return roundTotals({
    kcal: num(target?.calories) - num(eaten?.kcal),
    protein: num(target?.protein) - num(eaten?.protein),
    carbs: num(target?.carbs) - num(eaten?.carbs),
    fat: num(target?.fat) - num(eaten?.fat),
  });
}

export interface AdherenceDay {
  totals: Totals;
  logged: boolean;
}

/**
 * Share (0..1) of the *logged* days whose calories land within ±`tolerance` of `targetCalories`.
 * Unlogged days are excluded from both numerator and denominator — a week with two perfect days
 * and five blanks scores 1, and `daysLogged` tells the rest of the story.
 */
export function adherence(days: readonly AdherenceDay[], targetCalories: number, tolerance = 0.1): number {
  if (!Number.isFinite(targetCalories) || targetCalories <= 0) return 0;
  const logged = days.filter((d) => d.logged);
  if (logged.length === 0) return 0;
  const lo = targetCalories * (1 - tolerance);
  const hi = targetCalories * (1 + tolerance);
  const hits = logged.filter((d) => num(d.totals?.kcal) >= lo && num(d.totals?.kcal) <= hi).length;
  return round(hits / logged.length, 3);
}
