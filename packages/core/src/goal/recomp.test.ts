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
import { adjustmentId, estimateCurrentBody, proposeGoalAdjustment, replanGoal, type AdaptiveGoal, type ReplanBase } from "./adjust";
import type { WeightPoint } from "./ewma";
import { evaluateGoal, goalFeedback } from "./feedback";
import { computeGoalPlan } from "./plan";
import { bodyFatTrend, computeGoalProgress, expectedAtDay, smoothedBodyFat, trendDeviationAt, type BodyPoint } from "./progress";

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
 * Body fat held at the start value: nothing is happening. With weekly readings (no noise, so the
 * 1.5-point noise floor applies) this is judged "stalled" from week 12 and proposed from week 13,
 * once it held a reading earlier.
 */
const flatBf = (g: AdaptiveGoal) => (d: number) => g.start.bodyFatPct - expectedAtDay(g, d).bodyFatPct;
/** Daily weigh-ins exactly on the plan's expected weight (+ `off(d)`). */
const planWeights = (g: AdaptiveGoal, days: number, off: (d: number) => number = () => 0): WeightPoint[] =>
  Array.from({ length: days + 1 }, (_, d) => ({ dateKey: day(d), weightKg: expectedAtDay(g, d).weightKg + off(d) }));

function baseFrom(points: WeightPoint[], leanKg = goal.start.leanMassKg): ReplanBase {
  const w = points.at(-1)?.weightKg ?? goal.start.weightKg;
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

  it("body fat not falling → 'stalled', but only once the pace gap beats the measurement noise", () => {
    const body = weekly(goal, 84, flatBf(goal));
    const early = bodyFatTrend(goal, body.slice(0, 11), day(70), S);
    expect(early.enough).toBe(true);
    expect(early.deviationPts!).toBeGreaterThan(2.5); // ≈ 10 weeks × 0.28 …
    expect(early.paceGapPtsPerWeek!).toBeCloseTo(PLAN_BF_RATE, 1);
    expect(early.paceZ!).toBeLessThan(A.bfConfidenceZ);
    expect(early.status).toBe("onTrack"); // … still inside the noise of eleven ±1.5-point readings
    const t = bodyFatTrend(goal, body, day(84), S);
    expect(t.status).toBe("stalled");
    expect(t.paceZ!).toBeGreaterThanOrEqual(A.bfConfidenceZ);
    expect(t.deviationPts!).toBeGreaterThanOrEqual(A.bfTolerancePts);
    expect(Math.abs(t.slopePtsPerWeek!)).toBeLessThan(0.05);
  });

  it("a gap in level alone is not a verdict: it may be the start reading's error", () => {
    // The plan was drawn from a start reading 2 points too high; afterwards the person follows the
    // planned pace exactly, 2 points leaner than the plan's line all along.
    const body = [tape(goal, 0), ...weekly(goal, 84, () => -2).slice(1)];
    const t = bodyFatTrend(goal, body, day(84), S);
    expect(t.deviationPts!).toBeLessThan(-1.5);
    expect(Math.abs(t.paceZ!)).toBeLessThan(A.bfConfidenceZ);
    expect(t.status).toBe("onTrack");
  });

  it("falling at a third of the planned rate → 'behind' (not stalled)", () => {
    const t = bodyFatTrend(goal, weekly(goal, 105, aThird), day(105), S);
    expect(t.status).toBe("behind");
    expect(t.slopePtsPerWeek!).toBeLessThan(-A.bfStallPtsPerWeek);
  });

  it("falling at twice the planned rate → 'ahead'", () => {
    const t = bodyFatTrend(longGoal, weekly(longGoal, 77, twiceAsFast(longGoal)), day(77), S);
    expect(t.status).toBe("ahead");
    expect(t.paceZ!).toBeLessThanOrEqual(-A.bfConfidenceZ);
    expect(t.deviationPts!).toBeLessThanOrEqual(-A.bfTolerancePts);
  });

  it("scattered readings count as noise beyond the literature floor", () => {
    const noisyStall = (d: number) => flatBf(goal)(d) + ((d / 7) % 2 === 0 ? 2 : -2);
    const t = bodyFatTrend(goal, weekly(goal, 84, noisyStall), day(84), S);
    const clean = bodyFatTrend(goal, weekly(goal, 84, flatBf(goal)), day(84), S);
    expect(clean.status).toBe("stalled");
    expect(t.paceGapPtsPerWeek!).toBeCloseTo(clean.paceGapPtsPerWeek!, 1);
    expect(t.paceZ!).toBeLessThan(clean.paceZ!);
    expect(t.status).toBe("onTrack"); // the same stall, read through ±2-point scatter, is not called yet
  });

  it("lean mass falling while body fat follows the plan → leanLoss", () => {
    const t = bodyFatTrend(goal, weekly(goal, 63, undefined, losingLean), day(63), S);
    expect(t.status).toBe("onTrack");
    expect(t.leanLoss).toBe(true);
    expect(t.leanPaceZ!).toBeLessThanOrEqual(-A.bfConfidenceZ);
    expect(t.deviationLeanKg!).toBeLessThanOrEqual(-A.leanToleranceKg);
    expect(t.leanSlopeKgPerWeek!).toBeLessThan(0);
  });

  it("several readings in a week count as one (their mean): daily taping does not inflate the evidence", () => {
    const daily = Array.from({ length: 78 }, (_, d) => tape(goal, d, flatBf(goal)));
    const weeklyOnly = weekly(goal, 77, flatBf(goal));
    const a = bodyFatTrend(goal, daily, day(77), S);
    const b = bodyFatTrend(goal, weeklyOnly, day(77), S);
    expect(a.count).toBe(12); // weeks 0 … 11
    expect(Math.abs(a.paceZ! - b.paceZ!)).toBeLessThan(0.25 * b.paceZ!);
    expect(a.status).toBe(b.status);
    expect(a.latestKey).toBe(day(77));
    expect(a.previousKey).toBe(day(76)); // the last reading of the week before
  });

  it("past the plan's end a stall stays a stall: the smoothed body fat is compared with the target", () => {
    const end = goal.plan.roadmap.length * 7;
    for (const d of [end + 7, end + 56, end + 112]) {
      const t = bodyFatTrend(goal, weekly(goal, d, flatBf(goal)), day(d), S);
      expect(t.planEnded).toBe(true);
      expect(t.status).toBe("stalled");
    }
  });

  it("a stall that starts mid-plan is caught once the plan has ended", () => {
    const end = goal.plan.roadmap.length * 7;
    // on plan until week 12, then body fat stays put
    const lateStall = (d: number) => (d <= 84 ? 0 : expectedAtDay(goal, 84).bodyFatPct - expectedAtDay(goal, d).bodyFatPct);
    expect(bodyFatTrend(goal, weekly(goal, 112, lateStall), day(112), S).status).toBe("onTrack"); // too recent to tell
    // after the end the plan expects the target; the plateau's mean (≈ 1.7 points above it) is compared
    expect(bodyFatTrend(goal, weekly(goal, end + 14, lateStall), day(end + 14), S).status).toBe("onTrack"); // 3 readings: not yet
    const after = bodyFatTrend(goal, weekly(goal, end + 28, lateStall), day(end + 28), S);
    expect(after.planEnded).toBe(true);
    expect(["behind", "stalled"]).toContain(after.status);
  });

  it("lean mass below plan but not falling is no lean loss", () => {
    const t = bodyFatTrend(goal, weekly(goal, 49, undefined, () => -1.5), day(49), S);
    expect(t.deviationLeanKg!).toBeLessThan(-1);
    expect(t.leanLoss).toBe(false);
  });
});

