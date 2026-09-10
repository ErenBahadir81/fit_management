import { describe, expect, it } from "vitest";
import { DEFAULT_GOAL_SETTINGS } from "../schemas/settings";
import { shiftKey } from "../time/index";
import { computeGoalPlan } from "./plan";

const S = DEFAULT_GOAL_SETTINGS;

const eren = {
  sex: "male" as const,
  weightKg: 103,
  bodyFatPct: 10,
  heightCm: 186,
  age: null,
  activityLevel: "moderate" as const,
  targetBodyFatPct: 7,
  profile: "optimal" as const,
  startDate: "2026-09-06",
  settings: S,
};

describe("computeGoalPlan — step 1–3 body composition and energy", () => {
  it("worked example: 103 kg @ 10 % → 7 % needs 3.32 kg of fat", () => {
    const p = computeGoalPlan(eren);
    expect(p.fatMassKg).toBeCloseTo(10.3, 2);
    expect(p.leanMassKg).toBeCloseTo(92.7, 2);
    expect(p.targetWeightKg).toBeCloseTo(99.68, 2);
    expect(p.fatToLoseKg).toBeCloseTo(3.32, 2);
    expect(p.totalDeficitKcal).toBe(25584);
    expect(p.avgWeightKg).toBeCloseTo((103 + 99.677419) / 2, 2);
    expect(p.pctChange).toBeGreaterThan(3);
  });

  it("second reference: 80 kg @ 25 % → 15 % needs 9.41 kg", () => {
    const p = computeGoalPlan({ ...eren, weightKg: 80, bodyFatPct: 25, targetBodyFatPct: 15 });
    expect(p.fatToLoseKg).toBeCloseTo(9.41, 2);
    expect(p.targetWeightKg).toBeCloseTo(70.59, 2);
  });

  it("target at or above current body fat → 0 kg and TARGET_ABOVE_CURRENT", () => {
    const p = computeGoalPlan({ ...eren, targetBodyFatPct: 12 });
    expect(p.fatToLoseKg).toBe(0);
    expect(p.totalLossKg).toBe(0);
    expect(p.roadmap).toHaveLength(0);
    expect(p.estimatedWeeks).toBe(0);
    expect(p.targetDate).toBe("2026-09-06");
    expect(p.warnings).toContain("TARGET_ABOVE_CURRENT");
    // maintenance macros are still useful
    expect(p.initialDailyCalorieTarget).toBe(Math.round(p.tdee));
    expect(p.initialRateKgPerWeek).toBe(0);
  });

  it("warns when the target is below essential fat", () => {
    expect(computeGoalPlan({ ...eren, targetBodyFatPct: 4 }).warnings).toContain("TARGET_TOO_LOW");
    expect(computeGoalPlan({ ...eren, sex: "female", bodyFatPct: 26, targetBodyFatPct: 11 }).warnings).toContain("TARGET_TOO_LOW");
  });
});

describe("computeGoalPlan — energy expenditure", () => {
  it("uses Katch when age is unknown and honours tdeeOverride", () => {
    const p = computeGoalPlan(eren);
    expect(p.bmr).toBeCloseTo(370 + 21.6 * 92.7, 1);
    expect(p.bmrMifflin).toBeNull();
    expect(p.tdeeFormula).toBeCloseTo(p.bmr * 1.55, 1);
    expect(p.tdee).toBeCloseTo(p.tdeeFormula, 1);

    const o = computeGoalPlan({ ...eren, tdeeOverride: 3200 });
    expect(o.tdee).toBe(3200);
    expect(o.tdeeFormula).toBeCloseTo(p.tdeeFormula, 1);
  });
});

describe("computeGoalPlan — step 4/6 first week", () => {
  it("Alpert cap binds for the worked example and the daily target follows", () => {
    const p = computeGoalPlan(eren);
    expect(p.initialRateKgPerWeek).toBeCloseTo(0.4867, 3);
    expect(p.warnings).toContain("ALPERT_LIMITED");
    expect(p.initialDailyCalorieTarget).toBe(3142);
    expect(p.macros.protein).toBe(Math.round(3.0 * 92.7));
    expect(p.roadmap[0].weeklyDeficitKcal).toBe(3746);
  });

  it("female 55 kg sedentary aggressive is FLOOR_LIMITED", () => {
    const p = computeGoalPlan({
      ...eren,
      sex: "female",
      weightKg: 55,
      heightCm: 165,
      bodyFatPct: 30,
      targetBodyFatPct: 24,
      activityLevel: "sedentary",
      profile: "aggressive",
    });
    expect(p.warnings).toContain("FLOOR_LIMITED");
    expect(p.initialDailyCalorieTarget).toBe(Math.round(p.bmr));
    expect(p.initialRateKgPerWeek).toBeLessThan(0.3);
  });
});

