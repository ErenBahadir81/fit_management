import { describe, expect, it } from "vitest";
import type { GoalDirection } from "../schemas/goal";
import { zGoalFeedback } from "../schemas/goal";
import { DEFAULT_GOAL_SETTINGS } from "../schemas/settings";
import { shiftKey } from "../time/index";
import { proposeGoalAdjustment, type AdaptiveGoal, type ReplanBase } from "./adjust";
import type { WeightPoint } from "./ewma";
import { evaluateGoal, goalFeedback } from "./feedback";
import { computeGoalPlan } from "./plan";
import { computeGoalProgress, expectedAtDay, trendDeviationAt, type BodyPoint } from "./progress";

const S = DEFAULT_GOAL_SETTINGS;
const START = "2026-01-05";
const day = (n: number) => shiftKey(START, n);

function makeGoal(direction: GoalDirection, weightKg: number, bodyFatPct: number, target: { bf?: number; lean?: number }): AdaptiveGoal {
  const plan = computeGoalPlan({
    sex: "male",
    weightKg,
    bodyFatPct,
    heightCm: 180,
    age: 30,
    activityLevel: "moderate",
    direction,
    targetBodyFatPct: target.bf ?? null,
    targetLeanGainKg: target.lean ?? null,
    startDate: START,
    settings: S,
  });
  const fat = (weightKg * bodyFatPct) / 100;
  return {
    id: `goal-${direction}`,
    direction,
    targetBodyFatPct: target.bf ?? plan.roadmap.at(-1)!.endBfPct,
    targetLeanGainKg: target.lean ?? null,
    trainingLevel: null,
    profile: "optimal",
    tdeeOverride: null,
    adjustments: [],
    start: { dateKey: START, weightKg, bodyFatPct, leanMassKg: weightKg - fat, fatMassKg: fat, bodyEntryId: null },
    plan,
  };
}

const cutGoal = makeGoal("cut", 100, 30, { bf: 20 });
const bulkGoal = makeGoal("bulk", 75, 12, { lean: 3 });
const recompGoal = makeGoal("recomp", 85, 20, { bf: 15 });

const follow = (goal: AdaptiveGoal, days: number, offset: (d: number) => number = () => 0): WeightPoint[] =>
  Array.from({ length: days + 1 }, (_, d) => ({ dateKey: day(d), weightKg: expectedAtDay(goal, d).weightKg + offset(d) }));

const baseFor = (goal: AdaptiveGoal, points: WeightPoint[]): ReplanBase => {
  const w = points.at(-1)!.weightKg;
  return { sex: "male", weightKg: w, bodyFatPct: (1 - goal.start.leanMassKg / w) * 100, heightCm: 180, age: 30, activityLevel: "moderate", settings: S };
};

function feedbackFor(goal: AdaptiveGoal, points: WeightPoint[], today: number, body: BodyPoint[] = []) {
  const todayKey = day(today);
  const progress = computeGoalProgress(goal, points, body, [], todayKey, S);
  const deviationKg = trendDeviationAt(goal, points, todayKey, S);
  const latestBody = body.filter((b) => b.dateKey <= todayKey).at(-1) ?? null;
  return { progress, fb: goalFeedback({ goal, progress, deviationKg, latestBody, todayKey }) };
}

