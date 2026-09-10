/** The day view flattened into list rows (header · entries · add) so one FlashList renders it all. */
import type { Meal, MealEntryDTO, NutritionDayView, Totals } from "@fitfloow/core";
import { MEAL_ORDER } from "../model/meals";

export type DayRow =
  | { kind: "mealHeader"; key: string; meal: Meal; totals: Totals; count: number }
  | { kind: "entry"; key: string; meal: Meal; entry: MealEntryDTO }
  | { kind: "empty"; key: string; meal: Meal }
  | { kind: "add"; key: string; meal: Meal };

export function buildDayRows(day: NutritionDayView | undefined): DayRow[] {
  if (!day) return [];
  const rows: DayRow[] = [];
  for (const meal of MEAL_ORDER) {
    const entries = day.meals[meal] ?? [];
    rows.push({ kind: "mealHeader", key: `h-${meal}`, meal, totals: day.mealTotals[meal], count: entries.length });
    if (entries.length === 0) rows.push({ kind: "empty", key: `e-${meal}`, meal });
    else for (const entry of entries) rows.push({ kind: "entry", key: entry.id, meal, entry });
    rows.push({ kind: "add", key: `a-${meal}`, meal });
  }
  return rows;
}