describe("computeGoalProgress — recomp reads body fat, never weight", () => {
  it("onTrack comes from the body-fat trend", () => {
    const flatWeight = planWeights(goal, 84, (d) => goal.start.weightKg - expectedAtDay(goal, d).weightKg);
    expect(computeGoalProgress(goal, flatWeight, weekly(goal, 84, flatBf(goal)), [], day(84), S).onTrack).toBe("stalled");
    expect(computeGoalProgress(goal, flatWeight, weekly(goal, 84), [], day(84), S).onTrack).toBe("onTrack");
    // the scale says "far ahead", body fat says "on plan"
    const dropping = planWeights(goal, 84, (d) => -0.08 * d);
    expect(computeGoalProgress(goal, dropping, weekly(goal, 84), [], day(84), S).onTrack).toBe("onTrack");
    expect(computeGoalProgress(goal, dropping, weekly(goal, 84, twiceAsFast(goal)), [], day(84), S).onTrack).toBe("ahead");
  });

  it("without enough measurements the verdict stays neutral whatever the weight does", () => {
    for (const off of [(d: number) => -0.1 * d, (d: number) => 0.05 * d]) {
      const p = computeGoalProgress(goal, planWeights(goal, 49, off), [tape(goal, 0)], [], day(49), S);
      expect(p.onTrack).toBe("onTrack");
    }
  });

  it("projects the end at the plan's pace until the observed pace is shown to differ", () => {
    const today = 49;
    const onPlan = computeGoalProgress(goal, planWeights(goal, today), weekly(goal, today), [], day(today), S);
    expect(Math.abs(onPlan.weeksRemainingProjected! - onPlan.weeksRemainingPlan)).toBeLessThanOrEqual(1);
    // twice as fast for 7 weeks is not yet beyond the tape noise: still the plan's pace
    const early = computeGoalProgress(goal, planWeights(goal, today), weekly(goal, today, twiceAsFast(goal)), [], day(today), S);
    expect(early.onTrack).toBe("onTrack");
    const smoothedEarly = smoothedBodyFat(goal, weekly(goal, today, twiceAsFast(goal)), day(today), S)!;
    expect(early.weeksRemainingProjected).toBe(Math.ceil(Math.max(0, smoothedEarly - 15) / PLAN_BF_RATE));
    // by week 11 it is: the observed pace takes over and the end comes closer
    const L = 77;
    const longOnPlan = computeGoalProgress(longGoal, planWeights(longGoal, L), weekly(longGoal, L), [], day(L), S);
    const fast = computeGoalProgress(longGoal, planWeights(longGoal, L), weekly(longGoal, L, twiceAsFast(longGoal)), [], day(L), S);
    expect(fast.onTrack).toBe("ahead");
    expect(fast.weeksRemainingProjected!).toBeLessThan(longOnPlan.weeksRemainingProjected! / 2);
    expect(fast.projectedDate).toBe(shiftKey(day(L), 7 * fast.weeksRemainingProjected!));
    const stalled = computeGoalProgress(goal, planWeights(goal, 84), weekly(goal, 84, flatBf(goal)), [], day(84), S);
    expect(stalled.onTrack).toBe("stalled");
    expect(stalled.weeksRemainingProjected).toBeNull();
    // weight falling fast with only the start measurement: the plan's body-fat rate, not the scale
    const heavyDrop = computeGoalProgress(goal, planWeights(goal, today, (d) => -0.1 * d), [tape(goal, 0)], [], day(today), S);
    expect(heavyDrop.weeksRemainingProjected).toBe(Math.ceil(heavyDrop.bfToGo / PLAN_BF_RATE));
  });

  it("goal bar, distance and projection follow the smoothed body fat, so one reading swings them far less", () => {
    const today = 56;
    const slipped = [...weekly(goal, 49), tape(goal, today, () => -2)];
    const onPlan = computeGoalProgress(goal, planWeights(goal, today), weekly(goal, today), [], day(today), S);
    const slip = computeGoalProgress(goal, planWeights(goal, today), slipped, [], day(today), S);
    expect(slip.actualBodyFatPct).toBeCloseTo(onPlan.actualBodyFatPct! - 2, 1); // the reading itself is shown as measured …
    const rawToGo = Math.max(0, slip.actualBodyFatPct! - goal.targetBodyFatPct);
    expect(onPlan.bfToGo - rawToGo).toBeGreaterThan(1.5);
    expect(onPlan.bfToGo - slip.bfToGo).toBeLessThan((onPlan.bfToGo - rawToGo) / 2); // … the distance moves far less
    const bfSpan = goal.start.bodyFatPct - goal.targetBodyFatPct;
    expect(slip.percentComplete - onPlan.percentComplete).toBeLessThan(((onPlan.bfToGo - rawToGo) / bfSpan) * 100 * 0.5);
    const rawSwing = onPlan.weeksRemainingProjected! - Math.ceil(rawToGo / PLAN_BF_RATE);
    const swing = onPlan.weeksRemainingProjected! - slip.weeksRemainingProjected!;
    expect(rawSwing).toBeGreaterThan(5);
    expect(Math.abs(swing)).toBeLessThanOrEqual(rawSwing / 2); // … and so does the projection
    expect(slip.bfToGo).toBeCloseTo(smoothedBodyFat(goal, slipped, day(today), S)! - goal.targetBodyFatPct, 1);
  });
});

