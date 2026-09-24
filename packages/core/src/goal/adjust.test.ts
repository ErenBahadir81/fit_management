import { describe, expect, it } from "vitest";
import type { GoalProfile } from "../schemas/common";
import { zGoalAdjustmentProposal, type GoalAdjustment, type GoalDirection, type Recalibration } from "../schemas/goal";
import { DEFAULT_GOAL_SETTINGS } from "../schemas/settings";
import { daysBetween, shiftKey } from "../time/index";
import {
  adjustmentId,
  adjustmentSinceKey,
  proposeGoalAdjustment,
  remainingLeanGain,
  replanGoal,
  type AdaptiveGoal,
  type ReplanBase,
} from "./adjust";
import type { WeightPoint } from "./ewma";
import { computeGoalPlan } from "./plan";
import { computeGoalProgress, expectedAtDay, tdeeAtDay } from "./progress";

const S = DEFAULT_GOAL_SETTINGS;
const START = "2026-01-05";
const day = (n: number) => shiftKey(START, n);

interface Person {
  weightKg: number;
  bodyFatPct: number;
}

function makeGoal(
  direction: GoalDirection,
  who: Person,
  target: { bf?: number; lean?: number },
  extra: { id?: string; profile?: GoalProfile; adjustments?: GoalAdjustment[] } = {}
): AdaptiveGoal {
  const plan = computeGoalPlan({
    sex: "male",
    weightKg: who.weightKg,
    bodyFatPct: who.bodyFatPct,
    heightCm: 180,
    age: 30,
    activityLevel: "moderate",
    direction,
    targetBodyFatPct: target.bf ?? null,
    targetLeanGainKg: target.lean ?? null,
    profile: extra.profile ?? "optimal",
    startDate: START,
    settings: S,
  });
  const fat = (who.weightKg * who.bodyFatPct) / 100;
  return {
    id: extra.id ?? `goal-${direction}`,
    direction,
    targetBodyFatPct: target.bf ?? plan.roadmap.at(-1)?.endBfPct ?? who.bodyFatPct,
    targetLeanGainKg: target.lean ?? null,
    trainingLevel: null,
    profile: extra.profile ?? "optimal",
    tdeeOverride: null,
    adjustments: extra.adjustments ?? [],
    start: { dateKey: START, weightKg: who.weightKg, bodyFatPct: who.bodyFatPct, leanMassKg: who.weightKg - fat, fatMassKg: fat, bodyEntryId: null },
    plan,
  };
}

/** Daily weigh-ins from day 0 to `days`, following the plan plus `offset(d)`. */
function weighIns(goal: AdaptiveGoal, days: number, offset: (d: number) => number = () => 0): WeightPoint[] {
  return Array.from({ length: days + 1 }, (_, d) => ({ dateKey: day(d), weightKg: expectedAtDay(goal, d).weightKg + offset(d) }));
}
const flat = (w: number, days: number): WeightPoint[] => Array.from({ length: days + 1 }, (_, d) => ({ dateKey: day(d), weightKg: w }));
const slope = (w0: number, perWeek: number, days: number): WeightPoint[] =>
  Array.from({ length: days + 1 }, (_, d) => ({ dateKey: day(d), weightKg: w0 + (perWeek * d) / 7 }));

/** Current state for re-planning: last weigh-in, lean mass held at the goal start. */
function baseFrom(goal: AdaptiveGoal, points: WeightPoint[], lean = goal.start.leanMassKg): ReplanBase {
  const w = points.at(-1)!.weightKg;
  return { sex: "male", weightKg: w, bodyFatPct: (1 - lean / w) * 100, heightCm: 180, age: 30, activityLevel: "moderate", settings: S };
}

function propose(goal: AdaptiveGoal, points: WeightPoint[], today: number, extra: { base?: ReplanBase; recalibration?: Recalibration | null } = {}) {
  const todayKey = day(today);
  const progress = computeGoalProgress(goal, points, [], [], todayKey, S);
  return proposeGoalAdjustment({
    goal,
    progress,
    weighIns: points,
    todayKey,
    replanBase: extra.base ?? baseFrom(goal, points),
    recalibration: extra.recalibration ?? null,
    settings: S,
  });
}

const CUT: Person = { weightKg: 100, bodyFatPct: 30 };
const cutGoal = makeGoal("cut", CUT, { bf: 20 });
const LEAN: Person = { weightKg: 75, bodyFatPct: 12 };
const bulkGoal = makeGoal("bulk", LEAN, { lean: 3 });
const RECOMP: Person = { weightKg: 85, bodyFatPct: 20 };
const recompGoal = makeGoal("recomp", RECOMP, { bf: 15 });

