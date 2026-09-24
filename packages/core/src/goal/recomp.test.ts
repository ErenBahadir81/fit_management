/**
 * Recomposition judged on body fat, not weight: the tape-measurement trend (body-fat % and the
 * lean mass derived from it) against the roadmap's expected per-week values.
 */
import { describe, expect, it } from "vitest";
import type { GoalAdjustment } from "../schemas/goal";
import { zGoalAdjustmentProposal, zGoalFeedback } from "../schemas/goal";
import { DEFAULT_GOAL_SETTINGS } from "../schemas/settings";
import { daysBetween, shiftKey } from "../time/index";
import { round } from "../utils/index";
import { estimateCurrentBody, proposeGoalAdjustment, replanGoal, type AdaptiveGoal, type ReplanBase } from "./adjust";
import type { WeightPoint } from "./ewma";
import { evaluateGoal, goalFeedback } from "./feedback";
import { computeGoalPlan } from "./plan";
import { bodyFatTrend, computeGoalProgress, expectedAtDay, trendDeviationAt, type BodyPoint } from "./progress";

const S = DEFAULT_GOAL_SETTINGS;
const A = S.adaptive;
const START = "2026-01-05";
const day = (n: number) => shiftKey(START, n);

function makeRecomp(extra: { id?: string; adjustments?: GoalAdjustment[]; weightKg?: number; bodyFatPct?: number; target?: number } = {}): AdaptiveGoal {
  const weightKg = extra.weightKg ?? 85;
  const bodyFatPct = extra.bodyFatPct ?? 20;
  const target = extra.target ?? 15;
  const plan = computeGoalPlan({
    sex: "male",
    weightKg,
    bodyFatPct,
    heightCm: 180,
    age: 30,
    activityLevel: "moderate",
    direction: "recomp",
    targetBodyFatPct: target,
    startDate: START,
    settings: S,
  });
  const fat = (weightKg * bodyFatPct) / 100;
  return {
    id: extra.id ?? "goal-recomp",
    direction: "recomp",
    targetBodyFatPct: target,
    targetLeanGainKg: null,
    trainingLevel: null,
    profile: "optimal",
    tdeeOverride: null,
    adjustments: extra.adjustments ?? [],
    start: { dateKey: START, weightKg, bodyFatPct, leanMassKg: weightKg - fat, fatMassKg: fat, bodyEntryId: null },
    plan,
  };
}

/** 85 kg, 20 % → 15 %: 18 weeks, ≈ 0.28 points of body fat a week. */
const goal = makeRecomp();
/** Same start, → 12 %: 29 weeks, so running twice as fast is seen before the target is reached. */
const longGoal = makeRecomp({ id: "goal-recomp-long", target: 12 });
/** Planned body-fat drop per week (the same ≈ 0.28 points for both goals). */
const rateOf = (g: AdaptiveGoal) => (g.plan.roadmap[0].startBfPct - g.plan.roadmap.at(-1)!.endBfPct) / g.plan.roadmap.length;
const PLAN_BF_RATE = rateOf(goal);
/** Body fat falling at twice the planned rate. */
const twiceAsFast = (g: AdaptiveGoal) => (d: number) => (-rateOf(g) * d) / 7;
/** Body fat falling at a third of the planned rate. */
const aThird = (d: number) => (PLAN_BF_RATE * (2 / 3) * d) / 7;
/** Lean mass falling 0.35 kg a week (the plan has it rising ≈ 0.05). */
const losingLean = (d: number) => (-0.35 * d) / 7;

/**
 * A tape measurement on day `d`: the planned body fat + `bf(d)` points and the planned lean mass
 * + `lean(d)` kg; the weight is whatever those two imply. Body fat is rounded like the Navy formula.
 */