describe("goalFeedback", () => {
  it("no weigh-ins → noData, neutral", () => {
    const { fb } = feedbackFor(cutGoal, [], 3);
    expect(fb.status).toBe("noData");
    expect(fb.tone).toBe("neutral");
    expect(fb.deviationKg).toBeNull();
    expect(fb.trigger).toBe("goal.feedback.noData");
    expect(() => zGoalFeedback.parse(fb)).not.toThrow();
  });

  it("on track → positive, text with the % complete", () => {
    const { fb, progress } = feedbackFor(cutGoal, follow(cutGoal, 28), 28);
    expect(progress.onTrack).toBe("onTrack");
    expect(fb.status).toBe("onTrack");
    expect(fb.tone).toBe("positive");
    expect(fb.textTr).toContain("%");
    expect(fb.textTr).toContain(`%${fb.bars.goal}`);
    expect(Math.abs(fb.deviationKg!)).toBeLessThan(0.4);
  });

  it("cut ahead → positive with the weeks it may save", () => {
    const pts = follow(cutGoal, 35, (d) => -0.06 * d);
    const { fb, progress } = feedbackFor(cutGoal, pts, 35);
    expect(fb.status).toBe("ahead");
    expect(fb.tone).toBe("positive");
    expect(fb.mood).toBe("cheer");
    expect(fb.textTr).toContain("öndesin");
    expect(fb.weeksSaved).toBe(progress.weeksRemainingPlan - progress.weeksRemainingProjected!);
    expect(fb.weeksSaved!).toBeGreaterThan(0);
    expect(fb.textTr).toContain(`${progress.weeksRemainingPlan} yerine ${progress.weeksRemainingProjected} haftada`);
  });

  it("bulk ahead (gaining too fast) → attention, not praise", () => {
    const pts = follow(bulkGoal, 35, (d) => 0.05 * d);
    const { fb } = feedbackFor(bulkGoal, pts, 35);
    expect(fb.status).toBe("ahead");
    expect(fb.tone).toBe("attention");
    expect(fb.textTr).toContain("yağ");
    expect(fb.deviationKg!).toBeGreaterThan(0);
  });

  it("cut behind → attention", () => {
    const { fb } = feedbackFor(cutGoal, follow(cutGoal, 35, (d) => Math.min(1.2, 0.05 * d)), 35);
    expect(fb.status).toBe("behind");
    expect(fb.tone).toBe("attention");
    expect(fb.textTr).toContain("gerideyiz");
  });

  it("cut stalled → worried", () => {
    const flat = Array.from({ length: 36 }, (_, d) => ({ dateKey: day(d), weightKg: 100 }));
    const { fb } = feedbackFor(cutGoal, flat, 35);
    expect(fb.status).toBe("stalled");
    expect(fb.mood).toBe("worried");
  });

  it("a pending proposal is pointed at", () => {
    const pts = follow(cutGoal, 35, (d) => Math.min(1.2, 0.05 * d));
    const todayKey = day(35);
    const progress = computeGoalProgress(cutGoal, pts, [], [], todayKey, S);
    const adjustment = proposeGoalAdjustment({ goal: cutGoal, progress, weighIns: pts, todayKey, replanBase: baseFor(cutGoal, pts), settings: S });
    expect(adjustment).not.toBeNull();
    const fb = goalFeedback({ goal: cutGoal, progress, deviationKg: 1, latestBody: null, todayKey, adjustment });
    expect(fb.textTr).toContain("öneri");
  });

  it("reached passes the proposal's message through", () => {
    const pts = Array.from({ length: 4 }, (_, d) => ({ dateKey: day(d), weightKg: cutGoal.plan.targetWeightKg }));
    const todayKey = day(3);
    const progress = computeGoalProgress(cutGoal, pts, [], [], todayKey, S);
    const adjustment = proposeGoalAdjustment({ goal: cutGoal, progress, weighIns: pts, todayKey, replanBase: baseFor(cutGoal, pts), settings: S })!;
    expect(adjustment.kind).toBe("reached");
    const fb = goalFeedback({ goal: cutGoal, progress, deviationKg: null, latestBody: null, todayKey, adjustment });
    expect(fb.status).toBe("reached");
    expect(fb.mood).toBe("proud");
    expect(fb.textTr).toBe(adjustment.messageTr);
  });
});

