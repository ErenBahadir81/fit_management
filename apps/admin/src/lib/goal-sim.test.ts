import { describe, expect, it } from "vitest";
import { DEFAULT_GOAL_SETTINGS, shiftKey, type GoalSettings } from "@fitfloow/core";
import { computeGoalPlan, rateForState, type GoalSimInput } from "./goal-sim";

/* These cases pin the contract the admin simulator depends on; the maths itself now lives
   in @fitfloow/core (goal engine), so a change there fails here first. */

const base: GoalSimInput = {
  sex: "male",
  weightKg: 103,
  bodyFatPct: 10,
  heightCm: 183,
  age: null,
  activityLevel: "moderate",
  targetBodyFatPct: 7,
  profile: "optimal",
  startKey: "2026-09-10",
  settings: DEFAULT_GOAL_SETTINGS,
};

describe("computeGoalPlan — body composition", () => {
  it("derives fat to lose with lean mass preserved (103 kg @ 10 % → 7 %)", () => {
    const plan = computeGoalPlan(base);
    expect(plan.fatToLoseKg).toBeCloseTo(3.32, 2);
    expect(plan.targetWeightKg).toBeCloseTo(99.68, 2);
    expect(plan.leanMassKg).toBeCloseTo(92.7, 2);
    expect(plan.fatMassKg).toBeCloseTo(10.3, 2);
  });

  it("derives fat to lose for 80 kg @ 25 % → 15 %", () => {
    const plan = computeGoalPlan({ ...base, weightKg: 80, bodyFatPct: 25, targetBodyFatPct: 15 });
    expect(plan.fatToLoseKg).toBeCloseTo(9.41, 2);
  });

  it("warns and produces an empty roadmap when the target is at or above current", () => {
    const plan = computeGoalPlan({ ...base, targetBodyFatPct: 12 });
    expect(plan.warnings).toContain("TARGET_ABOVE_CURRENT");
    expect(plan.fatToLoseKg).toBe(0);
    expect(plan.roadmap).toHaveLength(0);
    expect(plan.estimatedWeeks).toBe(0);
  });

  it("warns when the target crosses the essential-fat floor", () => {
    const plan = computeGoalPlan({ ...base, targetBodyFatPct: 4 });
    expect(plan.warnings).toContain("TARGET_TOO_LOW");
  });

  it("computes total deficit from kcalPerKgFat", () => {
    const plan = computeGoalPlan(base);
    expect(plan.totalDeficitKcal).toBeCloseTo(3.3226 * 7700, 0);
  });
});

describe("rateForState — the smallest cap wins", () => {
  it("Alpert caps a very lean dieter (103 kg @ 10 % → 0.49 kg/week)", () => {
    const r = rateForState({
      sex: "male",
      weightKg: 103,
      fatMassKg: 10.3,
      bodyFatPct: 10,
      tdee: 3677,
      profile: "optimal",
      settings: DEFAULT_GOAL_SETTINGS,
    });
    expect(r.rateKgPerWeek).toBeCloseTo(0.49, 2);
    expect(r.limitedBy).toBe("alpert");
  });

  it("the rate table binds for an average dieter", () => {
    const r = rateForState({
      sex: "male",
      weightKg: 95,
      fatMassKg: 95 * 0.22,
      bodyFatPct: 22,
      tdee: 2900,
      profile: "optimal",
      settings: DEFAULT_GOAL_SETTINGS,
    });
    // band 20–25 optimal 0.8 %/wk → 0.76 kg, below maxKgPerWeek 1.0
    expect(r.rateKgPerWeek).toBeCloseTo(0.76, 2);
    expect(r.limitedBy).toBe("table");
  });

  it("the absolute band cap binds when the percentage overshoots it", () => {
    const r = rateForState({
      sex: "male",
      weightKg: 160,
      fatMassKg: 160 * 0.42,
      bodyFatPct: 42,
      tdee: 4200,
      profile: "aggressive",
      settings: DEFAULT_GOAL_SETTINGS,
    });
    // 1.5 % of 160 = 2.4 kg, band max 1.25 kg
    expect(r.rateKgPerWeek).toBeLessThanOrEqual(1.25);
    expect(["absolute", "relative"]).toContain(r.limitedBy);
  });

  it("bfMax is exclusive — a body fat exactly on a boundary falls into the upper band", () => {
    const settings: GoalSettings = DEFAULT_GOAL_SETTINGS;
    const r = rateForState({ sex: "male", weightKg: 100, fatMassKg: 12, bodyFatPct: 12, tdee: 3000, profile: "optimal", settings });
    expect(r.band?.bfMin).toBe(12);
    expect(r.band?.bfMax).toBe(15);
  });
});

