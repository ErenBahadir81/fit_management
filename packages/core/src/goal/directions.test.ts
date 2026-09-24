import { describe, expect, it } from "vitest";
import { ffmi } from "../body/ffmi";
import { zGoalPlan, type GoalPlan } from "../schemas/goal";
import { DEFAULT_GOAL_SETTINGS } from "../schemas/settings";
import { daysBetween } from "../time/index";
import { bulkMacrosFor, computeBulkPlan, computeRecompPlan } from "./directions";
import { computeGoalPlan, tdeeForWeek, type GoalEngineInput } from "./plan";

const S = DEFAULT_GOAL_SETTINGS;
const START = "2026-01-05";

const lean75: GoalEngineInput = {
  sex: "male",
  weightKg: 75,
  bodyFatPct: 12,
  heightCm: 180,
  age: 30,
  activityLevel: "moderate",
  direction: "bulk",
  targetLeanGainKg: 3,
  startDate: START,
  settings: S,
};

const bulk = (over: Partial<GoalEngineInput> = {}) => computeGoalPlan({ ...lean75, ...over });

const recompBase: GoalEngineInput = {
  sex: "male",
  weightKg: 85,
  bodyFatPct: 20,
  heightCm: 180,
  age: 30,
  activityLevel: "moderate",
  direction: "recomp",
  targetBodyFatPct: 15,
  startDate: START,
  settings: S,
};
const recomp = (over: Partial<GoalEngineInput> = {}) => computeGoalPlan({ ...recompBase, ...over });

function expectContinuous(plan: GoalPlan) {
  plan.roadmap.forEach((w, i) => {
    expect(w.weekIndex).toBe(i + 1);
    expect(daysBetween(START, w.startKey)).toBe(7 * i);
    expect(daysBetween(w.startKey, w.endKey)).toBe(6);
    if (i > 0) {
      const prev = plan.roadmap[i - 1];
      expect(w.startWeightKg).toBeCloseTo(prev.endWeightKg, 2);
      expect(w.startBfPct).toBeCloseTo(prev.endBfPct, 2);
      expect(w.startLeanMassKg!).toBeCloseTo(prev.endLeanMassKg!, 2);
    }
    // lean = weight × (1 − bf) within rounding
    expect(w.endLeanMassKg!).toBeCloseTo(w.endWeightKg * (1 - w.endBfPct / 100), 1);
  });
}