describe("smoothed body fat across re-plans and callers", () => {
  it("survives a re-plan made before any reading of the new plan", () => {
    const body = weekly(goal, 84);
    const replanned: AdaptiveGoal = { ...goal, plan: replanGoal(goal, {}, baseFrom(planWeights(goal, 86)), day(86)) };
    const t = bodyFatTrend(replanned, body, day(86), S);
    expect(t.count).toBe(0);
    expect(t.smoothedPct!).toBeCloseTo(smoothedBodyFat(goal, body, day(86), S)!, 6);
    const p = computeGoalProgress(replanned, planWeights(goal, 86), body, [], day(86), S);
    expect(p.bfToGo).toBeCloseTo(t.smoothedPct! - goal.targetBodyFatPct, 1);
  });

  it("counts from the goal start, so a caller loading older history gets the same value", () => {
    const body = weekly(goal, 49);
    const older = [...Array.from({ length: 6 }, (_, i) => ({ dateKey: shiftKey(START, -7 * (6 - i)), weightKg: 90, bodyFatPct: 25 })), ...body];
    expect(smoothedBodyFat(goal, older, day(49), S)).toBe(smoothedBodyFat(goal, body, day(49), S));
    expect(computeGoalProgress(goal, planWeights(goal, 49), older, [], day(49), S).percentComplete).toBe(
      computeGoalProgress(goal, planWeights(goal, 49), body, [], day(49), S).percentComplete
    );
  });

  it("past the end with too few readings for either smoothed estimate, the plan's own line still judges", () => {
    // re-planned on a Thursday into a 3-week plan; readings fall into 3 plan weeks but 2 goal weeks
    const short: AdaptiveGoal = { ...goal, plan: { ...goal.plan, startKey: day(3), roadmap: goal.plan.roadmap.slice(0, 3) } };
    const body = [9, 10, 31].map((d) => ({ dateKey: day(d), weightKg: 85, bodyFatPct: 20 }));
    expect(smoothedBodyFat(short, body, day(31), S)).toBeNull();
    const t = bodyFatTrend(short, body, day(31), S);
    expect(t.enough).toBe(true);
    expect(t.planEnded).toBe(true);
    expect(["behind", "stalled"]).toContain(t.status); // 5 points above the 15 % target, not "onTrack"
  });
});

