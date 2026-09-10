/**
 * Pure day-view maths: the numbers the calorie hero shows and the cache transforms every optimistic
 * mutation applies. All arithmetic comes from `@fitfloow/core` so the client can never drift from
 * what the API would have answered.
 */
import { clamp, entryTotals, remaining as remainingOf, sumTotals, type DietTargetDTO, type Meal, type MealEntryDTO, type NutritionDayView, type Per100g, type Totals } from "@fitfloow/core";
import type { Tone } from "../../../theme/tokens";
import { MEAL_ORDER } from "./meals";

export type MacroKey = "protein" | "carbs" | "fat";

export const MACRO_LABEL: Record<MacroKey, string> = { protein: "Protein", carbs: "Karbonhidrat", fat: "Yağ" };
export const MACRO_TONE: Record<MacroKey, Tone> = { protein: "success", carbs: "primary", fat: "warning" };

/** Eaten ÷ target, clamped to 0..1 for the ring; `over` keeps the real story. */
export function calorieRatio(eaten: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return clamp(eaten / target, 0, 1);
}

/**
 * Ring/number colour: calm violet while there is room, green in the ±10 % landing zone,
 * amber just over, red when the day is clearly blown.
 */
export function calorieTone(eaten: number, target: number): Tone {
  if (!Number.isFinite(target) || target <= 0) return "neutral";
  const r = eaten / target;
  if (r > 1.1) return "danger";
  if (r > 1) return "warning";
  if (r >= 0.9) return "success";
  return "primary";
}

export interface MacroRow {
  key: MacroKey;
  label: string;
  eaten: number;
  target: number;
  value: number;
  tone: Tone;
}

/** The three macro bars under the ring, in a fixed order. */
export function macroRows(totals: Totals, target: DietTargetDTO): MacroRow[] {
  return (["protein", "carbs", "fat"] as MacroKey[]).map((key) => {
    const eaten = totals[key] ?? 0;
    const t = target[key] ?? 0;
    return { key, label: MACRO_LABEL[key], eaten, target: t, value: t > 0 ? clamp(eaten / t, 0, 1) : 0, tone: MACRO_TONE[key] };
  });
}

/** kcal/macros of `grams` of a food — the live preview in every grams stepper. */
export function previewTotals(per100g: Per100g, grams: number): Totals {
  return entryTotals(grams, per100g);
}

/** Recompute mealTotals / totals / remaining from the entries — the single place the day is summed. */
export function recomputeDay(day: NutritionDayView): NutritionDayView {
  const mealTotals = { ...day.mealTotals };
  const all: Totals[] = [];
  for (const meal of MEAL_ORDER) {
    const list = day.meals[meal] ?? [];
    mealTotals[meal] = sumTotals(list.map((e) => e.totals));
    all.push(...list.map((e) => e.totals));
  }
  const totals = sumTotals(all);
  return { ...day, mealTotals, totals, remaining: remainingOf(day.target, totals) };
}

export interface DraftEntry {
  dateKey: string;
  meal: Meal;
  name: string;
  grams: number;
  per100g: Per100g;
  foodId?: string | null;
  source?: MealEntryDTO["source"];
  scanId?: string | null;
}

let tmpSeq = 0;
/** A client-side entry that stands in for the server's until the write lands. */
export function makeOptimisticEntry(draft: DraftEntry, now: Date = new Date()): MealEntryDTO {
  return {
    id: `tmp_${++tmpSeq}`,
    dateKey: draft.dateKey,
    meal: draft.meal,
    foodId: draft.foodId ?? null,
    name: draft.name,
    grams: draft.grams,
    per100g: draft.per100g,
    totals: entryTotals(draft.grams, draft.per100g),
    source: draft.source ?? "search",
    scanId: draft.scanId ?? null,
    loggedAt: now.toISOString(),
  };
}

export function isOptimisticId(id: string): boolean {
  return id.startsWith("tmp_");
}

export function addEntryToDay(day: NutritionDayView, entry: MealEntryDTO): NutritionDayView {
  const meals = { ...day.meals, [entry.meal]: [...(day.meals[entry.meal] ?? []), entry] };
  return recomputeDay({ ...day, meals });
}

export function removeEntryFromDay(day: NutritionDayView, id: string): NutritionDayView {
  const meals = { ...day.meals };
  for (const meal of MEAL_ORDER) meals[meal] = (meals[meal] ?? []).filter((e) => e.id !== id);
  return recomputeDay({ ...day, meals });
}

/** Change grams (and optionally the meal) of one entry, recomputing its own totals too. */
export function updateEntryInDay(day: NutritionDayView, id: string, patch: { grams?: number; meal?: Meal }): NutritionDayView {
  let found: MealEntryDTO | null = null;
  const meals = { ...day.meals };
  for (const meal of MEAL_ORDER) {
    const list = meals[meal] ?? [];
    const hit = list.find((e) => e.id === id);
    if (!hit) continue;
    const grams = patch.grams ?? hit.grams;
    found = { ...hit, grams, totals: entryTotals(grams, hit.per100g), meal: patch.meal ?? hit.meal };
    meals[meal] = list.filter((e) => e.id !== id);
  }
  if (!found) return day;
  meals[found.meal] = [...(meals[found.meal] ?? []), found];
  return recomputeDay({ ...day, meals });
}

/** Replace a temp entry with the server's answer (same position). */
export function replaceEntryInDay(day: NutritionDayView, tempId: string, entry: MealEntryDTO): NutritionDayView {
  const meals = { ...day.meals };
  for (const meal of MEAL_ORDER) meals[meal] = (meals[meal] ?? []).filter((e) => e.id !== tempId);
  meals[entry.meal] = [...(meals[entry.meal] ?? []), entry];
  return recomputeDay({ ...day, meals });
}

/** Every entry of the day, in meal order — used by the "son kullanılanlar" and undo paths. */
export function allEntries(day: NutritionDayView): MealEntryDTO[] {
  return MEAL_ORDER.flatMap((m) => day.meals[m] ?? []);
}

/** An empty day for a date the API has not answered for yet (pager pre-fill). */
export function emptyDay(dateKey: string, target: DietTargetDTO): NutritionDayView {
  const zero: Totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  return {
    dateKey,
    target,
    totals: zero,
    remaining: remainingOf(target, zero),
    meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
    mealTotals: { breakfast: zero, lunch: zero, dinner: zero, snack: zero },
  };
}
