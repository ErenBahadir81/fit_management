/**
 * T7 — goals API: body assessment (FFMI), the three plan directions and the adaptive goal
 * (Floo's proposal, accepted or dismissed with one tap, never applied silently).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  computeGoalPlan,
  DEFAULT_GOAL_SETTINGS,
  shiftKey,
  zGoal,
  zGoalAdjustmentResponse,
  zGoalAssessmentResponse,
  zGoalPreview,
  zGoalView,
  type GoalView,
} from "@fitfloow/core";
import { asUser, createTestApp, seedBasics, type TestApp, type TestUser } from "./harness";
import { Goal } from "../src/models/goal";
import { WeighIn } from "../src/models/body";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.reset();
  await seedBasics();
  t.clock.now = new Date("2026-09-10T09:00:00.000Z");
});

const api = "/api/v1";
const START = "2026-09-10";
/** Navy: exactly the plan's worked example — 103 kg at 10.0 %, 186 cm (FFMI ≈ 26.4, near the limit). */
const eren = { heightCm: 186, neckCm: 40, waistCm: 80.7, weightKg: 103 };
/** Navy ≈ 25.2 % at 90 kg, 180 cm (FFMI ≈ 20.8). */
const heavy = { heightCm: 180, neckCm: 38, waistCm: 98, weightKg: 90 };

async function measured(body: typeof eren, heightCm: number) {
  const u = await asUser(t, { gender: "male", heightCm });
  const res = await t.app.inject({ method: "POST", url: `${api}/body/entries`, headers: u.headers, payload: body });
  expect(res.statusCode).toBe(200);
  return { ...u, entry: res.json().entry };
}

/** `days` daily weigh-ins from `fromKey`, weight given per day index. */
async function weighIns(user: TestUser, fromKey: string, days: number, weightAt: (i: number) => number) {
  await WeighIn.bulkWrite(
    Array.from({ length: days }, (_, i) => ({
      updateOne: {
        filter: { userId: user._id, dateKey: shiftKey(fromKey, i) },
        update: { $set: { weightKg: Math.round(weightAt(i) * 100) / 100, source: "manual" } },
        upsert: true,
      },
    }))
  );
}

function at(dateKey: string) {
  t.clock.now = new Date(`${dateKey}T09:00:00.000Z`);
}

async function view(headers: Record<string, string>): Promise<GoalView> {
  const res = await t.app.inject({ method: "GET", url: `${api}/goals/current`, headers });
  expect(res.statusCode).toBe(200);
  return zGoalView.parse(res.json());
}

describe("GET /goals/assessment", () => {
  it("needs a measurement first", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url: `${api}/goals/assessment`, headers });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("NO_BODY_ENTRY");
  });

  it("reads FFMI and body fat together and recommends a goal", async () => {
    const { headers } = await measured(eren, 186);
    const res = await t.app.inject({ method: "GET", url: `${api}/goals/assessment`, headers });
    expect(res.statusCode).toBe(200);
    const { assessment } = zGoalAssessmentResponse.parse(res.json());
    expect(assessment.bodyFatPct).toBeCloseTo(10, 1);
    expect(assessment.leanMassKg).toBeCloseTo(92.7, 1);
    // 92.7 / 1.86² = 26.8, normalised −0.37 → 26.4
    expect(assessment.ffmi).toBeCloseTo(26.4, 1);
    expect(assessment.ffmiBand).toBe("nearLimit");
    expect(assessment.trainingLevel).toBe("advanced");
    expect(assessment.trainingLevelInferred).toBe(true);
    expect(assessment.recommendation.direction).toBe("recomp");
    expect(assessment.summaryTr).toContain("FFMI 26,4");
  });

  it("recommends a cut at high body fat and honours a stated training level", async () => {
    const { headers } = await measured(heavy, 180);
    const res = await t.app.inject({ method: "GET", url: `${api}/goals/assessment?trainingLevel=beginner`, headers });
    const { assessment } = zGoalAssessmentResponse.parse(res.json());
    expect(assessment.trainingLevel).toBe("beginner");
    expect(assessment.trainingLevelInferred).toBe(false);
    expect(assessment.recommendation.direction).toBe("cut");
    expect(assessment.recommendation.targetBodyFatPct).toBe(15);
  });

  it("rejects an unknown training level", async () => {
    const { headers } = await measured(heavy, 180);
    const res = await t.app.inject({ method: "GET", url: `${api}/goals/assessment?trainingLevel=pro`, headers });
    expect(res.statusCode).toBe(400);
  });
});