describe("proposeGoalAdjustment — cut", () => {
  it("no proposal while following the plan", () => {
    const pts = weighIns(cutGoal, 35);
    expect(propose(cutGoal, pts, 35)).toBeNull();
  });

  it("no proposal inside the 21-day cool-down even when far off", () => {
    const pts = weighIns(cutGoal, 20, (d) => -0.15 * d); // 3 kg ahead by day 20
    expect(propose(cutGoal, pts, 20)).toBeNull();
    const behind = weighIns(cutGoal, 20, (d) => 0.15 * d);
    expect(propose(cutGoal, behind, 20)).toBeNull();
    expect(propose(cutGoal, flat(100, 20), 20)).toBeNull();
  });

  it("sustained ahead → 'ahead', replan recommended with an earlier or equal end", () => {
    const pts = weighIns(cutGoal, 35, (d) => -0.05 * d); // 1.75 kg ahead today, ~1.4 a week ago
    const p = propose(cutGoal, pts, 35)!;
    expect(p).not.toBeNull();
    expect(() => zGoalAdjustmentProposal.parse(p)).not.toThrow();
    expect(p.kind).toBe("ahead");
    expect(p.direction).toBe("cut");
    expect(p.deviationKg).toBeLessThan(-0.4);
    expect(p.mood).toBe("cheer");
    expect(p.trigger).toBe("goal.adjust.ahead");
    const replan = p.options.find((o) => o.action === "replan")!;
    expect(replan.recommended).toBe(true);
    expect(p.options.filter((o) => o.recommended)).toHaveLength(1);
    expect(replan.after!.estimatedWeeks).toBeLessThanOrEqual(p.before.estimatedWeeks);
    expect(replan.after!.targetBodyFatPct).toBe(20);
    const tighten = p.options.find((o) => o.action === "tighten");
    expect(tighten?.change.targetBodyFatPct).toBe(19);
    expect(tighten?.after!.targetBodyFatPct).toBe(19);
    expect(tighten!.after!.targetWeightKg).toBeLessThan(replan.after!.targetWeightKg);
    expect(p.messageTr).toContain("öndesin");
  });

  it("before snapshot is today's roadmap week and the weeks left", () => {
    const pts = weighIns(cutGoal, 35, (d) => -0.05 * d);
    const p = propose(cutGoal, pts, 35)!;
    expect(p.before.dailyCalorieTarget).toBe(cutGoal.plan.roadmap[5].dailyCalorieTarget);
    expect(p.before.estimatedWeeks).toBe(cutGoal.plan.estimatedWeeks - 5);
    expect(p.before.targetDate).toBe(cutGoal.plan.targetDate);
  });

  it("a transient deviation (only the last days) → null", () => {
    // −1.6 kg on the last four days (bigger drops would be rejected as outliers by the EWMA)
    const pts = weighIns(cutGoal, 35, (d) => (d >= 32 ? -1.6 : 0));
    // today's trend is already beyond tolerance…
    const progress = computeGoalProgress(cutGoal, pts, [], [], day(35), S);
    expect(progress.onTrack).toBe("ahead");
    // …but a week ago it was on plan, so nothing is proposed yet
    expect(propose(cutGoal, pts, 35)).toBeNull();
  });

  it("sustained behind → lowerCalories recommended with fewer calories", () => {
    const pts = weighIns(cutGoal, 35, (d) => Math.min(1.2, 0.05 * d));
    const p = propose(cutGoal, pts, 35)!;
    expect(p.kind).toBe("behind");
    expect(p.deviationKg).toBeGreaterThan(0.4);
    const lower = p.options.find((o) => o.action === "lowerCalories")!;
    expect(lower.recommended).toBe(true);
    expect(lower.after!.dailyCalorieTarget).toBeLessThan(p.before.dailyCalorieTarget);
    const tdeeNow = tdeeAtDay(cutGoal, 35);
    expect(lower.change.tdeeOverride).toBe(Math.round(tdeeNow - S.adaptive.kcalStep));
    expect(lower.labelTr).toMatch(/^Günde \d+ kcal azalt$/);
    const late = p.options.find((o) => o.action === "replan")!;
    expect(late.recommended).toBe(false);
    expect(late.labelTr).toContain("ötele");
    expect(p.messageTr).toContain("gerisinde");
  });

  it("behind uses a measured TDEE when an applied recalibration found a lower one", () => {
    const pts = weighIns(cutGoal, 35, (d) => Math.min(1.2, 0.05 * d));
    const tdeeNow = tdeeAtDay(cutGoal, 35);
    const recal: Recalibration = {
      tdeeFormula: cutGoal.plan.tdeeFormula,
      tdeeObserved: tdeeNow - 400,
      tdeeUsed: tdeeNow - 300,
      daysUsed: 21,
      avgIntake: 2200,
      weightDeltaKg: -1,
      applied: true,
      reason: null,
    };
    const p = propose(cutGoal, pts, 35, { recalibration: recal })!;
    const lower = p.options.find((o) => o.action === "lowerCalories")!;
    expect(lower.change.tdeeOverride).toBe(Math.round(tdeeNow - 300));
    expect(p.messageTr).toContain("Ölçülen");
    const plain = propose(cutGoal, pts, 35)!.options.find((o) => o.action === "lowerCalories")!;
    // the cut may already sit on the BMR floor, so the measured option is never *higher*
    expect(lower.after!.dailyCalorieTarget).toBeLessThanOrEqual(plain.after!.dailyCalorieTarget);
    expect(lower.after!.dailyCalorieTarget).toBeLessThan(p.before.dailyCalorieTarget);

    // not applied, or pointing the wrong way → the fixed step
    for (const r of [{ ...recal, applied: false }, { ...recal, tdeeUsed: tdeeNow + 200 }, { ...recal, tdeeUsed: tdeeNow - 20 }]) {
      const q = propose(cutGoal, pts, 35, { recalibration: r })!;
      expect(q.options.find((o) => o.action === "lowerCalories")!.change.tdeeOverride).toBe(Math.round(tdeeNow - S.adaptive.kcalStep));
    }
  });

  it("stalled for two weeks → 'stalled' with lowerCalories", () => {
    const pts = flat(100, 35);
    const p = propose(cutGoal, pts, 35)!;
    expect(p.kind).toBe("stalled");
    expect(p.mood).toBe("worried");
    expect(p.trigger).toBe("goal.adjust.stalled");
    expect(p.options[0].action).toBe("lowerCalories");
    expect(p.messageTr).toContain("İki haftadır");
  });

  it("reached (at target weight) → 'complete', even inside the cool-down", () => {
    const pts = flat(cutGoal.plan.targetWeightKg, 5);
    const p = propose(cutGoal, pts, 5)!;
    expect(p.kind).toBe("reached");
    expect(p.options[0]).toMatchObject({ action: "complete", recommended: true, after: null });
    const tighten = p.options.find((o) => o.action === "tighten")!;
    expect(tighten.change.targetBodyFatPct).toBe(19);
    expect(tighten.recommended).toBe(false);
    expect(p.mood).toBe("proud");
    expect(p.trigger).toBe("goal.completed");
  });

  it("no tighten option when one point lower would approach essential fat", () => {
    const lean = makeGoal("cut", { weightKg: 80, bodyFatPct: 10 }, { bf: 6.5 });
    const p = propose(lean, flat(lean.plan.targetWeightKg, 3), 3)!;
    expect(p.kind).toBe("reached");
    expect(p.options.map((o) => o.action)).toEqual(["complete"]);
  });
});

