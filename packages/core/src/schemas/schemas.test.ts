import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  validateRateTable,
  zBodyEntryInput,
  zCompleteWorkoutInput,
  zCreateMealEntryInput,
  zGoalInput,
  zLoginInput,
  zProgramInput,
  zSettings,
  zUpdateMeInput,
  zWeighInInput,
} from "./index";

describe("schemas", () => {
  it("login lowercases username", () => {
    expect(zLoginInput.parse({ username: "Eren", password: "x" }).username).toBe("eren");
    expect(() => zLoginInput.parse({ username: "ab", password: "x" })).toThrow();
  });
  it("update-me rejects out-of-range weekday", () => {
    expect(() => zUpdateMeInput.parse({ measurementDay: 7 })).toThrow();
    expect(zUpdateMeInput.parse({ measurementDay: 6 })).toEqual({ measurementDay: 6 });
  });
  it("default settings are valid and rate table contiguous", () => {
    expect(() => zSettings.parse(DEFAULT_SETTINGS)).not.toThrow();
    expect(validateRateTable(DEFAULT_SETTINGS.goal.rateTable)).toEqual([]);
  });
  it("rate table validation reports gaps and order problems", () => {
    const bad = DEFAULT_SETTINGS.goal.rateTable.filter((b) => !(b.sex === "male" && b.bfMin === 15));
    const problems = validateRateTable(bad);
    expect(problems.some((p) => p.includes("boşluk"))).toBe(true);
  });
  it("program input applies defaults", () => {
    const p = zProgramInput.parse({
      days: [{ order: 1, title: "Push", kind: "strength", exercises: [{ name: "Push-up", targetSets: 5, targetReps: 12 }] }],
    });
    expect(p.days[0].run).toBeNull();
    expect(p.days[0].focus).toBe("");
  });
  it("complete workout defaults", () => {
    const c = zCompleteWorkoutInput.parse({});
    expect(c.strength).toEqual([]);
    expect(c.run).toBeNull();
  });
  it("body entry input ranges", () => {
    expect(() => zBodyEntryInput.parse({ heightCm: 178, neckCm: 38, waistCm: 84, weightKg: 10 })).toThrow();
    expect(zBodyEntryInput.parse({ heightCm: 178, neckCm: 38, waistCm: 84, weightKg: 80 }).weightKg).toBe(80);
    expect(() => zWeighInInput.parse({ weightKg: 80, dateKey: "2026-02-30" })).toThrow();
  });
  it("goal input defaults profile", () => {
    expect(zGoalInput.parse({ targetBodyFatPct: 7 }).profile).toBe("optimal");
  });
  it("meal entry requires exactly one of foodId/custom", () => {
    expect(() => zCreateMealEntryInput.parse({ meal: "lunch", grams: 100 })).toThrow();
    expect(() =>
      zCreateMealEntryInput.parse({
        meal: "lunch",
        grams: 100,
        foodId: "a",
        custom: { name: "x", per100g: { kcal: 1, protein: 0, carbs: 0, fat: 0 } },
      })
    ).toThrow();
    expect(zCreateMealEntryInput.parse({ meal: "lunch", grams: 100, foodId: "abc" }).source).toBe("search");
  });
});