describe("smoothedBodyFat — body fat now, from the recent readings of any plan", () => {
  it("the fitted line at the latest reading; null below the minimum number of readings", () => {
    const body = weekly(goal, 49);
    expect(smoothedBodyFat(goal, body, day(49), S)!).toBeCloseTo(expectedAtDay(goal, 49).bodyFatPct, 1);
    expect(smoothedBodyFat(goal, body.slice(0, 2), day(7), S)).toBeNull();
    expect(smoothedBodyFat(goal, [], day(7), S)).toBeNull();
    // readings outside the window or after today do not count
    expect(smoothedBodyFat(goal, body, day(49 + A.bfWindowDays + 1), S)).toBeNull();
    expect(smoothedBodyFat(goal, [...body, tape(goal, 56, () => 9)], day(49), S)!).toBeCloseTo(expectedAtDay(goal, 49).bodyFatPct, 1);
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
    const p = propose(goal, upTo(91), weekly(goal, 91, flatBf(goal)), 91)!;
    expect(p).not.toBeNull();
    expect(() => zGoalAdjustmentProposal.parse(p)).not.toThrow();
    expect(p.kind).toBe("stalled");
    expect(p.direction).toBe("recomp");
    expect(p.mood).toBe("worried");
    expect(p.trigger).toBe("goal.adjust.stalled");
    expect(p.deviationBfPts!).toBeGreaterThan(1);
    expect(p.deviationKg).toBeCloseTo(trendDeviationAt(goal, upTo(91), day(91), S)!, 2);
    const lower = p.options[0];
    expect(lower.action).toBe("lowerCalories");
    expect(lower.recommended).toBe(true);
    expect(lower.after!.dailyCalorieTarget).toBeLessThan(p.before.dailyCalorieTarget);
    expect(p.options[1]).toMatchObject({ action: "replan", recommended: false });
    expect(p.messageTr).toContain("yağ oran");
    expect(p.messageTr).not.toContain("Kilo");
  });

  it("body fat falling too slowly → 'behind' with lower calories", () => {
    const p = propose(goal, upTo(112), weekly(goal, 112, aThird), 112)!;
    expect(p.kind).toBe("behind");
    expect(p.options[0].action).toBe("lowerCalories");
    expect(p.messageTr).toContain("puan gerisinde");
  });

  it("body fat ahead, lean mass held → re-plan to an earlier date (+ a tighter target)", () => {
    const p = propose(longGoal, longUpTo(84), weekly(longGoal, 84, twiceAsFast(longGoal)), 84)!;
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
    const p = propose(longGoal, longUpTo(84), weekly(longGoal, 84, twiceAsFast(longGoal), losingLean), 84)!;
    expect(p.kind).toBe("ahead");
    expect(p.options[0]).toMatchObject({ action: "raiseCalories", recommended: true });
    expect(p.options[0].after!.dailyCalorieTarget).toBeGreaterThan(p.before.dailyCalorieTarget);
    expect(p.deviationLeanKg!).toBeLessThan(-1);
    expect(p.messageTr).toContain("yağsız kütle");
  });

  it("lean mass falling while body fat follows the plan → raise calories", () => {
    const p = propose(goal, upTo(70), weekly(goal, 70, undefined, losingLean), 70)!;
    expect(p.kind).toBe("ahead");
    expect(p.options[0].action).toBe("raiseCalories");
    expect(p.messageTr).toContain("yağsız kütle");
  });

  it("behind on fat while losing lean → no calorie cut, only a re-plan", () => {
    const p = propose(goal, upTo(91), weekly(goal, 91, flatBf(goal), losingLean), 91)!;
    expect(p.kind).toBe("stalled");
    expect(p.options.map((o) => o.action)).toEqual(["replan"]);
    expect(p.options[0].recommended).toBe(true);
    expect(p.messageTr).toContain("protein");
  });

  it("a verdict that first shows on the latest reading waits for the next one", () => {
    const body = weekly(goal, 91, flatBf(goal));
    expect(bodyFatTrend(goal, body, day(77), S).status).toBe("onTrack");
    expect(bodyFatTrend(goal, body, day(84), S).status).toBe("stalled");
    expect(propose(goal, upTo(84), body.slice(0, 13), 84)).toBeNull();
    expect(propose(goal, upTo(91), body, 91)!.kind).toBe("stalled");
  });

  it("one slipped tape reading changes nothing: the person's own scatter absorbs it", () => {
    for (const slip of [4, 6, -6]) {
      const body = [...weekly(goal, 56), tape(goal, 63, () => slip)];
      expect(bodyFatTrend(goal, body, day(63), S).status).toBe("onTrack");
      expect(propose(goal, upTo(63), body, 63)).toBeNull();
    }
  });

  it("reached once the readings and their smoothed line are at the target, even inside the cool-down", () => {
    const body = [tape(goal, 0), { dateKey: day(7), weightKg: 84, bodyFatPct: 15.2 }, { dateKey: day(14), weightKg: 84, bodyFatPct: 14.8 }];
    const p = propose(goal, upTo(14), body, 14)!;
    expect(p.kind).toBe("reached");
    expect(p.options.map((o) => o.action)).toEqual(["complete"]);
    // with fewer than three weeks of readings one low reading is not enough
    expect(propose(goal, upTo(10), [tape(goal, 0), { dateKey: day(10), weightKg: 84, bodyFatPct: 14.9 }], 10)).toBeNull();
  });

  it("a plan with nothing to do is reached on the reading alone", () => {
    const already = makeRecomp({ id: "goal-recomp-done", bodyFatPct: 20, target: 21 });
    expect(already.plan.roadmap).toHaveLength(0);
    expect(propose(already, upTo(1), [tape(already, 0)], 1)!.kind).toBe("reached");
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

  it("after a re-plan one low reading is still not 'reached': the recent readings of the old plan count too", () => {
    const replanned: AdaptiveGoal = { ...goal, plan: replanGoal(goal, {}, baseFrom(upTo(84)), day(84)) };
    // on plan through week 12 (≈ 16.7 %), re-planned then, and one reading 2 points low a week later
    const body = [...weekly(goal, 84), tape(goal, 91, () => -2)];
    expect(body.at(-1)!.bodyFatPct).toBeLessThanOrEqual(15);
    expect(bodyFatTrend(replanned, body, day(91), S).count).toBeLessThan(A.bfMinMeasurements);
    expect(smoothedBodyFat(goal, body, day(91), S)!).toBeGreaterThan(15);
    expect(propose(replanned, upTo(91), body, 91)).toBeNull();
  });

  it("a new proposal needs a reading taken after the last answer, however short the cool-down", () => {
    const body = weekly(goal, 105, flatBf(goal));
    const p = propose(goal, upTo(91), body.slice(0, 14), 91)!;
    const dismissed: GoalAdjustment = { id: p.id, kind: p.kind, status: "dismissed", action: null, dateKey: day(91), at: "2026-04-06T08:00:00.000Z", before: p.before, after: null };
    const g = { ...goal, adjustments: [dismissed] };
    const quick = { ...S, adaptive: { ...S.adaptive, cooldownDays: 3 } };
    const at = (today: number, readings: BodyPoint[]) =>
      proposeGoalAdjustment({
        goal: g,
        progress: computeGoalProgress(g, upTo(today), readings, [], day(today), quick),
        weighIns: upTo(today),
        bodyEntries: readings,
        todayKey: day(today),
        replanBase: latestBase(upTo(today), readings, day(today)),
        settings: quick,
      });
    expect(at(96, body.slice(0, 14))).toBeNull(); // same readings as the dismissed proposal
    expect(at(98, body.slice(0, 15))!.kind).toBe("stalled"); // a fresh reading still says so
  });

  it("past the plan's end at the planned pace: more time is recommended, not fewer calories", () => {
    const end = goal.plan.roadmap.length * 7;
    const today = end + 28;
    // the start reading was 2 points low: afterwards the person keeps the planned pace, 2 points above the line
    const offByTwo = (d: number) => (d === 0 ? 0 : 2);
    const body = weekly(goal, today, offByTwo);
    const t = bodyFatTrend(goal, body, day(today), S);
    expect(t.planEnded).toBe(true);
    expect(["behind", "stalled"]).toContain(t.status);
    expect(t.paceSlow).toBe(false);
    const p = propose(goal, planWeights(goal, today), body, today)!;
    expect(p.options[0]).toMatchObject({ action: "replan", recommended: true });
    expect(p.options.find((o) => o.action === "lowerCalories")?.recommended ?? false).toBe(false);
    expect(p.messageTr).toContain("Planın süresi doldu");
    const ev = evaluate(goal, planWeights(goal, today), body, today);
    expect(ev.feedback.textTr).toContain("yeni bir tempo");
    // a real stall past the end still gets fewer calories
    const stalled = propose(goal, planWeights(goal, today), weekly(goal, today, flatBf(goal)), today)!;
    expect(stalled.options[0]).toMatchObject({ action: "lowerCalories", recommended: true });
  });

  it("past the plan's end, still short of the target but within the noise: an honest neutral line", () => {
    const end = goal.plan.roadmap.length * 7;
    const today = end + 14;
    const ev = evaluate(goal, planWeights(goal, today), weekly(goal, today, (d) => (d === 0 ? 0 : 1.2)), today);
    expect(ev.progress.onTrack).toBe("onTrack");
    expect(ev.progress.bfToGo).toBeGreaterThan(0);
    expect(ev.feedback.tone).toBe("neutral");
    expect(ev.feedback.textTr).toContain("Planın süresi doldu");
    expect(ev.feedback.textTr).not.toContain("planda");
  });

  it("'behind' and 'stalled' share one id: tape noise flipping between them keeps the proposal answerable", () => {
    const stalled = propose(goal, upTo(91), weekly(goal, 91, flatBf(goal)), 91)!;
    const behind = propose(goal, upTo(112), weekly(goal, 112, aThird), 112)!;
    expect(stalled.kind).toBe("stalled");
    expect(behind.kind).toBe("behind");
    expect(stalled.id).toBe(behind.id);
    expect(stalled.id).toBe(adjustmentId(goal, "behind", START));
  });

  it("a dismissed body-fat proposal waits a new cool-down", () => {
    const body = weekly(goal, 112, flatBf(goal));
    const p = propose(goal, upTo(91), body.slice(0, 14), 91)!;
    const dismissed: GoalAdjustment = { id: p.id, kind: p.kind, status: "dismissed", action: null, dateKey: day(91), at: "2026-04-06T08:00:00.000Z", before: p.before, after: null };
    const g = { ...goal, adjustments: [dismissed] };
    expect(propose(g, upTo(105), body.slice(0, 16), 105)).toBeNull();
    const again = propose(g, upTo(112), body, 112)!;
    expect(again.kind).toBe("stalled");
    expect(again.id).not.toBe(p.id);
  });

  it("without body entries in the input a recomp only ever proposes 'reached'", () => {
    const todayKey = day(91);
    const body = weekly(goal, 91, flatBf(goal));
    const progress = computeGoalProgress(goal, upTo(91), body, [], todayKey, S);
    expect(progress.onTrack).toBe("stalled");
    expect(proposeGoalAdjustment({ goal, progress, weighIns: upTo(91), todayKey, replanBase: baseFrom(upTo(91)), settings: S })).toBeNull();
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
  const W = planWeights(goal, 91);
  const upTo = (n: number) => W.slice(0, n + 1);
  const WL = planWeights(longGoal, 91);

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
    const ev = evaluate(goal, upTo(91), weekly(goal, 91, flatBf(goal)), 91);
    expect(ev.feedback.status).toBe("stalled");
    expect(ev.feedback.mood).toBe("worried");
    expect(ev.feedback.textTr).toContain("yağ oranın");
    expect(ev.feedback.textTr).toContain("öneri");
    expect(ev.feedback.deviationBfPts!).toBeGreaterThan(1);
    expect(ev.adjustment!.kind).toBe("stalled");
  });

  it("ahead → cheer with the body-fat lead", () => {
    const ev = evaluate(longGoal, WL.slice(0, 78), weekly(longGoal, 77, twiceAsFast(longGoal)), 77);
    expect(ev.feedback.status).toBe("ahead");
    expect(ev.feedback.mood).toBe("cheer");
    expect(ev.feedback.textTr).toContain("puan öndesin");
  });

  it("losing lean mass on plan → attention about muscle", () => {
    const ev = evaluate(goal, upTo(63), weekly(goal, 63, undefined, losingLean), 63);
    expect(ev.feedback.status).toBe("onTrack");
    expect(ev.feedback.tone).toBe("attention");
    expect(ev.feedback.textTr).toContain("yağsız kütlen");
  });

  it("stalled while losing lean mass: the line never hints at cutting calories", () => {
    const body = weekly(goal, 91, flatBf(goal), losingLean);
    // with the proposal pending, the line points at it and leaves the advice to it
    const ev = evaluate(goal, upTo(91), body, 91);
    expect(ev.feedback.status).toBe("stalled");
    expect(ev.adjustment!.options.map((o) => o.action)).toEqual(["replan"]);
    expect(ev.adjustment!.messageTr).toContain("Kaloriyi kısmak");
    expect(ev.feedback.textTr).toContain("öneri");
    expect(ev.feedback.textTr).not.toContain("kaloriyi ayarlarız");
    // without a proposal (e.g. just answered), the line gives the advice itself
    const trend = bodyFatTrend(goal, body, day(91), S);
    const progress = computeGoalProgress(goal, upTo(91), body, [], day(91), S, trend);
    const fb = goalFeedback({ goal, progress, deviationKg: 0, latestBody: body.at(-1)!, todayKey: day(91), bodyFat: trend });
    expect(fb.textTr).toContain("yağsız kütlen");
    expect(fb.textTr).toContain("kaloriyi kısmadan");
  });

  it("a pending proposal is never contradicted by the line's own advice", () => {
    // A stall proposal that cuts calories is pending, and today's verdict alone also sees lean loss
    // (the proposal needs it at the previous reading too, so it still cuts calories).
    const body = weekly(goal, 91, flatBf(goal));
    const ev = evaluate(goal, upTo(91), body, 91);
    expect(ev.adjustment!.options[0]).toMatchObject({ action: "lowerCalories", recommended: true });
    const trend = { ...bodyFatTrend(goal, body, day(91), S), leanLoss: true };
    const fb = goalFeedback({ goal, progress: ev.progress, deviationKg: 0, latestBody: body.at(-1)!, todayKey: day(91), adjustment: ev.adjustment, bodyFat: trend });
    expect(fb.textTr).not.toContain("kaloriyi kısmadan");
    expect(fb.textTr).not.toContain("kaloriyi ayarlarız");
    expect(fb.textTr).toContain("öneri");
  });

  it("recomp: the fat bar is the goal bar (both smoothed)", () => {
    const slipped = [...weekly(goal, 49), tape(goal, 56, () => -2)];
    const ev = evaluate(goal, upTo(56), slipped, 56);
    expect(ev.feedback.bars.fat).toBe(ev.feedback.bars.goal);
  });

  it("tape readings without separate weigh-ins still get the body-fat line", () => {
    const ev = evaluate(goal, [], weekly(goal, 91, flatBf(goal)), 91);
    expect(ev.progress.actualWeightKg).toBeNull();
    expect(ev.feedback.status).toBe("stalled");
    expect(ev.feedback.trigger).toBe("goal.feedback.stalled");
    const none = evaluate(goal, [], [], 20);
    expect(none.feedback.status).toBe("noData");
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
