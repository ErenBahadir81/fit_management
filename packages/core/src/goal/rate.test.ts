import { describe, expect, it } from "vitest";
import { DEFAULT_GOAL_SETTINGS } from "../schemas/settings";
import { dailyTargetFor, rateBandFor, safeWeeklyRate } from "./rate";
import { bmrFor, leannessBandFor, macrosFor, tdeeFor } from "./tdee";

const S = DEFAULT_GOAL_SETTINGS;

describe("rateBandFor", () => {
  it("selects by sex and body fat with bfMax exclusive", () => {
    expect(rateBandFor("male", 10, S.rateTable)).toMatchObject({ bfMin: 8, bfMax: 12 });
    expect(rateBandFor("male", 8, S.rateTable)).toMatchObject({ bfMin: 8, bfMax: 12 });
    // boundary value belongs to the band that starts there (previous band's bfMax is exclusive)
    expect(rateBandFor("male", 12, S.rateTable)).toMatchObject({ bfMin: 12, bfMax: 15 });
    expect(rateBandFor("female", 24, S.rateTable)).toMatchObject({ bfMin: 24, bfMax: 28 });
    expect(rateBandFor("female", 23.9, S.rateTable)).toMatchObject({ bfMin: 20, bfMax: 24 });
  });

  it("clamps below the first and above the last band", () => {
    expect(rateBandFor("male", -3, S.rateTable)).toMatchObject({ bfMin: 0, bfMax: 8 });
    expect(rateBandFor("male", 100, S.rateTable)).toMatchObject({ bfMin: 40, bfMax: 100 });
    expect(rateBandFor("female", 140, S.rateTable)).toMatchObject({ bfMin: 50, bfMax: 100 });
  });
});

describe("safeWeeklyRate — four caps, smallest wins", () => {
  it("103 kg @ 10 % male optimal → Alpert cap binds at ~0.487 kg/wk", () => {
    const r = safeWeeklyRate({ sex: "male", weightKg: 103, fatMassKg: 10.3, bodyFatPct: 10, tdee: 3677, profile: "optimal", settings: S });
    expect(r.caps.table).toBeCloseTo(0.515, 4);
    expect(r.caps.absolute).toBe(0.7);
    expect(r.caps.alpert).toBeCloseTo(0.486675, 5);
    expect(r.caps.relative).toBeCloseTo(1.0028, 3);
    expect(r.rateKgPerWeek).toBeCloseTo(0.4867, 3);
    expect(r.limitedBy).toBe("alpert");
  });

  it("very lean 70 kg @ 6 % → Alpert (0.198) beats the table rate (0.245)", () => {
    const r = safeWeeklyRate({ sex: "male", weightKg: 70, fatMassKg: 4.2, bodyFatPct: 6, tdee: 2776, profile: "optimal", settings: S });
    expect(r.caps.table).toBeCloseTo(0.245, 4);
    expect(r.caps.alpert).toBeCloseTo(0.19845, 5);
    expect(r.limitedBy).toBe("alpert");
    expect(r.rateKgPerWeek).toBeCloseTo(0.1985, 3);
  });

  it("obese user is limited by the absolute ceiling or the relative-to-TDEE cap", () => {
    const r = safeWeeklyRate({ sex: "male", weightKg: 140, fatMassKg: 49, bodyFatPct: 35, tdee: 2900, profile: "aggressive", settings: S });
    expect(r.caps.table).toBeCloseTo(1.82, 4); // 1.3 % of 140
    expect(r.caps.absolute).toBe(1.25);
    expect(r.caps.relative).toBeCloseTo((0.3 * 2900 * 7) / 7700, 4);
    expect(r.limitedBy).toBe("relative");
    expect(r.rateKgPerWeek).toBeCloseTo(0.7909, 3);
  });

  it("respects the profile (conservative < optimal < aggressive)", () => {
    const mk = (profile: "conservative" | "optimal" | "aggressive") =>
      safeWeeklyRate({ sex: "male", weightKg: 90, fatMassKg: 18, bodyFatPct: 20, tdee: 2800, profile, settings: S }).caps.table;
    expect(mk("conservative")).toBeCloseTo(0.45, 4);
    expect(mk("optimal")).toBeCloseTo(0.72, 4);
    expect(mk("aggressive")).toBeCloseTo(0.99, 4);
  });
});