function tape(g: AdaptiveGoal, d: number, bf: (d: number) => number = () => 0, lean: (d: number) => number = () => 0): BodyPoint {
  const e = expectedAtDay(g, d);
  const bodyFatPct = round(e.bodyFatPct + bf(d), 1);
  const leanKg = e.leanMassKg + lean(d);
  return { dateKey: day(d), weightKg: round(leanKg / (1 - bodyFatPct / 100), 2), bodyFatPct };
}
/** Weekly measurements from day 0 through `lastDay`. */
const weekly = (g: AdaptiveGoal, lastDay: number, bf?: (d: number) => number, lean?: (d: number) => number): BodyPoint[] =>
  Array.from({ length: Math.floor(lastDay / 7) + 1 }, (_, i) => tape(g, 7 * i, bf, lean));
/**
 * Body fat held at the start value: nothing is happening. With weekly readings (no noise) this is
 * judged "stalled" from week 8 and proposed from week 9, once it held a reading earlier.
 */
const flatBf = (g: AdaptiveGoal) => (d: number) => g.start.bodyFatPct - expectedAtDay(g, d).bodyFatPct;
/** Daily weigh-ins exactly on the plan's expected weight (+ `off(d)`). */
const planWeights = (g: AdaptiveGoal, days: number, off: (d: number) => number = () => 0): WeightPoint[] =>
  Array.from({ length: days + 1 }, (_, d) => ({ dateKey: day(d), weightKg: expectedAtDay(g, d).weightKg + off(d) }));

function baseFrom(points: WeightPoint[], leanKg = goal.start.leanMassKg): ReplanBase {
  const w = points.at(-1)!.weightKg;
  return { sex: "male", weightKg: w, bodyFatPct: (1 - leanKg / w) * 100, heightCm: 180, age: 30, activityLevel: "moderate", settings: S };
}

/** Like the API: re-plan from the latest tape reading up to today (else the last weigh-in at the start lean mass). */
function latestBase(weights: WeightPoint[], body: BodyPoint[], todayKey: string): ReplanBase {
  const latest = body.filter((b) => b.dateKey <= todayKey).at(-1);
  return latest ? { ...baseFrom(weights), weightKg: latest.weightKg, bodyFatPct: latest.bodyFatPct } : baseFrom(weights);
}

function propose(g: AdaptiveGoal, weights: WeightPoint[], body: BodyPoint[], today: number) {
  const todayKey = day(today);
  const progress = computeGoalProgress(g, weights, body, [], todayKey, S);
  return proposeGoalAdjustment({ goal: g, progress, weighIns: weights, bodyEntries: body, todayKey, replanBase: latestBase(weights, body, todayKey), settings: S });
}

function evaluate(g: AdaptiveGoal, weights: WeightPoint[], body: BodyPoint[], today: number) {
  const todayKey = day(today);
  return evaluateGoal({ goal: g, weighIns: weights, bodyEntries: body, dayIntake: [], todayKey, settings: S, replanBase: latestBase(weights, body, todayKey) });
}

describe("expectedAtDay — lean mass", () => {
  it("interpolates the roadmap's lean mass like weight and body fat", () => {
    const w = goal.plan.roadmap[2];
    const mid = expectedAtDay(goal, 14 + 3.5);
    expect(mid.leanMassKg).toBeCloseTo((w.startLeanMassKg! + w.endLeanMassKg!) / 2, 6);
    expect(expectedAtDay(goal, 0).leanMassKg).toBe(goal.plan.roadmap[0].startLeanMassKg);
    expect(expectedAtDay(goal, 9999).leanMassKg).toBe(goal.plan.roadmap.at(-1)!.endLeanMassKg);
  });

  it("falls back to weight × (1 − body fat) for plans stored without lean fields", () => {
    const legacy = { ...goal, plan: { ...goal.plan, roadmap: goal.plan.roadmap.map(({ startLeanMassKg, endLeanMassKg, ...w }) => (void [startLeanMassKg, endLeanMassKg], w)) } };
    const e = expectedAtDay(legacy, 10);
    // interpolated between the derived week end points, so equal to w × (1 − bf) up to rounding
    expect(e.leanMassKg).toBeCloseTo(e.weightKg * (1 - e.bodyFatPct / 100), 2);
    expect(e.leanMassKg).toBeCloseTo(expectedAtDay(goal, 10).leanMassKg, 1);
  });
});

