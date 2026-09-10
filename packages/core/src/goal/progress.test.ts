import { describe, expect, it } from "vitest";
import { DEFAULT_GOAL_SETTINGS } from "../schemas/settings";
import { shiftKey } from "../time/index";
import { computeGoalPlan } from "./plan";
import { computeGoalProgress, type GoalLike } from "./progress";

const S = DEFAULT_GOAL_SETTINGS;
const START = "2026-09-06";

const plan = computeGoalPlan({
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
});

const goal: GoalLike = {
  targetBodyFatPct: 20,
  start: { dateKey: START, weightKg: 100, bodyFatPct: 30, leanMassKg: 70, fatMassKg: 30, bodyEntryId: null },
  plan,
};

const flatWeighIns = (days: number, perDay: number, from = START, start = 100) =>
  Array.from({ length: days }, (_, i) => ({ dateKey: shiftKey(from, i), weightKg: start - perDay * i }));
const intake = (days: number, kcal: number, from = START) =>
  Array.from({ length: days }, (_, i) => ({ dateKey: shiftKey(from, i), kcal, entries: 2 }));

describe("computeGoalProgress — timeline", () => {
  it("day 0 has nothing elapsed and expects the start weight", () => {
    const p = computeGoalProgress(goal, [], [], [], START, S);
    expect(p.daysElapsed).toBe(0);
    expect(p.weeksElapsed).toBe(0);
    expect(p.weekIndexInPlan).toBe(1);
    expect(p.expectedWeightKg).toBeCloseTo(100, 2);
    expect(p.actualWeightKg).toBeNull();
    expect(p.percentComplete).toBe(0);
    expect(p.currentWeek?.weekIndex).toBe(1);
    expect(p.weeksRemainingPlan).toBe(plan.estimatedWeeks);
  });

  it("interpolates the expected weight inside the week", () => {
    const w1 = plan.roadmap[0];
    const mid = computeGoalProgress(goal, [], [], [], shiftKey(START, 3), S);
    expect(mid.expectedWeightKg).toBeCloseTo(w1.startWeightKg + ((w1.endWeightKg - w1.startWeightKg) * 3) / 7, 2);
    const next = computeGoalProgress(goal, [], [], [], shiftKey(START, 7), S);
    expect(next.weeksElapsed).toBe(1);
    expect(next.weekIndexInPlan).toBe(2);
    expect(next.expectedWeightKg).toBeCloseTo(w1.endWeightKg, 2);
  });

  it("clamps past the end of the roadmap", () => {
    const after = computeGoalProgress(goal, [], [], [], shiftKey(START, 7 * (plan.estimatedWeeks + 5)), S);
    const last = plan.roadmap[plan.roadmap.length - 1];
    expect(after.expectedWeightKg).toBeCloseTo(last.endWeightKg, 2);
    expect(after.expectedBodyFatPct).toBeCloseTo(last.endBfPct, 2);
    expect(after.weeksRemainingPlan).toBe(0);
    expect(after.weekIndexInPlan).toBe(plan.estimatedWeeks);
  });
});

describe("computeGoalProgress — actuals", () => {
  it("uses the EWMA trend, not the last raw weigh-in", () => {
    const weighIns = [...flatWeighIns(14, 0.1), { dateKey: shiftKey(START, 14), weightKg: 96 }];
    const p = computeGoalProgress(goal, weighIns, [], [], shiftKey(START, 14), S);
    expect(p.actualWeightKg).not.toBeNull();
    expect(p.actualWeightKg!).toBeGreaterThan(96);
    expect(p.actualWeightKg!).toBeLessThan(100);
  });

  it("percentComplete is weight based and clamped to 0..100", () => {
    const atTarget = computeGoalProgress(goal, flatWeighIns(30, 0.6), [], [], shiftKey(START, 29), S);
    expect(atTarget.percentComplete).toBeGreaterThan(0);
    expect(atTarget.percentComplete).toBeLessThanOrEqual(100);

    const gaining = computeGoalProgress(goal, flatWeighIns(10, -0.3), [], [], shiftKey(START, 9), S);
    expect(gaining.percentComplete).toBe(0);
  });

  it("reads current body fat from the latest body entry", () => {
    const p = computeGoalProgress(
      goal,
      flatWeighIns(15, 0.1),
      [
        { dateKey: START, weightKg: 100, bodyFatPct: 30 },
        { dateKey: shiftKey(START, 14), weightKg: 98.6, bodyFatPct: 28.4 },
      ],
      [],
      shiftKey(START, 14),
      S
    );
    expect(p.actualBodyFatPct).toBe(28.4);
    expect(p.bfToGo).toBeCloseTo(8.4, 2);
  });
});