describe("proposeGoalAdjustment — ids and cool-down", () => {
  const pts = weighIns(cutGoal, 35, (d) => -0.05 * d);

  it("id is deterministic and depends on goal, kind and since-key", () => {
    const a = propose(cutGoal, pts, 35)!;
    const b = propose(cutGoal, pts, 35)!;
    expect(a).toEqual(b);
    expect(a.id).toBe(adjustmentId(cutGoal, "ahead", START));
    expect(a.id).toMatch(/^adj_[0-9a-z]+$/);
    expect(adjustmentId(cutGoal, "behind", START)).not.toBe(a.id);
    expect(adjustmentId({ ...cutGoal, id: "other" }, "ahead", START)).not.toBe(a.id);
    expect(adjustmentId(cutGoal, "ahead", day(1))).not.toBe(a.id);
    // stable across the days until answered
    expect(propose(cutGoal, weighIns(cutGoal, 36, (d) => -0.05 * d), 36)!.id).toBe(a.id);
  });

  it("a proposal whose id is already answered is not repeated", () => {
    const p = propose(cutGoal, pts, 35)!;
    const answered: GoalAdjustment = {
      id: p.id,
      kind: p.kind,
      status: "dismissed",
      action: null,
      dateKey: START, // does not move the since-key, so only the id check applies
      at: "2026-01-05T08:00:00.000Z",
      before: p.before,
      after: null,
    };
    expect(propose({ ...cutGoal, adjustments: [answered] }, pts, 35)).toBeNull();
  });

  it("a dismissed answer restarts the cool-down from its date", () => {
    const p = propose(cutGoal, pts, 35)!;
    const dismissed: GoalAdjustment = {
      id: p.id,
      kind: p.kind,
      status: "dismissed",
      action: null,
      dateKey: day(30),
      at: "2026-02-04T08:00:00.000Z",
      before: p.before,
      after: null,
    };
    const g = { ...cutGoal, adjustments: [dismissed] };
    expect(adjustmentSinceKey(g)).toBe(day(30));
    expect(propose(g, pts, 35)).toBeNull();
    // 21 days after the answer, still ahead → proposed again with a new id
    const later = weighIns(cutGoal, 51, (d) => -0.05 * d);
    const again = propose(g, later, 51)!;
    expect(again).not.toBeNull();
    expect(again.kind).toBe("ahead");
    expect(again.id).not.toBe(p.id);
    expect(again.id).toBe(adjustmentId(g, "ahead", day(30)));
  });

  it("since-key follows a later plan start", () => {
    const replanned = { ...cutGoal, plan: { ...cutGoal.plan, startKey: day(10) } };
    expect(adjustmentSinceKey(replanned)).toBe(day(10));
    expect(adjustmentSinceKey(cutGoal)).toBe(START);
  });
});