describe("bodyFatTrend — the measurement series against the plan", () => {
  it("measurements on the plan → onTrack, deviation ≈ 0, slope ≈ the planned rate", () => {
    const t = bodyFatTrend(goal, weekly(goal, 49), day(49), S);
    expect(t.enough).toBe(true);
    expect(t.count).toBe(8);
    expect(t.spanDays).toBe(49);
    expect(t.latestKey).toBe(day(49));
    expect(t.status).toBe("onTrack");
    expect(Math.abs(t.deviationPts!)).toBeLessThan(0.1);
    expect(t.slopePtsPerWeek!).toBeCloseTo(-PLAN_BF_RATE, 1);
    expect(t.bodyFatPct!).toBeCloseTo(expectedAtDay(goal, 49).bodyFatPct, 1);
    expect(t.leanLoss).toBe(false);
    expect(Math.abs(t.deviationLeanKg!)).toBeLessThan(0.1);
  });

  it("needs enough measurements, spread over enough time, the latest one recent", () => {
    expect(A.bfMinMeasurements).toBe(3);
    expect(A.bfMinSpanDays).toBe(21);
    expect(A.bfMaxAgeDays).toBe(14);
    const off = flatBf(goal);
    const two = [tape(goal, 0, off), tape(goal, 35, off)];
    expect(bodyFatTrend(goal, two, day(35), S)).toMatchObject({ enough: false, status: null, count: 2 });
    const close = [0, 7, 14].map((d) => tape(goal, d, off));
    expect(bodyFatTrend(goal, close, day(14), S)).toMatchObject({ enough: false, status: null, spanDays: 14 });
    const spread = [0, 10, 21].map((d) => tape(goal, d));
    expect(bodyFatTrend(goal, spread, day(21), S)).toMatchObject({ enough: true, status: "onTrack" });
    // 14 days after the latest measurement it still counts, 15 days after it is too old
    expect(bodyFatTrend(goal, weekly(goal, 35), day(49), S).enough).toBe(true);
    expect(bodyFatTrend(goal, weekly(goal, 35), day(50), S)).toMatchObject({ enough: false, status: null });
    expect(bodyFatTrend(goal, weekly(goal, 35), day(50), S).latestKey).toBe(day(35));
    expect(bodyFatTrend(goal, [], day(49), S)).toMatchObject({ enough: false, status: null, count: 0, latestKey: null, deviationPts: null });
  });

  it("uses only measurements since the plan (re)started, inside the trailing window, up to today", () => {
    const replanned: AdaptiveGoal = { ...goal, plan: { ...goal.plan, startKey: day(28) } };
    const body = weekly(goal, 63);
    const t = bodyFatTrend(replanned, body, day(63), S);
    expect(t.count).toBe(6); // days 28 … 63
    const late = bodyFatTrend(goal, weekly(goal, 126), day(126), S);
    expect(late.count).toBe(weekly(goal, 126).filter((b) => daysBetween(b.dateKey, day(126)) <= A.bfWindowDays).length);
    const future = [...weekly(goal, 49), tape(goal, 56, () => 5)];
    expect(bodyFatTrend(goal, future, day(49), S).latestKey).toBe(day(49));
  });

  it("one measurement per day: the last one of a day wins", () => {
    const body = [...weekly(goal, 42), tape(goal, 49, () => 3), tape(goal, 49)];
    const t = bodyFatTrend(goal, body, day(49), S);
    expect(t.count).toBe(8);
    expect(Math.abs(t.deviationPts!)).toBeLessThan(0.1);
  });

  it("body fat not falling → 'stalled', but only once the gap beats the measurement noise", () => {
    const body = weekly(goal, 56, flatBf(goal));
    const early = bodyFatTrend(goal, body.slice(0, 7), day(42), S);
    expect(early.enough).toBe(true);
    expect(early.deviationPts!).toBeGreaterThan(1.5); // ≈ 6 weeks × 0.28 …
    expect(early.status).toBe("onTrack"); // … still inside the noise of seven tape readings
    const t = bodyFatTrend(goal, body, day(56), S);
    expect(t.status).toBe("stalled");
    expect(t.deviationPts!).toBeGreaterThan(t.thresholdPts!);
    expect(t.thresholdPts!).toBeGreaterThanOrEqual(A.bfTolerancePts);
    expect(Math.abs(t.slopePtsPerWeek!)).toBeLessThan(0.05);
  });

  it("falling at a third of the planned rate → 'behind' (not stalled)", () => {
    const t = bodyFatTrend(goal, weekly(goal, 84, aThird), day(84), S);
    expect(t.status).toBe("behind");
    expect(t.slopePtsPerWeek!).toBeLessThan(-A.bfStallPtsPerWeek);
  });

  it("falling at twice the planned rate → 'ahead'", () => {
    const t = bodyFatTrend(longGoal, weekly(longGoal, 56, twiceAsFast(longGoal)), day(56), S);
    expect(t.status).toBe("ahead");
    expect(t.deviationPts!).toBeLessThan(-t.thresholdPts!);
  });

  it("scattered readings widen the threshold beyond the literature floor", () => {
    const noisyStall = (d: number) => flatBf(goal)(d) + ((d / 7) % 2 === 0 ? 1.5 : -1.5);
    const t = bodyFatTrend(goal, weekly(goal, 63, noisyStall), day(63), S);
    const clean = bodyFatTrend(goal, weekly(goal, 63, flatBf(goal)), day(63), S);
    expect(clean.status).toBe("stalled");
    expect(t.thresholdPts!).toBeGreaterThan(clean.thresholdPts!);
    expect(t.status).toBe("onTrack"); // the same stall, read through ±1.5-point scatter, is not called yet
  });

  it("lean mass falling while body fat follows the plan → leanLoss", () => {
    const t = bodyFatTrend(goal, weekly(goal, 49, undefined, losingLean), day(49), S);
    expect(t.status).toBe("onTrack");
    expect(t.leanLoss).toBe(true);
    expect(t.deviationLeanKg!).toBeLessThan(-t.thresholdLeanKg!);
    expect(t.leanSlopeKgPerWeek!).toBeLessThan(0);
  });

  it("lean mass below plan but not falling is no lean loss", () => {
    const t = bodyFatTrend(goal, weekly(goal, 49, undefined, () => -1.5), day(49), S);
    expect(t.deviationLeanKg!).toBeLessThan(-1);
    expect(t.leanLoss).toBe(false);
  });
});