describe("plans in three directions", () => {
  it("previews a lean bulk from a lean-mass target alone", async () => {
    const { headers } = await measured(heavy, 180);
    const res = await t.app.inject({ method: "POST", url: `${api}/goals/preview`, headers, payload: { targetLeanGainKg: 3, trainingLevel: "beginner" } });
    expect(res.statusCode).toBe(200);
    const { plan } = zGoalPreview.parse(res.json());
    expect(plan.direction).toBe("bulk");
    expect(plan.leanGainKg).toBeCloseTo(3, 1);
    expect(plan.initialDailyCalorieTarget).toBeGreaterThan(plan.tdee);
    expect(plan.roadmap[0].weeklyDeficitKcal).toBeLessThan(0);
    expect(plan.warnings).toContain("BULK_BF_CEILING"); // starts at 25 %: a cut comes first
  });

  it("previews a recomposition", async () => {
    const { headers } = await measured(heavy, 180);
    const res = await t.app.inject({ method: "POST", url: `${api}/goals/preview`, headers, payload: { direction: "recomp", targetBodyFatPct: 21 } });
    const { plan } = zGoalPreview.parse(res.json());
    expect(plan.direction).toBe("recomp");
    expect(plan.roadmap.at(-1)!.endBfPct).toBeCloseTo(21, 0);
    expect(plan.leanGainKg).toBeGreaterThan(0);
    expect(plan.fatGainKg).toBeLessThan(0);
  });

  it("rejects a bulk without a lean-mass target and a recomp without a body-fat target", async () => {
    const { headers } = await measured(heavy, 180);
    const bulk = await t.app.inject({ method: "POST", url: `${api}/goals/preview`, headers, payload: { direction: "bulk" } });
    expect(bulk.statusCode).toBe(400);
    const recomp = await t.app.inject({ method: "POST", url: `${api}/goals/preview`, headers, payload: { direction: "recomp", targetLeanGainKg: 2 } });
    expect(recomp.statusCode).toBe(400);
  });

  it("creates a bulk goal and stores its direction, lean target and level", async () => {
    const { headers } = await measured({ ...heavy, waistCm: 84, weightKg: 78 }, 180);
    const res = await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetLeanGainKg: 2.5, trainingLevel: "intermediate" } });
    expect(res.statusCode).toBe(200);
    const goal = zGoal.parse(res.json().goal);
    expect(goal.direction).toBe("bulk");
    expect(goal.targetLeanGainKg).toBe(2.5);
    expect(goal.trainingLevel).toBe("intermediate");
    expect(goal.targetBodyFatPct).toBeCloseTo(goal.plan.roadmap.at(-1)!.endBfPct, 5);
    expect(goal.adjustments).toEqual([]);
  });

  it("switches a cut to a bulk with PATCH and restarts the journey from today", async () => {
    const { headers } = await measured(heavy, 180);
    await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 18 } });
    at("2026-09-20");
    const res = await t.app.inject({ method: "PATCH", url: `${api}/goals/current`, headers, payload: { direction: "bulk", targetLeanGainKg: 2 } });
    expect(res.statusCode).toBe(200);
    const goal = zGoal.parse(res.json().goal);
    expect(goal.direction).toBe("bulk");
    expect(goal.targetLeanGainKg).toBe(2);
    expect(goal.start.dateKey).toBe("2026-09-20");
    expect(goal.plan.leanGainKg).toBeCloseTo(2, 1);
  });

  it("serves a goal stored before directions existed as a cut", async () => {
    const { user, headers } = await measured(heavy, 180);
    const plan = computeGoalPlan({
      sex: "male",
      weightKg: 90,
      bodyFatPct: 25.2,
      heightCm: 180,
      activityLevel: "moderate",
      targetBodyFatPct: 20,
      startDate: START,
      settings: DEFAULT_GOAL_SETTINGS,
    });
    const legacyPlan: Record<string, unknown> = { ...plan };
    for (const k of ["direction", "targetLeanMassKg", "leanGainKg", "fatGainKg", "ffmiStart", "ffmiEnd", "trainingLevel"]) delete legacyPlan[k];
    const now = new Date();
    await Goal.collection.insertOne({
      userId: user._id,
      status: "active",
      targetBodyFatPct: 20,
      profile: "optimal",
      start: { dateKey: START, weightKg: 90, bodyFatPct: 25.2, leanMassKg: 67.3, fatMassKg: 22.7, bodyEntryId: null },
      plan: legacyPlan,
      tdeeOverride: null,
      history: [],
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const v = await view(headers);
    expect(v.goal!.direction).toBe("cut");
    expect(v.goal!.plan.direction).toBe("cut");
    expect(v.goal!.adjustments).toEqual([]);
    expect(v.feedback).not.toBeNull();
  });
});