describe("proposeGoalAdjustment — bulk", () => {
  const planned = bulkGoal.plan.roadmap[5].rateKgPerWeek;

  it("following the plan → null", () => {
    expect(propose(bulkGoal, weighIns(bulkGoal, 35), 35)).toBeNull();
  });

  it("gaining > 1.5× the plan → 'ahead' with lowerCalories", () => {
    const pts = slope(75, planned * 2.5, 35);
    const p = propose(bulkGoal, pts, 35)!;
    expect(p.kind).toBe("ahead");
    expect(p.direction).toBe("bulk");
    expect(p.options[0].action).toBe("lowerCalories");
    expect(p.options[0].recommended).toBe(true);
    expect(p.options[0].after!.dailyCalorieTarget).toBeLessThan(p.before.dailyCalorieTarget);
    expect(p.options[0].labelTr).toContain("azalt");
    expect(p.options.find((o) => o.action === "replan")).toBeDefined();
    expect(p.messageTr).toContain("yağ");
  });

  it("gaining < 0.5× the plan → 'behind' with raiseCalories", () => {
    const pts = slope(75, planned * 0.3, 35);
    const p = propose(bulkGoal, pts, 35)!;
    expect(p.kind).toBe("behind");
    const raise = p.options[0];
    expect(raise.action).toBe("raiseCalories");
    expect(raise.after!.dailyCalorieTarget).toBeGreaterThan(p.before.dailyCalorieTarget);
    expect(raise.labelTr).toContain("ekle");
    expect(raise.change.tdeeOverride).toBe(Math.round(tdeeAtDay(bulkGoal, 35) + S.adaptive.kcalStep));
  });

  it("flat weight → 'stalled' with raiseCalories", () => {
    const p = propose(bulkGoal, flat(75, 35), 35)!;
    expect(p.kind).toBe("stalled");
    expect(p.options[0].action).toBe("raiseCalories");
    expect(p.options[0].after!.dailyCalorieTarget).toBeGreaterThan(p.before.dailyCalorieTarget);
  });

  it("within the cool-down nothing, even at 3× the rate", () => {
    expect(propose(bulkGoal, slope(75, planned * 3, 20), 20)).toBeNull();
  });

  it("reached (target weight hit) → complete + '+1 kg' tighten", () => {
    const p = propose(bulkGoal, flat(bulkGoal.plan.targetWeightKg, 4), 4, { base: baseFrom(bulkGoal, flat(bulkGoal.plan.targetWeightKg, 4), bulkGoal.start.leanMassKg + 3) })!;
    expect(p.kind).toBe("reached");
    expect(p.options[0].action).toBe("complete");
    const more = p.options.find((o) => o.action === "tighten")!;
    expect(more.change.targetLeanGainKg).toBe(4);
    expect(more.after!.targetLeanGainKg).toBe(4);
    expect(more.after!.estimatedWeeks).toBeGreaterThan(0);
  });
});

