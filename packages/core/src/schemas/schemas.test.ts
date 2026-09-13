import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  DEFAULT_SETTINGS,
  patchOf,
  validateRateTable,
  zAdminUpdateUserInput,
  zBodyEntryInput,
  zBodyEntryUpdate,
  zFoodUpdate,
  zGoalUpdate,
  zCompleteWorkoutInput,
  zCreateMealEntryInput,
  zGoalInput,
  zLoginInput,
  zProgramInput,
  zSetEntry,
  zSettings,
  zUpdateMeInput,
  zUpdateWorkoutInput,
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
  it("patchOf makes every field optional and drops every default", () => {
    const create = z.object({
      name: z.string(),
      tags: z.array(z.string()).default([]),
      note: z.string().nullable().default(null),
      count: z.number().default(0).optional(),
      flag: z.boolean(),
    });
    const patch = patchOf(create);
    expect(patch.parse({})).toEqual({});
    expect(patch.parse({ name: "x" })).toEqual({ name: "x" });
    expect(patch.parse({ tags: ["a"], note: null })).toEqual({ tags: ["a"], note: null });
    // Validation itself is untouched — only the defaults go.
    expect(() => patch.parse({ count: "nope" })).toThrow();
    expect(() => patch.parse({ name: 3 })).toThrow();
  });
  it("no update schema smuggles in a create-schema default", () => {
    // `.partial()` makes fields optional but keeps their `.default()`s, so a PATCH of one field
    // would silently rewrite every other one. Any schema used as a PATCH body must parse {} to {}.
    for (const [name, schema] of [
      ["zBodyEntryUpdate", zBodyEntryUpdate],
      ["zFoodUpdate", zFoodUpdate],
      ["zGoalUpdate", zGoalUpdate],
      ["zAdminUpdateUserInput", zAdminUpdateUserInput],
      ["zUpdateMeInput", zUpdateMeInput],
      ["zUpdateWorkoutInput", zUpdateWorkoutInput],
    ] as const) {
      expect(schema.parse({}), name).toEqual({});
    }
  });
  it("a partial workout update touches only the fields that were sent", () => {
    // zod's .partial() does not strip .default(), so the naive version of this schema turned
    // `{rpe: 7}` into "wipe strength, run, swim, duration and notes".
    expect(zUpdateWorkoutInput.parse({ rpe: 7 })).toEqual({ rpe: 7 });
    expect(zUpdateWorkoutInput.parse({})).toEqual({});
    expect(zUpdateWorkoutInput.parse({ strength: [] }).strength).toEqual([]);
    expect(zUpdateWorkoutInput.parse({ notes: null })).toEqual({ notes: null });
  });
  it("a set logged before 2.1 has no load: weightKg reads as null, never 0", () => {
    expect(zSetEntry.parse({ reps: 8, rir: 2 })).toEqual({ reps: 8, rir: 2, weightKg: null });
    expect(zSetEntry.parse({ reps: 8, rir: 2, weightKg: 62.5 }).weightKg).toBe(62.5);
    expect(zSetEntry.parse({ reps: 8, rir: 2, weightKg: null }).weightKg).toBeNull();
    expect(() => zSetEntry.parse({ reps: 8, rir: 2, weightKg: -1 })).toThrow();
    expect(() => zSetEntry.parse({ reps: 8, rir: 2, weightKg: 1001 })).toThrow();
  });
  it("a pre-2.1 workout log still parses", () => {
    const legacy = {
      strength: [{ name: "Bench Press", sets: [{ reps: 8, rir: 2 }] }],
      durationMin: 55,
    };
    const parsed = zCompleteWorkoutInput.parse(legacy);
    expect(parsed.strength[0].sets[0]).toEqual({ reps: 8, rir: 2, weightKg: null });
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