describe("computeGoalProgress — recomp reads body fat, never weight", () => {
  it("onTrack comes from the body-fat trend", () => {
    const flatWeight = planWeights(goal, 56, (d) => goal.start.weightKg - expectedAtDay(goal, d).weightKg);
    expect(computeGoalProgress(goal, flatWeight, weekly(goal, 56, flatBf(goal)), [], day(56), S).onTrack).toBe("stalled");
    expect(computeGoalProgress(goal, flatWeight, weekly(goal, 56), [], day(56), S).onTrack).toBe("onTrack");
    // the scale says "far ahead", body fat says "on plan"
    const dropping = planWeights(goal, 56, (d) => -0.08 * d);
    expect(computeGoalProgress(goal, dropping, weekly(goal, 56), [], day(56), S).onTrack).toBe("onTrack");
    expect(computeGoalProgress(goal, dropping, weekly(goal, 56, twiceAsFast(goal)), [], day(56), S).onTrack).toBe("ahead");
  });

  it("without enough measurements the verdict stays neutral whatever the weight does", () => {
    for (const off of [(d: number) => -0.1 * d, (d: number) => 0.05 * d]) {
      const p = computeGoalProgress(goal, planWeights(goal, 49, off), [tape(goal, 0)], [], day(49), S);
      expect(p.onTrack).toBe("onTrack");
    }
  });

  it("projects the end from the body-fat rate (plan rate until there is enough data)", () => {
    const today = 49;
    const onPlan = computeGoalProgress(goal, planWeights(goal, today), weekly(goal, today), [], day(today), S);
    expect(Math.abs(onPlan.weeksRemainingProjected! - onPlan.weeksRemainingPlan)).toBeLessThanOrEqual(1);
    const fast = computeGoalProgress(goal, planWeights(goal, today), weekly(goal, today, twiceAsFast(goal)), [], day(today), S);
    expect(fast.weeksRemainingProjected!).toBeLessThan(onPlan.weeksRemainingProjected!);
    expect(fast.projectedDate).toBe(shiftKey(day(today), 7 * fast.weeksRemainingProjected!));
    const stalled = computeGoalProgress(goal, planWeights(goal, today), weekly(goal, today, flatBf(goal)), [], day(today), S);
    expect(stalled.weeksRemainingProjected).toBeNull();
    // weight falling fast with only the start measurement: the plan's body-fat rate, not the scale
    const heavyDrop = computeGoalProgress(goal, planWeights(goal, today, (d) => -0.1 * d), [tape(goal, 0)], [], day(today), S);
    expect(heavyDrop.weeksRemainingProjected).toBe(Math.ceil(heavyDrop.bfToGo / PLAN_BF_RATE));
  });
});