describe("computeGoalPlan — roadmap", () => {
  it("walks weight and body fat down monotonically and lands on the target", () => {
    const plan = computeGoalPlan(base);
    expect(plan.roadmap.length).toBeGreaterThan(0);
    for (let i = 1; i < plan.roadmap.length; i++) {
      expect(plan.roadmap[i].startWeightKg).toBeLessThanOrEqual(plan.roadmap[i - 1].startWeightKg);
      expect(plan.roadmap[i].startBfPct).toBeLessThanOrEqual(plan.roadmap[i - 1].startBfPct);
    }
    const last = plan.roadmap[plan.roadmap.length - 1];
    expect(last.endBfPct).toBeLessThanOrEqual(base.targetBodyFatPct + 0.05);
    expect(plan.estimatedWeeks).toBe(plan.roadmap.length);
  });

  it("keeps week keys 7 days apart and derives the target date", () => {
    const plan = computeGoalPlan(base);
    // A week covers startKey … startKey + 6 inclusive, so the next week starts a day later.
    expect(plan.roadmap[0].startKey).toBe("2026-09-10");
    expect(plan.roadmap[0].endKey).toBe("2026-09-16");
    expect(plan.roadmap[1].startKey).toBe("2026-09-17");
    // targetDate = startDate + 7 × weeks (the day after the last week ends).
    expect(plan.targetDate).toBe(shiftKey(base.startKey, 7 * plan.estimatedWeeks));
  });

  it("accumulates the deficit across weeks", () => {
    const plan = computeGoalPlan(base);
    const last = plan.roadmap[plan.roadmap.length - 1];
    expect(last.cumulativeDeficitKcal).toBeGreaterThan(plan.roadmap[0].cumulativeDeficitKcal);
  });

  it("never drops the daily target below the calorie floor and flags FLOOR_LIMITED", () => {
    const plan = computeGoalPlan({
      ...base,
      sex: "female",
      weightKg: 55,
      bodyFatPct: 34,
      heightCm: 160,
      activityLevel: "sedentary",
      profile: "aggressive",
      targetBodyFatPct: 22,
    });
    for (const w of plan.roadmap) expect(w.dailyCalorieTarget).toBeGreaterThanOrEqual(DEFAULT_GOAL_SETTINGS.calorieFloor.female - 0.5);
    expect(plan.warnings).toContain("FLOOR_LIMITED");
  });

  it("caps the horizon at maxWeeks and warns on long plans", () => {
    const plan = computeGoalPlan({ ...base, weightKg: 150, bodyFatPct: 45, targetBodyFatPct: 12, settings: { ...DEFAULT_GOAL_SETTINGS, maxWeeks: 20 } });
    expect(plan.roadmap.length).toBeLessThanOrEqual(20);
  });

  it("warns about a long horizon beyond a year", () => {
    const plan = computeGoalPlan({ ...base, weightKg: 140, bodyFatPct: 40, targetBodyFatPct: 12 });
    expect(plan.warnings).toContain("LONG_HORIZON");
  });
});

describe("computeGoalPlan — energy & macros", () => {
  it("uses Katch-McArdle when age is unknown", () => {
    const plan = computeGoalPlan(base);
    expect(plan.bmr).toBeCloseTo(370 + 21.6 * 92.7, 0);
    expect(plan.bmrMifflin).toBeNull();
    expect(plan.tdeeFormula).toBeCloseTo(plan.bmr * 1.55, 0);
  });

  it("blends Katch-McArdle with Mifflin-St Jeor when age is known", () => {
    const plan = computeGoalPlan({ ...base, age: 30 });
    const katch = 370 + 21.6 * 92.7;
    const mifflin = 10 * 103 + 6.25 * 183 - 5 * 30 + 5;
    expect(plan.bmrMifflin).toBeCloseTo(mifflin, 0);
    expect(plan.bmr).toBeCloseTo(0.5 * katch + 0.5 * mifflin, 0);
  });

  it("honours a TDEE override instead of the formula", () => {
    const plan = computeGoalPlan({ ...base, tdeeOverride: 3100 });
    expect(plan.tdee).toBe(3100);
    expect(plan.tdeeFormula).not.toBe(3100);
  });

  it("hits the protein floor per kg bodyweight when the lean-mass rule is lower", () => {
    const plan = computeGoalPlan(base);
    const byLean = DEFAULT_GOAL_SETTINGS.protein.leanGPerKgLean * 92.7;
    const byFloor = DEFAULT_GOAL_SETTINGS.protein.floorGPerKgBodyweight * 103;
    expect(plan.macros.protein).toBeCloseTo(Math.max(byLean, byFloor), 0);
  });

  it("splits the remaining calories into fat and carbs", () => {
    const plan = computeGoalPlan(base);
    const m = plan.macros;
    expect(m.fat).toBeCloseTo((DEFAULT_GOAL_SETTINGS.fatPctOfCalories * m.calories) / 9, 0);
    expect(4 * m.protein + 9 * m.fat + 4 * m.carbs).toBeLessThanOrEqual(m.calories + 5);
  });
});
