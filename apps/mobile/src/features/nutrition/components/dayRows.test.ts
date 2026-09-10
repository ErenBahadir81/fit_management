import type { DietTargetDTO } from "@fitfloow/core";
import { adherencePct } from "../WeekView";
import { addEntryToDay, emptyDay, makeOptimisticEntry } from "../model/day";
import { validateDraft } from "../sheets/CustomFoodForm";
import { buildDayRows } from "./dayRows";

const target: DietTargetDTO = { mode: "auto", calories: 2000, protein: 150, carbs: 200, fat: 65, derivedFrom: "goal" };

describe("buildDayRows", () => {
  test("an empty day is four sections of header + empty + add", () => {
    const rows = buildDayRows(emptyDay("2026-09-10", target));
    expect(rows).toHaveLength(12);
    expect(rows.slice(0, 3).map((r) => r.kind)).toEqual(["mealHeader", "empty", "add"]);
    expect(rows.filter((r) => r.kind === "mealHeader").map((r) => r.meal)).toEqual(["breakfast", "lunch", "dinner", "snack"]);
  });

  test("entries replace the empty row and keep unique keys", () => {
    const day = addEntryToDay(emptyDay("2026-09-10", target), makeOptimisticEntry({ dateKey: "2026-09-10", meal: "lunch", name: "Tavuk", grams: 150, per100g: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 } }));
    const rows = buildDayRows(day);
    const lunch = rows.slice(rows.findIndex((r) => r.kind === "mealHeader" && r.meal === "lunch"), rows.findIndex((r) => r.kind === "add" && r.meal === "lunch") + 1);
    expect(lunch.map((r) => r.kind)).toEqual(["mealHeader", "entry", "add"]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  test("no day yet → no rows (the skeleton is showing)", () => {
    expect(buildDayRows(undefined)).toEqual([]);
  });
});

describe("adherencePct", () => {
  test("accepts both 0..1 and 0..100 shapes", () => {
    expect(adherencePct(0.72)).toBe(72);
    expect(adherencePct(72)).toBe(72);
    expect(adherencePct(1)).toBe(100);
    expect(adherencePct(0)).toBe(0);
    expect(adherencePct(Number.NaN)).toBe(0);
  });
});

describe("custom food validation", () => {
  const base = { name: "Ev köftesi", kcal: "220", protein: "18", carbs: "6", fat: "14" };

  test("accepts a complete draft and normalises the tr-TR comma", () => {
    const ok = validateDraft({ ...base, protein: "18,5" });
    expect(ok).toEqual({ name: "Ev köftesi", per100g: { kcal: 220, protein: 18.5, carbs: 6, fat: 14 } });
  });

  test("blank macros default to zero but calories are required", () => {
    expect(validateDraft({ ...base, protein: "", carbs: "", fat: "" })).toMatchObject({ per100g: { protein: 0, carbs: 0, fat: 0 } });
    expect(validateDraft({ ...base, kcal: "" })).toEqual({ error: expect.stringContaining("kalori") });
  });

  test("rejects an empty name and out-of-range values", () => {
    expect(validateDraft({ ...base, name: "a" })).toEqual({ error: "Bir isim yaz" });
    expect(validateDraft({ ...base, kcal: "1200" })).toEqual({ error: expect.stringContaining("0–900") });
    expect(validateDraft({ ...base, fat: "140" })).toEqual({ error: expect.stringContaining("0–100") });
    expect(validateDraft({ ...base, carbs: "abc" })).toEqual({ error: expect.stringContaining("0–100") });
  });
});
