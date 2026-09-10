import type { DietTargetDTO, NutritionDayView } from "@fitfloow/core";
import {
  addEntryToDay,
  allEntries,
  calorieRatio,
  calorieTone,
  emptyDay,
  macroRows,
  makeOptimisticEntry,
  previewTotals,
  removeEntryFromDay,
  replaceEntryInDay,
  updateEntryInDay,
} from "./day";
import { mealForHour, MEAL_LABEL, MEAL_ORDER } from "./meals";

const target: DietTargetDTO = { mode: "auto", calories: 2000, protein: 150, carbs: 200, fat: 65, derivedFrom: "goal" };
const chicken = { kcal: 165, protein: 31, carbs: 0, fat: 3.6 };
const bread = { kcal: 247, protein: 13, carbs: 41, fat: 3.4 };

function dayWith(): NutritionDayView {
  const base = emptyDay("2026-09-10", target);
  return addEntryToDay(base, makeOptimisticEntry({ dateKey: "2026-09-10", meal: "lunch", name: "Tavuk", grams: 200, per100g: chicken, foodId: "f_tavuk" }));
}

describe("day maths", () => {
  test("an empty day is fully remaining", () => {
    const d = emptyDay("2026-09-10", target);
    expect(d.totals).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
    expect(d.remaining).toEqual({ kcal: 2000, protein: 150, carbs: 200, fat: 65 });
    expect(MEAL_ORDER.every((m) => d.meals[m].length === 0)).toBe(true);
  });

  test("adding an entry updates the meal totals, the day totals and what is left", () => {
    const d = dayWith();
    expect(d.meals.lunch).toHaveLength(1);
    expect(d.mealTotals.lunch.kcal).toBe(330);
    expect(d.totals).toEqual({ kcal: 330, protein: 62, carbs: 0, fat: 7.2 });
    expect(d.remaining.kcal).toBe(1670);
    expect(d.remaining.protein).toBe(88);
  });

  test("editing grams recomputes only that entry and the sums", () => {
    const d = dayWith();
    const id = d.meals.lunch[0].id;
    const next = updateEntryInDay(d, id, { grams: 100 });
    expect(next.meals.lunch[0].grams).toBe(100);
    expect(next.meals.lunch[0].totals.kcal).toBe(165);
    expect(next.totals.kcal).toBe(165);
    expect(next.remaining.kcal).toBe(1835);
  });

  test("moving an entry to another meal keeps the day total but moves the meal total", () => {
    const d = dayWith();
    const id = d.meals.lunch[0].id;
    const next = updateEntryInDay(d, id, { meal: "dinner" });
    expect(next.meals.lunch).toHaveLength(0);
    expect(next.meals.dinner).toHaveLength(1);
    expect(next.mealTotals.dinner.kcal).toBe(330);
    expect(next.totals.kcal).toBe(330);
  });

  test("removing an entry rolls the totals back; unknown ids are a no-op", () => {
    const d = dayWith();
    const id = d.meals.lunch[0].id;
    expect(removeEntryFromDay(d, id).totals.kcal).toBe(0);
    expect(updateEntryInDay(d, "nope", { grams: 10 })).toBe(d);
    expect(removeEntryFromDay(d, "nope").totals.kcal).toBe(330);
  });

  test("the server's entry replaces the optimistic one in place", () => {
    const d = dayWith();
    const temp = d.meals.lunch[0];
    const server = { ...temp, id: "me_real", source: "search" as const };
    const next = replaceEntryInDay(d, temp.id, server);
    expect(next.meals.lunch).toHaveLength(1);
    expect(next.meals.lunch[0].id).toBe("me_real");
    expect(next.totals.kcal).toBe(330);
  });

  test("entries from several meals are listed in meal order", () => {
    let d = dayWith();
    d = addEntryToDay(d, makeOptimisticEntry({ dateKey: "2026-09-10", meal: "breakfast", name: "Ekmek", grams: 60, per100g: bread }));
    expect(allEntries(d).map((e) => e.name)).toEqual(["Ekmek", "Tavuk"]);
  });

  test("the ring clamps but the tone tells the truth about going over", () => {
    expect(calorieRatio(1000, 2000)).toBe(0.5);
    expect(calorieRatio(4000, 2000)).toBe(1);
    expect(calorieRatio(100, 0)).toBe(0);
    expect(calorieTone(1000, 2000)).toBe("primary");
    expect(calorieTone(1900, 2000)).toBe("success");
    expect(calorieTone(2050, 2000)).toBe("warning");
    expect(calorieTone(2400, 2000)).toBe("danger");
  });

  test("macro rows come out in a fixed order with clamped bar values", () => {
    const rows = macroRows({ kcal: 330, protein: 62, carbs: 0, fat: 7.2 }, target);
    expect(rows.map((r) => r.key)).toEqual(["protein", "carbs", "fat"]);
    expect(rows[0].value).toBeCloseTo(62 / 150, 3);
    expect(macroRows({ kcal: 0, protein: 300, carbs: 0, fat: 0 }, target)[0].value).toBe(1);
  });

  test("previewTotals is the grams stepper's live number", () => {
    expect(previewTotals(chicken, 150)).toEqual({ kcal: 248, protein: 46.5, carbs: 0, fat: 5.4 });
    expect(previewTotals(chicken, 0)).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe("meals", () => {
  test("the default meal follows the clock", () => {
    expect(mealForHour(8)).toBe("breakfast");
    expect(mealForHour(13)).toBe("lunch");
    expect(mealForHour(16)).toBe("snack");
    expect(mealForHour(20)).toBe("dinner");
    expect(mealForHour(2)).toBe("snack");
    expect(mealForHour(NaN)).toBe("lunch");
  });

  test("every meal has a Turkish label", () => {
    expect(MEAL_ORDER.map((m) => MEAL_LABEL[m])).toEqual(["Kahvaltı", "Öğle", "Akşam", "Ara öğün"]);
  });
});