describe("computeGoalPlan — step 7 roadmap", () => {
  it("is monotonic and ends at the target body fat", () => {
    const p = computeGoalPlan(eren);
    expect(p.roadmap.length).toBeGreaterThan(3);
    expect(p.estimatedWeeks).toBe(p.roadmap.length);
    for (let i = 0; i < p.roadmap.length; i++) {
      const w = p.roadmap[i];
      expect(w.weekIndex).toBe(i + 1);
      expect(w.endWeightKg).toBeLessThan(w.startWeightKg);
      expect(w.endBfPct).toBeLessThan(w.startBfPct);
      if (i > 0) {
        expect(w.startWeightKg).toBeCloseTo(p.roadmap[i - 1].endWeightKg, 2);
        expect(w.startBfPct).toBeCloseTo(p.roadmap[i - 1].endBfPct, 2);
      }
    }
    const last = p.roadmap[p.roadmap.length - 1];
    expect(last.endBfPct).toBeCloseTo(7, 1);
    expect(p.roadmap[0].startKey).toBe("2026-09-06");
  });

  it("dates advance one week at a time and targetDate = start + 7 × weeks", () => {
    const p = computeGoalPlan(eren);
    expect(p.roadmap[0].startKey).toBe("2026-09-06");
    expect(p.roadmap[0].endKey).toBe("2026-09-12");
    expect(p.roadmap[1].startKey).toBe("2026-09-13");
    expect(p.targetDate).toBe(shiftKey("2026-09-06", 7 * p.estimatedWeeks));
    expect(shiftKey(p.roadmap[p.roadmap.length - 1].endKey, 1)).toBe(p.targetDate);
  });

  it("lean dieters lose more than pure fat (fatFractionOfLoss 0.8)", () => {
    const p = computeGoalPlan(eren);
    const sum = p.roadmap.reduce((a, w) => a + w.rateKgPerWeek, 0);
    expect(p.totalLossKg).toBeCloseTo(sum, 2);
    expect(p.totalLossKg).toBeGreaterThan(p.fatToLoseKg);
  });

  it("high body-fat dieters keep lean mass, so the losses sum to fatToLose", () => {
    const p = computeGoalPlan({ ...eren, weightKg: 100, bodyFatPct: 30, targetBodyFatPct: 26 });
    expect(p.fatToLoseKg).toBeCloseTo(5.41, 2);
    const sum = p.roadmap.reduce((a, w) => a + w.rateKgPerWeek, 0);
    expect(sum).toBeCloseTo(p.fatToLoseKg, 2);
    const last = p.roadmap[p.roadmap.length - 1];
    expect(last.endWeightKg).toBeCloseTo(p.targetWeightKg, 1);
  });

  it("cumulative deficit grows monotonically", () => {
    const p = computeGoalPlan(eren);
    let prev = 0;
    for (const w of p.roadmap) {
      expect(w.cumulativeDeficitKcal).toBeGreaterThan(prev);
      expect(w.cumulativeDeficitKcal).toBeCloseTo(prev + w.weeklyDeficitKcal, 0);
      prev = w.cumulativeDeficitKcal;
    }
  });

  it("applies a-priori adaptation only when there is no tdeeOverride", () => {
    const adapt = computeGoalPlan({ ...eren, weightKg: 100, bodyFatPct: 30, targetBodyFatPct: 20 });
    const tdeeOf = (w: { dailyCalorieTarget: number; weeklyDeficitKcal: number }) => w.dailyCalorieTarget + w.weeklyDeficitKcal / 7;
    expect(tdeeOf(adapt.roadmap[3])).toBeLessThan(tdeeOf(adapt.roadmap[0]));

    const fixed = computeGoalPlan({ ...eren, weightKg: 100, bodyFatPct: 30, targetBodyFatPct: 20, tdeeOverride: 2900 });
    for (const w of fixed.roadmap) expect(tdeeOf(w)).toBeCloseTo(2900, 0);
  });

  it("caps the horizon at settings.maxWeeks and warns LONG_HORIZON", () => {
    const capped = computeGoalPlan({ ...eren, weightKg: 120, bodyFatPct: 38, targetBodyFatPct: 8, settings: { ...S, maxWeeks: 12 } });
    expect(capped.roadmap).toHaveLength(12);
    expect(capped.warnings).toContain("LONG_HORIZON");

    const long = computeGoalPlan({ ...eren, weightKg: 120, bodyFatPct: 40, targetBodyFatPct: 6 });
    expect(long.estimatedWeeks).toBeGreaterThan(52);
    expect(long.warnings).toContain("LONG_HORIZON");
  });

  it("is deterministic", () => {
    expect(computeGoalPlan(eren)).toEqual(computeGoalPlan(eren));
  });
});
