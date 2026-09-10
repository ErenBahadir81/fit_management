/**
 * Meal vocabulary for the nutrition feature: order, Turkish labels, icons and the
 * time-of-day default the sheets pre-select. Pure — tested in `meals.test.ts`.
 */
import type { Meal } from "@fitfloow/core";
import type { IconName } from "../../../ui/Icon";

export const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"] as const satisfies readonly Meal[];

export const MEAL_LABEL: Record<Meal, string> = {
  breakfast: "Kahvaltı",
  lunch: "Öğle",
  dinner: "Akşam",
  snack: "Ara öğün",
};

export const MEAL_ICON: Record<Meal, IconName> = {
  breakfast: "sunny-outline",
  lunch: "restaurant-outline",
  dinner: "moon-outline",
  snack: "cafe-outline",
};

/**
 * The meal a log defaults to at `hour` (Türkiye time): breakfast until 10:30-ish, lunch until 15,
 * dinner from 17 to 22, snack for the gaps (mid-afternoon and late night).
 */
export function mealForHour(hour: number): Meal {
  const h = Number.isFinite(hour) ? Math.floor(hour) : 12;
  if (h >= 4 && h < 11) return "breakfast";
  if (h >= 11 && h < 15) return "lunch";
  if (h >= 17 && h < 23) return "dinner";
  return "snack";
}