describe("computeBulkPlan", () => {
  const plan = bulk();

  it("is dispatched from computeGoalPlan and parses", () => {
    expect(plan.direction).toBe("bulk");
    expect(computeBulkPlan(lean75)).toEqual(plan);
    expect(() => zGoalPlan.parse(plan)).not.toThrow();
  });

  it("gains exactly the lean-mass target", () => {
    expect(plan.leanGainKg!).toBeCloseTo(3, 2);
    expect(plan.targetLeanMassKg! - plan.leanMassKg).toBeCloseTo(3, 1);
    expect(plan.roadmap.at(-1)!.endLeanMassKg! - plan.roadmap[0].startLeanMassKg!).toBeCloseTo(3, 1);
    expect(plan.fatGainKg!).toBeGreaterThan(0);
    expect(plan.targetWeightKg).toBeCloseTo(75 + plan.leanGainKg! + plan.fatGainKg!, 1);
    expect(plan.totalLossKg).toBeCloseTo(plan.targetWeightKg - 75, 1); // size of the change
  });

  it("eats above maintenance every week", () => {
    expect(plan.initialDailyCalorieTarget).toBeGreaterThan(plan.tdee);
    // 2–400 kcal/day is a lean-bulk surplus, not a dirty bulk
    expect(plan.initialDailyCalorieTarget - plan.tdee).toBeGreaterThan(100);
    expect(plan.initialDailyCalorieTarget - plan.tdee).toBeLessThan(450);
    for (const w of plan.roadmap) {
      expect(w.weeklyDeficitKcal).toBeLessThan(0);
      expect(w.rateKgPerWeek).toBeGreaterThanOrEqual(0);
      expect(w.endWeightKg).toBeGreaterThan(w.startWeightKg);
      expect(w.endLeanMassKg!).toBeGreaterThan(w.startLeanMassKg!);
    }
    expect(plan.totalDeficitKcal).toBeLessThan(0);
    expect(plan.roadmap.at(-1)!.cumulativeDeficitKcal).toBeCloseTo(plan.totalDeficitKcal, -1);
  });

  it("TDEE identity: daily target + weekly deficit / 7 = the week's maintenance (rising with weight)", () => {
    for (const w of plan.roadmap) {
      const tdeeWeek = w.dailyCalorieTarget + w.weeklyDeficitKcal / 7;
      const expected = plan.tdee + S.adaptation.kcalPerDayPerKgLost * (w.startWeightKg - 75);
      expect(tdeeWeek).toBeCloseTo(expected, -0); // within ±0.5 kcal (rounding)
      expect(tdeeForWeek(plan, w.weekIndex)).toBeCloseTo(tdeeWeek, 8);
    }
    const first = plan.roadmap[0];
    const last = plan.roadmap.at(-1)!;
    expect(last.dailyCalorieTarget + last.weeklyDeficitKcal / 7).toBeGreaterThan(first.dailyCalorieTarget + first.weeklyDeficitKcal / 7);
  });

  it("with a measured TDEE, maintenance is held at the measured value", () => {
    const p = bulk({ tdeeOverride: 2600 });
    expect(p.tdee).toBe(2600);
    for (const w of p.roadmap) expect(w.dailyCalorieTarget + w.weeklyDeficitKcal / 7).toBeCloseTo(2600, -0);
  });

  it("weights rise monotonically; weeks are continuous", () => {
    for (let i = 1; i < plan.roadmap.length; i++) expect(plan.roadmap[i].endWeightKg).toBeGreaterThan(plan.roadmap[i - 1].endWeightKg);
    expectContinuous(plan);
    expect(daysBetween(plan.roadmap.at(-1)!.endKey, plan.targetDate)).toBe(1);
    expect(daysBetween(START, plan.targetDate)).toBe(7 * plan.estimatedWeeks);
  });

  it("macros follow the bulk rule (1.8 g/kg protein, 25 % fat)", () => {
    const m = plan.roadmap[0].macros;
    expect(m).toEqual(bulkMacrosFor(75, plan.roadmap[0].dailyCalorieTarget, S));
    expect(m.protein).toBe(135);
    expect(m.fat).toBeCloseTo((0.25 * m.calories) / 9, 0);
    expect(4 * m.protein + 4 * m.carbs + 9 * m.fat).toBeCloseTo(m.calories, -1);
  });

  it("beginner is faster than intermediate, which is faster than advanced", () => {
    const b = bulk({ trainingLevel: "beginner" });
    const i = bulk({ trainingLevel: "intermediate" });
    const a = bulk({ trainingLevel: "advanced" });
    expect(b.estimatedWeeks).toBeLessThan(i.estimatedWeeks);
    expect(i.estimatedWeeks).toBeLessThan(a.estimatedWeeks);
    // …and an advanced lifter adds more fat per kg of muscle
    expect(a.fatGainKg!).toBeGreaterThan(b.fatGainKg!);
    expect(b.trainingLevel).toBe("beginner");
    // 75 kg beginner: 0.86 kg/month → 3 kg in ≈ 15 weeks
    expect(b.estimatedWeeks).toBeGreaterThanOrEqual(13);
    expect(b.estimatedWeeks).toBeLessThanOrEqual(17);
  });

  it("infers the training level from FFMI when omitted", () => {
    // 75 kg, 12 % → lean 66 kg → FFMI ≈ 20.4 → intermediate
    expect(plan.trainingLevel).toBe("intermediate");
    expect(plan.ffmiStart).toBeCloseTo(ffmi(66, 180), 1);
    expect(plan.ffmiEnd!).toBeGreaterThan(plan.ffmiStart!);
  });

  it("milestones increase and the summary mentions muscle", () => {
    expect(plan.milestones.length).toBeGreaterThan(1);
    for (let i = 1; i < plan.milestones.length; i++) {
      expect(plan.milestones[i].dateKey > plan.milestones[i - 1].dateKey).toBe(true);
      expect(plan.milestones[i].weightKg).toBeGreaterThanOrEqual(plan.milestones[i - 1].weightKg);
    }
    expect(plan.milestones.at(-1)!.fraction).toBe(1);
    expect(plan.milestones.at(-1)!.dateKey).toBe(plan.roadmap.at(-1)!.endKey);
    expect(plan.summaryTr).toContain("kas");
    expect(plan.summaryTr).toContain(`${plan.estimatedWeeks} hafta`);
  });

  it("BULK_BF_CEILING when starting at or above the ceiling", () => {
    expect(bulk({ bodyFatPct: 20 }).warnings).toContain("BULK_BF_CEILING");
    expect(bulk({ weightKg: 90, bodyFatPct: 22, targetLeanGainKg: 2 }).warnings).toContain("BULK_BF_CEILING");
    expect(bulk({ sex: "female", weightKg: 60, heightCm: 165, bodyFatPct: 28, targetLeanGainKg: 1 }).warnings).toContain("BULK_BF_CEILING");
    expect(plan.warnings).not.toContain("BULK_BF_CEILING");
  });

  it("BULK_BF_CEILING when the bulk crosses the ceiling on the way", () => {
    const p = bulk({ bodyFatPct: 19, targetLeanGainKg: 5 });
    expect(p.roadmap[0].startBfPct).toBeLessThan(20);
    expect(p.roadmap.at(-1)!.endBfPct).toBeGreaterThanOrEqual(20);
    expect(p.warnings).toContain("BULK_BF_CEILING");
  });

  it("NEAR_NATURAL_LIMIT when the end FFMI is within a point of the ceiling; the rate crawls", () => {
    const p = bulk({ weightKg: 95, bodyFatPct: 10, targetLeanGainKg: 4 }); // FFMI ≈ 26
    expect(p.warnings).toContain("NEAR_NATURAL_LIMIT");
    expect(p.warnings).toContain("LONG_HORIZON");
    expect(p.estimatedWeeks).toBe(S.maxWeeks);
    expect(p.leanGainKg!).toBeLessThan(4);
    expect(plan.warnings).not.toContain("NEAR_NATURAL_LIMIT");
  });

  it("LONG_HORIZON for a slow advanced bulk past a year", () => {
    const p = bulk({ trainingLevel: "advanced" });
    expect(p.estimatedWeeks).toBeGreaterThan(52);
    expect(p.warnings).toContain("LONG_HORIZON");
  });

  it("a year-long bulk moves up a level (faster weeks after week 52 would be wrong)", () => {
    const p = bulk({ trainingLevel: "beginner", targetLeanGainKg: 12 });
    expect(p.estimatedWeeks).toBeGreaterThan(52);
    const early = p.roadmap[10].endLeanMassKg! - p.roadmap[10].startLeanMassKg!;
    const late = p.roadmap[60].endLeanMassKg! - p.roadmap[60].startLeanMassKg!;
    expect(late).toBeLessThan(early * 0.7);
  });

  it("a zero lean target plans nothing but still returns a parseable plan at maintenance", () => {
    const p = bulk({ targetLeanGainKg: 0 });
    expect(p.estimatedWeeks).toBe(0);
    expect(p.roadmap).toEqual([]);
    expect(p.initialDailyCalorieTarget).toBe(Math.round(p.tdee));
    expect(p.milestones).toEqual([]);
    expect(() => zGoalPlan.parse(p)).not.toThrow();
  });

  it("aggressive gains faster but fatter than conservative", () => {
    const c = bulk({ profile: "conservative", trainingLevel: "beginner" });
    const a = bulk({ profile: "aggressive", trainingLevel: "beginner" });
    expect(a.estimatedWeeks).toBeLessThanOrEqual(c.estimatedWeeks);
    expect(a.fatGainKg!).toBeGreaterThan(c.fatGainKg!);
    expect(a.initialDailyCalorieTarget).toBeGreaterThan(c.initialDailyCalorieTarget);
  });
});