describe("adaptive goal", () => {
  async function cutGoal() {
    const u = await measured(heavy, 180);
    const res = await t.app.inject({ method: "POST", url: `${api}/goals`, headers: u.headers, payload: { targetBodyFatPct: 18 } });
    expect(res.statusCode).toBe(200);
    return u;
  }

  it("gives instant feedback but proposes nothing inside the cool-down", async () => {
    const { user, headers } = await cutGoal();
    await weighIns(user, START, 10, (i) => 90 - 0.3 * i);
    at(shiftKey(START, 9));
    const v = await view(headers);
    expect(v.feedback).not.toBeNull();
    expect(v.feedback!.status).toBe("ahead");
    expect(v.feedback!.textTr).toContain("öndesin");
    expect(v.adjustment).toBeNull();
  });

  it("proposes finishing earlier when ahead, and one tap re-plans exactly as previewed", async () => {
    const { user, headers } = await cutGoal();
    await weighIns(user, START, 29, (i) => 90 - 0.2 * i);
    const today = shiftKey(START, 28);
    at(today);
    const v = await view(headers);
    const proposal = v.adjustment!;
    expect(proposal).not.toBeNull();
    expect(proposal.kind).toBe("ahead");
    expect(proposal.trigger).toBe("goal.adjust.ahead");
    const recommended = proposal.options.find((o) => o.recommended)!;
    expect(recommended.action).toBe("replan");
    expect(recommended.after!.estimatedWeeks).toBeLessThanOrEqual(proposal.before.estimatedWeeks);

    const res = await t.app.inject({ method: "POST", url: `${api}/goals/current/adjustment/accept`, headers, payload: { id: proposal.id } });
    expect(res.statusCode).toBe(200);
    const { goal, adjustment } = zGoalAdjustmentResponse.parse(res.json());
    expect(adjustment.status).toBe("accepted");
    expect(adjustment.action).toBe("replan");
    expect(goal.plan.startKey).toBe(today);
    expect(goal.plan.estimatedWeeks).toBe(recommended.after!.estimatedWeeks);
    expect(goal.plan.initialDailyCalorieTarget).toBe(recommended.after!.dailyCalorieTarget);
    expect(goal.adjustments).toHaveLength(1);

    // The answer restarts the cool-down, and the same id cannot be answered twice.
    expect((await view(headers)).adjustment).toBeNull();
    const again = await t.app.inject({ method: "POST", url: `${api}/goals/current/adjustment/accept`, headers, payload: { id: proposal.id } });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("ADJUSTMENT_STALE");
  });

  it("proposes lower calories when the trend stalls, and remembers a dismissal", async () => {
    const { user, headers } = await cutGoal();
    await weighIns(user, START, 29, () => 90);
    at(shiftKey(START, 28));
    const v = await view(headers);
    const proposal = v.adjustment!;
    expect(proposal.kind).toBe("stalled");
    const lower = proposal.options.find((o) => o.action === "lowerCalories")!;
    expect(lower.recommended).toBe(true);
    expect(lower.after!.dailyCalorieTarget).toBeLessThan(proposal.before.dailyCalorieTarget);
    expect(v.feedback!.status).toBe("stalled");

    const stale = await t.app.inject({ method: "POST", url: `${api}/goals/current/adjustment/dismiss`, headers, payload: { id: "adj_nope" } });
    expect(stale.statusCode).toBe(409);

    const res = await t.app.inject({ method: "POST", url: `${api}/goals/current/adjustment/dismiss`, headers, payload: { id: proposal.id } });
    expect(res.statusCode).toBe(200);
    const { goal, adjustment } = zGoalAdjustmentResponse.parse(res.json());
    expect(adjustment.status).toBe("dismissed");
    expect(goal.plan.startKey).toBe(START); // nothing changed
    expect((await view(headers)).adjustment).toBeNull();
  });

  it("accepts a chosen non-default option", async () => {
    const { user, headers } = await cutGoal();
    await weighIns(user, START, 29, () => 90);
    at(shiftKey(START, 28));
    const proposal = (await view(headers)).adjustment!;
    const res = await t.app.inject({ method: "POST", url: `${api}/goals/current/adjustment/accept`, headers, payload: { id: proposal.id, action: "lowerCalories" } });
    expect(res.statusCode).toBe(200);
    const { goal } = zGoalAdjustmentResponse.parse(res.json());
    const lower = proposal.options.find((o) => o.action === "lowerCalories")!;
    expect(goal.tdeeOverride).toBe(lower.change.tdeeOverride);
    const bad = await t.app.inject({ method: "POST", url: `${api}/goals/current/adjustment/accept`, headers, payload: { id: proposal.id, action: "sideways" } });
    expect(bad.statusCode).toBe(400);
  });

  it("offers to complete a goal that is reached", async () => {
    const { user, headers } = await cutGoal();
    // Target 18 % at the measured lean mass ≈ 82.1 kg; the trend settles near 80.5.
    await weighIns(user, START, 50, (i) => Math.max(80, 90 - 0.3 * i));
    at(shiftKey(START, 49));
    const v = await view(headers);
    expect(v.adjustment!.kind).toBe("reached");
    expect(v.feedback!.status).toBe("reached");
    const res = await t.app.inject({ method: "POST", url: `${api}/goals/current/adjustment/accept`, headers, payload: { id: v.adjustment!.id } });
    expect(res.statusCode).toBe(200);
    expect(res.json().goal.status).toBe("completed");
    expect((await view(headers)).goal).toBeNull();
  });
});