describe("proposeGoalAdjustment — recomp on body fat", () => {
  const W = planWeights(goal, 126);
  const upTo = (n: number) => W.slice(0, n + 1);
  const WL = planWeights(longGoal, 126);
  const longUpTo = (n: number) => WL.slice(0, n + 1);

  it("following the plan → null", () => {
    expect(propose(goal, upTo(49), weekly(goal, 49), 49)).toBeNull();
  });

  it("never proposes from weight alone", () => {
    for (const off of [(d: number) => -0.1 * d, (d: number) => 0.06 * d, (d: number) => goal.start.weightKg - expectedAtDay(goal, d).weightKg]) {
      const weights = planWeights(goal, 49, off);
      expect(propose(goal, weights, [tape(goal, 0)], 49)).toBeNull();
      expect(propose(goal, weights, [], 49)).toBeNull();
      // weight far off, body fat on plan
      expect(propose(goal, weights, weekly(goal, 49), 49)).toBeNull();
    }
  });

  it("too early: nothing inside the 21-day cool-down, even with body fat far behind", () => {
    const worse = (d: number) => flatBf(goal)(d) + 0.2 * d;
    expect(propose(goal, upTo(20), [0, 7, 14, 20].map((d) => tape(goal, d, worse)), 20)).toBeNull();
  });

  it("stale measurements → nothing", () => {
    expect(propose(goal, upTo(56), weekly(goal, 35, flatBf(goal)), 56)).toBeNull();
  });

  it("body fat stalled → 'stalled' with lower calories, previewed", () => {
    const p = propose(goal, upTo(63), weekly(goal, 63, flatBf(goal)), 63)!;
    expect(p).not.toBeNull();
    expect(() => zGoalAdjustmentProposal.parse(p)).not.toThrow();
    expect(p.kind).toBe("stalled");
    expect(p.direction).toBe("recomp");
    expect(p.mood).toBe("worried");
    expect(p.trigger).toBe("goal.adjust.stalled");
    expect(p.deviationBfPts!).toBeGreaterThan(1);
    expect(p.deviationKg).toBeCloseTo(trendDeviationAt(goal, upTo(63), day(63), S)!, 2);
    const lower = p.options[0];
    expect(lower.action).toBe("lowerCalories");
    expect(lower.recommended).toBe(true);
    expect(lower.after!.dailyCalorieTarget).toBeLessThan(p.before.dailyCalorieTarget);
    expect(p.options[1]).toMatchObject({ action: "replan", recommended: false });
    expect(p.messageTr).toContain("yağ oran");
    expect(p.messageTr).not.toContain("Kilo");
  });

  it("body fat falling too slowly → 'behind' with lower calories", () => {
    const p = propose(goal, upTo(91), weekly(goal, 91, aThird), 91)!;
    expect(p.kind).toBe("behind");
    expect(p.options[0].action).toBe("lowerCalories");
    expect(p.messageTr).toContain("puan gerisinde");
  });

  it("body fat ahead, lean mass held → re-plan to an earlier date (+ a tighter target)", () => {
    const p = propose(longGoal, longUpTo(63), weekly(longGoal, 63, twiceAsFast(longGoal)), 63)!;
    expect(p.kind).toBe("ahead");
    expect(p.mood).toBe("cheer");
    expect(p.deviationBfPts!).toBeLessThan(-1);
    const replan = p.options[0];
    expect(replan).toMatchObject({ action: "replan", recommended: true });
    expect(replan.after!.estimatedWeeks).toBeLessThanOrEqual(p.before.estimatedWeeks);
    expect(p.options.find((o) => o.action === "tighten")?.change.targetBodyFatPct).toBe(11);
    expect(p.messageTr).toContain("öndesin");
  });

  it("body fat ahead while lean mass falls → raise calories to protect muscle", () => {
    const p = propose(longGoal, longUpTo(63), weekly(longGoal, 63, twiceAsFast(longGoal), losingLean), 63)!;
    expect(p.kind).toBe("ahead");
    expect(p.options[0]).toMatchObject({ action: "raiseCalories", recommended: true });
    expect(p.options[0].after!.dailyCalorieTarget).toBeGreaterThan(p.before.dailyCalorieTarget);
    expect(p.deviationLeanKg!).toBeLessThan(-1);
    expect(p.messageTr).toContain("yağsız kütle");
  });

  it("lean mass falling while body fat follows the plan → raise calories", () => {
    const p = propose(goal, upTo(49), weekly(goal, 49, undefined, losingLean), 49)!;
    expect(p.kind).toBe("ahead");
    expect(p.options[0].action).toBe("raiseCalories");
    expect(p.messageTr).toContain("yağsız kütle");
  });

  it("behind on fat while losing lean → no calorie cut, only a re-plan", () => {
    const p = propose(goal, upTo(63), weekly(goal, 63, flatBf(goal), losingLean), 63)!;
    expect(p.kind).toBe("stalled");
    expect(p.options.map((o) => o.action)).toEqual(["replan"]);
    expect(p.options[0].recommended).toBe(true);
    expect(p.messageTr).toContain("protein");
  });

  it("a verdict that first shows on the latest reading waits for the next one", () => {
    const body = weekly(goal, 63, flatBf(goal));
    expect(bodyFatTrend(goal, body, day(49), S).status).toBe("onTrack");
    expect(bodyFatTrend(goal, body, day(56), S).status).toBe("stalled");
    expect(propose(goal, upTo(56), body.slice(0, 9), 56)).toBeNull();
    expect(propose(goal, upTo(63), body, 63)!.kind).toBe("stalled");
  });

  it("one slipped tape reading changes nothing: the person's own scatter absorbs it", () => {
    for (const slip of [4, 6, -6]) {
      const body = [...weekly(goal, 56), tape(goal, 63, () => slip)];
      expect(bodyFatTrend(goal, body, day(63), S).status).toBe("onTrack");
      expect(propose(goal, upTo(63), body, 63)).toBeNull();
    }
  });

  it("reached on the latest body fat, even inside the cool-down", () => {
    const p = propose(goal, upTo(10), [tape(goal, 0), { dateKey: day(10), weightKg: 84, bodyFatPct: 14.9 }], 10)!;
    expect(p.kind).toBe("reached");
    expect(p.options.map((o) => o.action)).toEqual(["complete"]);
  });

  it("with a trend, 'reached' needs the trend at the target too, not one low reading", () => {
    // on plan to week 9 (≈ 17.5 %), then a reading 2.6 points low lands at the 15 % target
    const body = [...weekly(goal, 56), tape(goal, 63, () => -2.6)];
    expect(body.at(-1)!.bodyFatPct).toBeLessThanOrEqual(15);
    expect(bodyFatTrend(goal, body, day(63), S).bodyFatPct!).toBeGreaterThan(15);
    expect(propose(goal, upTo(63), body, 63)).toBeNull();
    // running ahead of plan, the trend itself reaches the target: now it counts
    const ahead = weekly(goal, 70, twiceAsFast(goal));
    expect(ahead.at(-1)!.bodyFatPct).toBeLessThanOrEqual(15);
    expect(bodyFatTrend(goal, ahead, day(70), S).bodyFatPct!).toBeLessThanOrEqual(15);
    expect(propose(goal, upTo(70), ahead, 70)!.kind).toBe("reached");
  });

  it("a dismissed body-fat proposal waits a new cool-down", () => {
    const body = weekly(goal, 84, flatBf(goal));
    const p = propose(goal, upTo(63), body.slice(0, 10), 63)!;
    const dismissed: GoalAdjustment = { id: p.id, kind: p.kind, status: "dismissed", action: null, dateKey: day(63), at: "2026-03-09T08:00:00.000Z", before: p.before, after: null };
    const g = { ...goal, adjustments: [dismissed] };
    expect(propose(g, upTo(77), body.slice(0, 12), 77)).toBeNull();
    const again = propose(g, upTo(84), body, 84)!;
    expect(again.kind).toBe("stalled");
    expect(again.id).not.toBe(p.id);
  });

  it("without body entries in the input a recomp only ever proposes 'reached'", () => {
    const todayKey = day(63);
    const body = weekly(goal, 63, flatBf(goal));
    const progress = computeGoalProgress(goal, upTo(63), body, [], todayKey, S);
    expect(progress.onTrack).toBe("stalled");
    expect(proposeGoalAdjustment({ goal, progress, weighIns: upTo(63), todayKey, replanBase: baseFrom(upTo(63)), settings: S })).toBeNull();
  });
});