describe("computeRecompPlan", () => {
  const plan = recomp();

  it("is dispatched from computeGoalPlan and parses", () => {
    expect(plan.direction).toBe("recomp");
    expect(computeRecompPlan(recompBase)).toEqual(plan);
    expect(() => zGoalPlan.parse(plan)).not.toThrow();
  });

  it("lands on the target body fat", () => {
    expect(plan.roadmap.at(-1)!.endBfPct).toBeCloseTo(15, 1);
    for (let i = 1; i < plan.roadmap.length; i++) expect(plan.roadmap[i].endBfPct).toBeLessThan(plan.roadmap[i - 1].endBfPct);
    expectContinuous(plan);
  });

  it("builds lean and loses fat at the same time", () => {
    expect(plan.leanGainKg!).toBeGreaterThan(0);
    expect(plan.fatGainKg!).toBeLessThan(0);
    for (const w of plan.roadmap) expect(w.endLeanMassKg!).toBeGreaterThanOrEqual(w.startLeanMassKg!);
    expect(plan.targetLeanMassKg!).toBeGreaterThan(plan.leanMassKg);
  });

  it("weight moves slowly (well under a cut's 0.5–1 %/week)", () => {
    for (const w of plan.roadmap) {
      expect(w.rateKgPerWeek).toBeLessThan(0.35);
      expect(w.endWeightKg).toBeLessThanOrEqual(w.startWeightKg);
    }
    const cut = computeGoalPlan({ ...recompBase, direction: "cut" });
    expect(plan.estimatedWeeks).toBeGreaterThan(cut.estimatedWeeks);
    // recomp keeps more weight than a cut to the same body fat
    expect(plan.targetWeightKg).toBeGreaterThan(cut.targetWeightKg);
  });

  it("runs a ~10 % deficit, capped at 500 kcal", () => {
    for (const w of plan.roadmap) {
      const tdeeWeek = w.dailyCalorieTarget + w.weeklyDeficitKcal / 7;
      expect(tdeeWeek).toBeCloseTo(plan.tdee, -0);
      expect(w.weeklyDeficitKcal / 7).toBeCloseTo(Math.min(plan.tdee * 0.1, 500), -0);
    }
    const big = recomp({ weightKg: 140, bodyFatPct: 30, targetBodyFatPct: 25, activityLevel: "veryActive", tdeeOverride: 6000 });
    expect(big.tdee * 0.1).toBeGreaterThan(500);
    expect(big.roadmap[0].weeklyDeficitKcal / 7).toBeCloseTo(500, -0);
  });

  it("RECOMP_SLOW for an advanced lifter only", () => {
    expect(recomp({ trainingLevel: "advanced" }).warnings).toContain("RECOMP_SLOW");
    expect(plan.warnings).not.toContain("RECOMP_SLOW");
    expect(recomp({ trainingLevel: "advanced" }).leanGainKg!).toBeLessThan(recomp({ trainingLevel: "beginner" }).leanGainKg!);
  });

  it("TARGET_NOT_BELOW_CURRENT when the target is not below current (empty roadmap)", () => {
    for (const t of [20, 22]) {
      const p = recomp({ targetBodyFatPct: t });
      expect(p.warnings).toContain("TARGET_NOT_BELOW_CURRENT");
      expect(p.roadmap).toEqual([]);
      expect(p.estimatedWeeks).toBe(0);
      expect(p.targetWeightKg).toBe(85);
      expect(p.leanGainKg).toBe(0);
      expect(p.milestones).toEqual([]);
    }
  });

  it("respects the calorie floor (FLOOR_LIMITED) for a small person", () => {
    const p = recomp({ sex: "female", weightKg: 48, bodyFatPct: 30, heightCm: 150, age: 60, activityLevel: "sedentary", targetBodyFatPct: 27 });
    expect(p.warnings).toContain("FLOOR_LIMITED");
    for (const w of p.roadmap) expect(w.dailyCalorieTarget).toBeGreaterThanOrEqual(S.calorieFloor.female);
    expect(p.roadmap.at(-1)!.endBfPct).toBeCloseTo(27, 1);
  });

  it("summary mentions muscle and the target body fat", () => {
    expect(plan.summaryTr).toContain("kas");
    expect(plan.summaryTr).toContain("%15");
  });

  it("milestones count body-fat points and increase", () => {
    expect(plan.milestones.length).toBeGreaterThan(1);
    for (let i = 1; i < plan.milestones.length; i++) expect(plan.milestones[i].bodyFatPct).toBeLessThan(plan.milestones[i - 1].bodyFatPct);
    expect(plan.milestones.at(-1)!.bodyFatPct).toBeCloseTo(15, 0);
  });
});