describe("goalFeedback — bars", () => {
  it("all bars in 0..100", () => {
    const cases: [AdaptiveGoal, WeightPoint[], number, BodyPoint[]][] = [
      [cutGoal, follow(cutGoal, 400, (d) => -0.2 * d), 400, [{ dateKey: day(400), weightKg: 80, bodyFatPct: 5 }]],
      [cutGoal, follow(cutGoal, 3), 3, [{ dateKey: day(3), weightKg: 105, bodyFatPct: 35 }]],
      [bulkGoal, follow(bulkGoal, 30), 30, [{ dateKey: day(30), weightKg: 90, bodyFatPct: 10 }]],
      [recompGoal, follow(recompGoal, 30), 30, [{ dateKey: day(30), weightKg: 60, bodyFatPct: 30 }]],
    ];
    for (const [goal, pts, t, body] of cases) {
      const { fb } = feedbackFor(goal, pts, t, body);
      for (const v of [fb.bars.goal, fb.bars.time, fb.bars.lean, fb.bars.fat]) {
        if (v === null) continue;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("time bar is elapsed / planned", () => {
    const { fb } = feedbackFor(cutGoal, follow(cutGoal, 14), 14);
    expect(fb.bars.time).toBe(Math.round((14 / (cutGoal.plan.estimatedWeeks * 7)) * 100));
  });

  it("cut: fat bar only; lean null", () => {
    const { fb } = feedbackFor(cutGoal, follow(cutGoal, 28), 28, [{ dateKey: day(28), weightKg: 96, bodyFatPct: 25 }]);
    expect(fb.bars.lean).toBeNull();
    expect(fb.bars.fat).toBe(50); // (30 − 25) / (30 − 20)
  });

  it("bulk: lean bar only; fat null", () => {
    // lean now = 77 × 0.84 = 64.68 … use 1.5 kg above the 66 kg start
    const weightKg = 78;
    const bodyFatPct = (1 - 67.5 / weightKg) * 100;
    const { fb } = feedbackFor(bulkGoal, follow(bulkGoal, 30), 30, [{ dateKey: day(30), weightKg, bodyFatPct }]);
    expect(fb.bars.fat).toBeNull();
    expect(fb.bars.lean).toBe(50); // 1.5 of 3 kg
  });

  it("recomp: both bars (lean target = the plan's lean gain)", () => {
    const leanTarget = recompGoal.plan.leanGainKg!;
    const lean = recompGoal.start.leanMassKg + leanTarget / 2;
    const weightKg = 84;
    const { fb } = feedbackFor(recompGoal, follow(recompGoal, 30), 30, [{ dateKey: day(30), weightKg, bodyFatPct: (1 - lean / weightKg) * 100 }]);
    expect(fb.bars.lean).toBe(50);
    expect(fb.bars.fat).not.toBeNull();
    expect(fb.bars.goal).toBeGreaterThan(0); // recomp progress comes from body fat
  });

  it("no body entry → lean and fat null", () => {
    for (const g of [cutGoal, bulkGoal, recompGoal]) {
      const { fb } = feedbackFor(g, follow(g, 10), 10);
      expect(fb.bars.lean).toBeNull();
      expect(fb.bars.fat).toBeNull();
    }
  });
});

describe("evaluateGoal", () => {
  it("bundles progress, feedback and adjustment consistently", () => {
    const pts = follow(cutGoal, 35, (d) => Math.min(1.2, 0.05 * d));
    const todayKey = day(35);
    const ev = evaluateGoal({ goal: cutGoal, weighIns: pts, bodyEntries: [], dayIntake: [], todayKey, settings: S, replanBase: baseFor(cutGoal, pts) });
    expect(ev.progress).toEqual(computeGoalProgress(cutGoal, pts, [], [], todayKey, S));
    expect(ev.adjustment).not.toBeNull();
    expect(ev.adjustment!.kind).toBe("behind");
    expect(ev.feedback.status).toBe(ev.progress.onTrack);
    expect(ev.feedback.bars.goal).toBe(Math.round(ev.progress.percentComplete));
    expect(ev.feedback.deviationKg).toBeCloseTo(trendDeviationAt(cutGoal, pts, todayKey, S)!, 2);
    expect(ev.feedback.textTr).toContain("öneri");
  });

  it("no replanBase → no adjustment", () => {
    const pts = follow(cutGoal, 35, (d) => Math.min(1.2, 0.05 * d));
    const ev = evaluateGoal({ goal: cutGoal, weighIns: pts, bodyEntries: [], dayIntake: [], todayKey: day(35), settings: S });
    expect(ev.adjustment).toBeNull();
    expect(ev.feedback.status).toBe("behind");
    expect(ev.feedback.textTr).not.toContain("öneri");
  });

  it("uses the latest body entry up to today, ignoring future ones", () => {
    const pts = follow(cutGoal, 28);
    const body: BodyPoint[] = [
      { dateKey: day(40), weightKg: 90, bodyFatPct: 21 },
      { dateKey: day(10), weightKg: 98, bodyFatPct: 28 },
      { dateKey: day(20), weightKg: 97, bodyFatPct: 27 },
    ];
    const ev = evaluateGoal({ goal: cutGoal, weighIns: pts, bodyEntries: body, dayIntake: [], todayKey: day(28), settings: S });
    expect(ev.feedback.bars.fat).toBe(30); // (30 − 27) / 10
  });

  it("is deterministic", () => {
    const pts = follow(bulkGoal, 35, (d) => 0.05 * d);
    const input = { goal: bulkGoal, weighIns: pts, bodyEntries: [], dayIntake: [], todayKey: day(35), settings: S, replanBase: baseFor(bulkGoal, pts) };
    expect(evaluateGoal(input)).toEqual(evaluateGoal(input));
  });
});