describe("evaluateGoal — recomp", () => {
  const W = planWeights(goal, 63);

  it("re-plans from the fitted body fat, not from one noisy reading", () => {
    const body = [...weekly(goal, 56, flatBf(goal)), tape(goal, 63, (d) => flatBf(goal)(d) + 1)];
    const ev = evaluate(goal, W, body, 63);
    const fitted = bodyFatTrend(goal, body, day(63), S).bodyFatPct!;
    expect(ev.replanBase).not.toBeNull();
    const leanFitted = body.at(-1)!.weightKg * (1 - fitted / 100);
    const leanNoisy = body.at(-1)!.weightKg * (1 - body.at(-1)!.bodyFatPct / 100);
    const leanUsed = ev.replanBase!.weightKg * (1 - ev.replanBase!.bodyFatPct / 100);
    expect(Math.abs(leanUsed - leanFitted)).toBeLessThan(Math.abs(leanUsed - leanNoisy));
    if (ev.adjustment) {
      for (const o of ev.adjustment.options) {
        if (!o.after) continue;
        expect(replanGoal(goal, o.change, ev.replanBase!, day(63)).initialDailyCalorieTarget).toBe(o.after.dailyCalorieTarget);
      }
    }
  });

  it("without enough measurements the replan base is the latest measurement carried forward, as before", () => {
    const start = tape(goal, 0);
    const ev = evaluate(goal, W, [start], 63);
    expect(ev.replanBase).toMatchObject(estimateCurrentBody(goal, start, ev.progress.actualWeightKg));
  });
});