describe("cut path (unchanged, with the T7 fields)", () => {
  const input: GoalEngineInput = {
    sex: "male",
    weightKg: 100,
    bodyFatPct: 30,
    heightCm: 180,
    age: null,
    activityLevel: "moderate",
    targetBodyFatPct: 20,
    profile: "optimal",
    startDate: START,
    settings: S,
  };
  const plan = computeGoalPlan(input);

  it("direction defaults to cut and an explicit cut is identical", () => {
    expect(plan.direction).toBe("cut");
    expect(computeGoalPlan({ ...input, direction: "cut" })).toEqual(plan);
  });

  it("keeps the original cut numbers", () => {
    expect(plan.leanMassKg).toBeCloseTo(70, 2);
    expect(plan.targetWeightKg).toBeCloseTo(87.5, 2);
    expect(plan.fatToLoseKg).toBeCloseTo(12.5, 2);
    expect(plan.initialDailyCalorieTarget).toBeLessThan(plan.tdee);
    for (const w of plan.roadmap) expect(w.weeklyDeficitKcal).toBeGreaterThan(0);
  });

  it("fills the lean-mass fields", () => {
    expect(plan.ffmiStart).toBeCloseTo(21.6, 1);
    expect(plan.ffmiEnd!).toBeLessThanOrEqual(plan.ffmiStart!);
    expect(plan.leanGainKg!).toBeLessThanOrEqual(0);
    expect(plan.fatGainKg!).toBeLessThan(0);
    expect(plan.roadmap[0].startLeanMassKg).toBeCloseTo(70, 2);
    expect(plan.trainingLevel).toBeNull();
    expectContinuous(plan);
  });

  it("ffmi fields are null without a height", () => {
    const p = computeGoalPlan({ ...input, heightCm: 0 });
    expect(p.ffmiStart).toBeNull();
    expect(p.ffmiEnd).toBeNull();
  });
});

describe("determinism", () => {
  it.each([
    ["bulk", { ...lean75 }],
    ["recomp", { ...recompBase }],
    ["cut", { ...recompBase, direction: "cut" as const }],
  ])("%s: same input → deep-equal output", (_, input) => {
    expect(computeGoalPlan(input)).toEqual(computeGoalPlan({ ...input }));
    expect(JSON.stringify(computeGoalPlan(input))).toBe(JSON.stringify(computeGoalPlan(input)));
  });
});