describe("proposeGoalAdjustment — recomp", () => {
  // A recomp is judged on body-fat measurements (recomp.test.ts); the scale alone never proposes.
  it("losing weight much faster than planned proposes nothing without body-fat data", () => {
    const pts = weighIns(recompGoal, 35, (d) => -0.05 * d);
    expect(computeGoalProgress(recompGoal, pts, [], [], day(35), S).onTrack).toBe("onTrack");
    expect(propose(recompGoal, pts, 35)).toBeNull();
  });

  it("flat weight is neither a stall nor 'behind' on a recomp", () => {
    expect(computeGoalProgress(recompGoal, flat(85, 35), [], [], day(35), S).onTrack).toBe("onTrack");
    expect(propose(recompGoal, flat(85, 35), 35)).toBeNull();
  });

  it("reached on body fat, not weight (three weeks of readings at the target)", () => {
    const pts = flat(85, 14);
    const body = [
      { dateKey: day(0), weightKg: 85, bodyFatPct: 20 },
      { dateKey: day(7), weightKg: 85, bodyFatPct: 15.1 },
      { dateKey: day(14), weightKg: 85, bodyFatPct: 14.8 },
    ];
    const progress = computeGoalProgress(recompGoal, pts, body, [], day(14), S);
    const p = proposeGoalAdjustment({ goal: recompGoal, progress, weighIns: pts, bodyEntries: body, todayKey: day(14), replanBase: baseFrom(recompGoal, pts), settings: S })!;
    expect(p.kind).toBe("reached");
    expect(p.options.map((o) => o.action)).toEqual(["complete"]);
    // one low reading alone is not enough
    const single = [body[0], body[2]];
    const one = computeGoalProgress(recompGoal, pts, single, [], day(14), S);
    expect(proposeGoalAdjustment({ goal: recompGoal, progress: one, weighIns: pts, bodyEntries: single, todayKey: day(14), replanBase: baseFrom(recompGoal, pts), settings: S })).toBeNull();
  });
});

describe("replanGoal", () => {
  it("with a change reproduces the option's preview", () => {
    const pts = weighIns(cutGoal, 35, (d) => Math.min(1.2, 0.05 * d));
    const base = baseFrom(cutGoal, pts);
    const p = propose(cutGoal, pts, 35, { base })!;
    for (const o of p.options) {
      if (!o.after) continue;
      const plan = replanGoal(cutGoal, o.change, base, day(35));
      expect(plan.startKey).toBe(day(35));
      expect(plan.initialDailyCalorieTarget).toBe(o.after.dailyCalorieTarget);
      expect(plan.estimatedWeeks).toBe(o.after.estimatedWeeks);
      expect(plan.targetDate).toBe(o.after.targetDate);
      expect(plan.targetWeightKg).toBe(o.after.targetWeightKg);
      expect(daysBetween(day(35), plan.targetDate)).toBe(7 * plan.estimatedWeeks);
    }
  });

  it("keeps the goal's parameters when the change is empty", () => {
    const base = baseFrom(cutGoal, flat(95, 1));
    const plan = replanGoal(cutGoal, {}, base, day(20));
    expect(plan.direction).toBe("cut");
    expect(plan.tdee).toBe(plan.tdeeFormula);
    const withOverride = replanGoal({ ...cutGoal, tdeeOverride: 2500 }, {}, base, day(20));
    expect(withOverride.tdee).toBe(2500);
    // an explicit null clears a stored override
    expect(replanGoal({ ...cutGoal, tdeeOverride: 2500 }, { tdeeOverride: null }, base, day(20)).tdee).toBe(plan.tdeeFormula);
  });

  it("bulk re-plans aim at the lean mass left to the original target", () => {
    const base = { ...baseFrom(bulkGoal, flat(76, 1), bulkGoal.start.leanMassKg + 1) };
    const plan = replanGoal(bulkGoal, {}, base, day(40));
    expect(plan.direction).toBe("bulk");
    expect(plan.leanGainKg!).toBeCloseTo(2, 1);
  });
});

describe("remainingLeanGain", () => {
  const leanStart = bulkGoal.start.leanMassKg; // 66

  it("target lean mass minus lean now", () => {
    expect(remainingLeanGain(bulkGoal, { weightKg: 75, bodyFatPct: 12 })).toBeCloseTo(3, 2);
    const now = { weightKg: 77, bodyFatPct: (1 - (leanStart + 1.5) / 77) * 100 };
    expect(remainingLeanGain(bulkGoal, now)).toBeCloseTo(1.5, 2);
  });

  it("never below 0.25 kg", () => {
    expect(remainingLeanGain(bulkGoal, { weightKg: 80, bodyFatPct: 10 })).toBe(0.25);
  });

  it("falls back to the plan's lean gain when the goal has no explicit target", () => {
    expect(remainingLeanGain({ ...bulkGoal, targetLeanGainKg: null }, { weightKg: 75, bodyFatPct: 12 })).toBeCloseTo(bulkGoal.plan.leanGainKg!, 2);
  });
});