describe("goalFeedback — recomp", () => {
  const W = planWeights(goal, 70);
  const upTo = (n: number) => W.slice(0, n + 1);
  const WL = planWeights(longGoal, 70);

  it("no measurement since the start → invites one, neutral", () => {
    const ev = evaluate(goal, upTo(20), [tape(goal, 0)], 20);
    expect(() => zGoalFeedback.parse(ev.feedback)).not.toThrow();
    expect(ev.feedback.status).toBe("onTrack");
    expect(ev.feedback.tone).toBe("neutral");
    expect(ev.feedback.trigger).toBe("goal.feedback.measure");
    expect(ev.feedback.textTr).toContain("ölçüm");
    expect(ev.feedback.deviationBfPts).toBeNull();
  });

  it("a recent measurement but not enough yet → says so without nagging", () => {
    const ev = evaluate(goal, upTo(16), [tape(goal, 0), tape(goal, 14)], 16);
    expect(ev.feedback.trigger).toBe("goal.feedback.measure");
    expect(ev.feedback.textTr).toContain("kaydedildi");
  });

  it("weight far off but body fat unknown → still the invitation, never a weight verdict", () => {
    const ev = evaluate(goal, planWeights(goal, 49, (d) => -0.1 * d), [tape(goal, 0)], 49);
    expect(ev.feedback.trigger).toBe("goal.feedback.measure");
    expect(ev.feedback.textTr).not.toContain("kg");
    expect(ev.adjustment).toBeNull();
  });

  it("on plan → positive, with the % complete", () => {
    const ev = evaluate(goal, upTo(49), weekly(goal, 49), 49);
    expect(ev.feedback.status).toBe("onTrack");
    expect(ev.feedback.tone).toBe("positive");
    expect(ev.feedback.textTr).toContain("Yağ oranın planda");
    expect(ev.feedback.textTr).toContain(`%${ev.feedback.bars.goal}`);
    expect(Math.abs(ev.feedback.deviationBfPts!)).toBeLessThan(0.1);
  });

  it("stalled → worried, in body-fat terms, pointing at the proposal", () => {
    const ev = evaluate(goal, upTo(63), weekly(goal, 63, flatBf(goal)), 63);
    expect(ev.feedback.status).toBe("stalled");
    expect(ev.feedback.mood).toBe("worried");
    expect(ev.feedback.textTr).toContain("yağ oranın");
    expect(ev.feedback.textTr).toContain("öneri");
    expect(ev.feedback.deviationBfPts!).toBeGreaterThan(1);
    expect(ev.adjustment!.kind).toBe("stalled");
  });

  it("ahead → cheer with the body-fat lead", () => {
    const ev = evaluate(longGoal, WL.slice(0, 57), weekly(longGoal, 56, twiceAsFast(longGoal)), 56);
    expect(ev.feedback.status).toBe("ahead");
    expect(ev.feedback.mood).toBe("cheer");
    expect(ev.feedback.textTr).toContain("puan öndesin");
  });

  it("losing lean mass on plan → attention about muscle", () => {
    const ev = evaluate(goal, upTo(49), weekly(goal, 49, undefined, losingLean), 49);
    expect(ev.feedback.status).toBe("onTrack");
    expect(ev.feedback.tone).toBe("attention");
    expect(ev.feedback.textTr).toContain("yağsız kütlen");
  });

  it("a cut carries no body-fat deviation", () => {
    const cut = computeGoalPlan({ sex: "male", weightKg: 100, bodyFatPct: 30, heightCm: 180, age: 30, activityLevel: "moderate", targetBodyFatPct: 20, startDate: START, settings: S });
    const cutGoal: AdaptiveGoal = { ...goal, id: "cut", direction: "cut", targetBodyFatPct: 20, plan: cut, start: { ...goal.start, weightKg: 100, bodyFatPct: 30, leanMassKg: 70, fatMassKg: 30 } };
    const ev = evaluateGoal({ goal: cutGoal, weighIns: planWeights(cutGoal, 20), bodyEntries: [], dayIntake: [], todayKey: day(20), settings: S });
    expect(ev.feedback.deviationBfPts).toBeNull();
  });
});

describe("goalFeedback — lean bar after a re-plan", () => {
  it("measures lean progress from the goal start against the lean target from the goal start", () => {
    const weights = planWeights(goal, 42);
    const leanNow = goal.start.leanMassKg + 0.3;
    const base = baseFrom(weights, leanNow);
    const replanned: AdaptiveGoal = { ...goal, plan: replanGoal(goal, {}, base, day(42)) };
    const totalLeanTarget = replanned.plan.targetLeanMassKg! - goal.start.leanMassKg;
    expect(totalLeanTarget).toBeGreaterThan(replanned.plan.leanGainKg!); // the new plan only holds what is left
    const latest: BodyPoint = { dateKey: day(42), weightKg: base.weightKg, bodyFatPct: base.bodyFatPct };
    const progress = computeGoalProgress(replanned, weights, [latest], [], day(42), S);
    const fb = goalFeedback({ goal: replanned, progress, deviationKg: 0, latestBody: latest, todayKey: day(42) });
    expect(fb.bars.lean).toBe(Math.round((0.3 / totalLeanTarget) * 100));
  });
});