describe("bmr / tdee", () => {
  it("Katch-McArdle only when age is unknown", () => {
    const r = bmrFor({ sex: "male", weightKg: 103, heightCm: 186, leanMassKg: 92.7, age: null, settings: S });
    expect(r.katch).toBeCloseTo(370 + 21.6 * 92.7, 4);
    expect(r.mifflin).toBeNull();
    expect(r.bmr).toBeCloseTo(r.katch, 4);
  });

  it("blends Katch and Mifflin 50/50 when age is known", () => {
    const r = bmrFor({ sex: "male", weightKg: 103, heightCm: 186, leanMassKg: 92.7, age: 34, settings: S });
    const mifflin = 10 * 103 + 6.25 * 186 - 5 * 34 + 5;
    expect(r.mifflin).toBeCloseTo(mifflin, 4);
    expect(r.bmr).toBeCloseTo(0.5 * r.katch + 0.5 * mifflin, 4);
  });

  it("female Mifflin constant is −161", () => {
    const r = bmrFor({ sex: "female", weightKg: 60, heightCm: 165, leanMassKg: 44, age: 30, settings: S });
    expect(r.mifflin).toBeCloseTo(10 * 60 + 6.25 * 165 - 5 * 30 - 161, 4);
  });

  it("tdeeFor multiplies by the activity multiplier", () => {
    expect(tdeeFor(2000, "moderate", S)).toBeCloseTo(3100, 4);
    expect(tdeeFor(2000, "sedentary", S)).toBeCloseTo(2400, 4);
  });
});

describe("leanness bands and macros", () => {
  it("bands split on the admin thresholds", () => {
    expect(leannessBandFor("male", 10, S)).toBe("lean");
    expect(leannessBandFor("male", 15, S)).toBe("mid");
    expect(leannessBandFor("male", 25, S)).toBe("high");
    expect(leannessBandFor("female", 23.9, S)).toBe("lean");
    expect(leannessBandFor("female", 35, S)).toBe("high");
  });

  it("protein uses the per-kg-lean band value, floored by g/kg bodyweight", () => {
    const m = macrosFor({ sex: "male", weightKg: 103, leanMassKg: 92.7, bodyFatPct: 10, dailyCalories: 3000, settings: S });
    expect(m.protein).toBe(Math.round(3.0 * 92.7)); // lean band → 3 g/kg lean = 278 g > 1.6 × 103
    expect(m.fat).toBe(Math.round((0.25 * 3000) / 9));
    expect(m.calories).toBe(3000);
    const carbs = (3000 - 4 * 278.1 - 9 * ((0.25 * 3000) / 9)) / 4;
    expect(m.carbs).toBe(Math.round(carbs));
  });

  it("floors carbs at 50 g", () => {
    const m = macrosFor({ sex: "male", weightKg: 103, leanMassKg: 92.7, bodyFatPct: 10, dailyCalories: 1500, settings: S });
    expect(m.carbs).toBe(50);
  });
});

describe("dailyTargetFor", () => {
  it("subtracts the weekly deficit spread over 7 days", () => {
    const r = dailyTargetFor({ rateKgPerWeek: 0.5, tdee: 3000, bmr: 1900, sex: "male", settings: S });
    expect(r.floorLimited).toBe(false);
    expect(r.dailyCalorieTarget).toBe(Math.round(3000 - (0.5 * 7700) / 7));
    expect(r.weeklyDeficitKcal).toBeCloseTo(3850, 0);
  });

  it("female 55 kg sedentary aggressive → floor limited and the rate is reduced", () => {
    const bmr = bmrFor({ sex: "female", weightKg: 55, heightCm: 165, leanMassKg: 38.5, age: null, settings: S });
    const tdee = tdeeFor(bmr.bmr, "sedentary", S);
    const rate = safeWeeklyRate({ sex: "female", weightKg: 55, fatMassKg: 16.5, bodyFatPct: 30, tdee, profile: "aggressive", settings: S });
    const day = dailyTargetFor({ rateKgPerWeek: rate.rateKgPerWeek, tdee, bmr: bmr.bmr, sex: "female", settings: S });
    expect(day.floorLimited).toBe(true);
    expect(day.floor).toBeCloseTo(bmr.bmr, 2); // BMR floor beats the 1200 kcal absolute floor here
    expect(day.dailyCalorieTarget).toBe(Math.round(bmr.bmr));
    expect(day.rateKgPerWeek).toBeLessThan(rate.rateKgPerWeek);
    expect(day.rateKgPerWeek).toBeCloseTo(0.218, 2);
  });

  it("never returns a negative rate", () => {
    const r = dailyTargetFor({ rateKgPerWeek: 2, tdee: 1400, bmr: 1400, sex: "female", settings: S });
    expect(r.rateKgPerWeek).toBe(0);
    expect(r.floorLimited).toBe(true);
  });
});