describe("computeGoalProgress — banked deficit", () => {
  const tdee = plan.roadmap[0].dailyCalorieTarget + plan.roadmap[0].weeklyDeficitKcal / 7;

  it("sums (tdee − intake) over logged days only", () => {
    const days = [
      { dateKey: shiftKey(START, 0), kcal: 2000, entries: 3 },
      { dateKey: shiftKey(START, 1), kcal: 2000, entries: 3 },
      { dateKey: shiftKey(START, 2), kcal: 0, entries: 0 },
    ];
    const p = computeGoalProgress(goal, [], [], days, shiftKey(START, 3), S);
    expect(p.deficitBankedKcal).toBeCloseTo(2 * (tdee - 2000), 0);
  });

  it("ignores days outside the elapsed range", () => {
    const days = [...intake(3, 2000), { dateKey: shiftKey(START, 40), kcal: 500, entries: 1 }];
    const p = computeGoalProgress(goal, [], [], days, shiftKey(START, 2), S);
    expect(p.deficitBankedKcal).toBeCloseTo(3 * (tdee - 2000), 0);
  });

  it("planned deficit scales with elapsed days", () => {
    const p = computeGoalProgress(goal, [], [], [], shiftKey(START, 6), S);
    expect(p.deficitPlannedKcal).toBeCloseTo(plan.roadmap[0].weeklyDeficitKcal, 0);
    const half = computeGoalProgress(goal, [], [], [], shiftKey(START, 2), S);
    expect(half.deficitPlannedKcal).toBeCloseTo((plan.roadmap[0].weeklyDeficitKcal / 7) * 3, 0);
  });
});

describe("computeGoalProgress — on-track classification", () => {
  const at = (weights: number[], todayOffset: number) =>
    computeGoalProgress(
      goal,
      weights.map((weightKg, i) => ({ dateKey: shiftKey(START, i), weightKg })),
      [],
      [],
      shiftKey(START, todayOffset),
      S
    );

  const cases: Array<{ name: string; perDay: number; days: number; expected: string }> = [
    { name: "faster than plan → ahead", perDay: 0.3, days: 15, expected: "ahead" },
    { name: "matching the plan → onTrack", perDay: 0.105, days: 8, expected: "onTrack" },
    { name: "slower than plan → behind", perDay: 0.03, days: 22, expected: "behind" },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const weights = Array.from({ length: c.days }, (_, i) => 100 - c.perDay * i);
      expect(at(weights, c.days - 1).onTrack).toBe(c.expected);
    });
  }

  it("flat trend for two weeks → stalled", () => {
    const weights = Array.from({ length: 22 }, () => 100);
    expect(at(weights, 21).onTrack).toBe("stalled");
  });

  it("is not stalled before two weeks have elapsed", () => {
    const weights = Array.from({ length: 8 }, () => 100);
    expect(at(weights, 7).onTrack).not.toBe("stalled");
  });
});

describe("computeGoalProgress — projection", () => {
  it("projects from the observed EWMA slope", () => {
    const p = computeGoalProgress(goal, flatWeighIns(30, 0.12), [], [], shiftKey(START, 29), S);
    expect(p.projectedDate).not.toBeNull();
    expect(p.weeksRemainingProjected).not.toBeNull();
    expect(p.weeksRemainingProjected!).toBeGreaterThan(0);
    expect(p.projectedDate).toBe(shiftKey(shiftKey(START, 29), 7 * p.weeksRemainingProjected!));
  });

  it("has no projection without weigh-ins", () => {
    const p = computeGoalProgress(goal, [], [], [], shiftKey(START, 10), S);
    expect(p.projectedDate).toBeNull();
    expect(p.weeksRemainingProjected).toBeNull();
  });

  it("gaining weight → no projected date", () => {
    const p = computeGoalProgress(goal, flatWeighIns(30, -0.1), [], [], shiftKey(START, 29), S);
    expect(p.projectedDate).toBeNull();
  });
});

/* --------------------------- review regressions --------------------------- */

describe("computeGoalProgress — re-planned goals (review)", () => {
  // A recalibration / PATCH /goals/current re-simulates the roadmap from *today*, so
  // `plan.startKey` moves forward while `goal.start.dateKey` stays put.
  const REPLAN_AT = shiftKey(START, 21);
  const replanned: GoalLike = {
    ...goal,
    plan: computeGoalPlan({
      sex: "male",
      weightKg: 98,
      bodyFatPct: 28,
      heightCm: 180,
      age: null,
      activityLevel: "moderate",
      targetBodyFatPct: 20,
      profile: "optimal",
      startDate: REPLAN_AT,
      settings: S,
    }),
  };

  it("reads the current roadmap week from the plan timeline, not the goal timeline", () => {
    const p = computeGoalProgress(replanned, [], [], [], REPLAN_AT, S);
    expect(p.weekIndexInPlan).toBe(1);
    // currentWeek is what /reports/home turns into today's calorie + protein target.
    expect(p.currentWeek?.weekIndex).toBe(1);
    expect(p.currentWeek?.startKey).toBe(REPLAN_AT);
    expect(p.currentWeek?.dailyCalorieTarget).toBe(replanned.plan.roadmap[0].dailyCalorieTarget);
  });

  it("keeps currentWeek and weekIndexInPlan in step as the plan progresses", () => {
    for (const week of [0, 1, 2]) {
      const p = computeGoalProgress(replanned, [], [], [], shiftKey(REPLAN_AT, 7 * week + 2), S);
      expect(p.currentWeek?.weekIndex).toBe(p.weekIndexInPlan);
    }
  });
});
