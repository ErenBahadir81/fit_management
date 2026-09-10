import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { shiftKey, zGoal, zGoalPreview, zGoalView } from "@fitfloow/core";
import { asUser, createTestApp, seedBasics, type TestApp, type TestUser } from "./harness";
import { Goal, WeeklyReportCache } from "../src/models/goal";
import { WeighIn } from "../src/models/body";
import { MealEntry } from "../src/models/nutrition";

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
/** Navy body fat for these numbers is exactly 10.0 % — the worked example from the plan. */
const eren = { heightCm: 186, neckCm: 40, waistCm: 80.7, weightKg: 103 };

async function withMeasurement(opts: Parameters<typeof asUser>[1] = {}) {
  const u = await asUser(t, { gender: "male", heightCm: 186, ...(opts as object) });
  const res = await t.app.inject({ method: "POST", url: `${api}/body/entries`, headers: u.headers, payload: eren });
  return { ...u, entry: res.json().entry };
}

/** Meal entries land straight in the collection — the nutrition routes belong to another module. */
async function logMeals(user: TestUser, fromKey: string, days: number, kcal: number) {
  await MealEntry.insertMany(
    Array.from({ length: days }, (_, i) => ({
      userId: user._id,
      dateKey: shiftKey(fromKey, i),
      meal: "lunch",
      name: "Test",
      grams: 300,
      per100g: { kcal: kcal / 3, protein: 10, carbs: 20, fat: 5 },
      totals: { kcal, protein: 30, carbs: 60, fat: 15 },
      source: "manual",
      loggedAt: new Date(`${shiftKey(fromKey, i)}T12:00:00.000Z`),
    }))
  );
}

async function logWeighIns(user: TestUser, fromKey: string, days: number, start: number, perDay: number) {
  await WeighIn.bulkWrite(
    Array.from({ length: days }, (_, i) => ({
      updateOne: {
        filter: { userId: user._id, dateKey: shiftKey(fromKey, i) },
        update: { $set: { weightKg: Math.round((start - perDay * i) * 100) / 100, source: "manual" } },
        upsert: true,
      },
    }))
  );
}

describe("POST /goals/preview", () => {
  it("needs a measurement first", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "POST", url: `${api}/goals/preview`, headers, payload: { targetBodyFatPct: 12 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("NO_BODY_ENTRY");
  });

  it("returns the plan without saving anything", async () => {
    const { headers, user } = await withMeasurement();
    const res = await t.app.inject({ method: "POST", url: `${api}/goals/preview`, headers, payload: { targetBodyFatPct: 7 } });
    expect(res.statusCode).toBe(200);
    const { plan, warnings } = res.json();
    expect(plan.fatToLoseKg).toBeCloseTo(3.32, 2);
    expect(plan.targetWeightKg).toBeCloseTo(99.68, 1);
    expect(plan.roadmap.length).toBeGreaterThan(3);
    expect(plan.startKey).toBe("2026-09-10");
    expect(warnings).toContain("ALPERT_LIMITED");
    expect(await Goal.countDocuments({ userId: user._id })).toBe(0);
  });

  it("blends in Mifflin when the birth date is known", async () => {
    const { headers } = await withMeasurement({ birthDate: "1992-05-04" });
    const res = await t.app.inject({ method: "POST", url: `${api}/goals/preview`, headers, payload: { targetBodyFatPct: 8 } });
    expect(res.json().plan.bmrMifflin).not.toBeNull();
  });

  it("validates the target range", async () => {
    const { headers } = await withMeasurement();
    const res = await t.app.inject({ method: "POST", url: `${api}/goals/preview`, headers, payload: { targetBodyFatPct: 1 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });
});

describe("POST /goals", () => {
  it("creates the active goal from the latest measurement", async () => {
    const { headers, user, entry } = await withMeasurement();
    const res = await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7, profile: "optimal" } });
    expect(res.statusCode).toBe(200);
    const goal = res.json().goal;
    expect(goal.status).toBe("active");
    expect(goal.start).toMatchObject({ dateKey: "2026-09-10", weightKg: 103, bodyEntryId: entry.id });
    expect(goal.plan.estimatedWeeks).toBeGreaterThan(0);
    expect(goal.tdeeOverride).toBeNull();
    expect(await Goal.countDocuments({ userId: user._id, status: "active" })).toBe(1);
  });

  it("rejects a second active goal with GOAL_EXISTS", async () => {
    const { headers } = await withMeasurement();
    await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } });
    const res = await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 9 } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("GOAL_EXISTS");
  });

  it("requires a measurement", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 12 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("NO_BODY_ENTRY");
  });

  it("invalidates the cached weekly report", async () => {
    const { headers, user } = await withMeasurement();
    await WeeklyReportCache.create({ userId: user._id, weekKey: "2026-09-06", report: {} });
    await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } });
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBe(0);
  });
});

describe("GET /goals/current", () => {
  it("is null for a user without a goal", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url: `${api}/goals/current`, headers });
    expect(res.json()).toEqual({ goal: null, progress: null });
  });

  it("returns live progress against the plan", async () => {
    const { headers, user } = await withMeasurement();
    await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } });
    await logWeighIns(user, "2026-09-10", 15, 103, 0.07);
    await logMeals(user, "2026-09-10", 15, 2600);
    t.clock.now = new Date("2026-09-24T09:00:00.000Z");

    const res = await t.app.inject({ method: "GET", url: `${api}/goals/current`, headers });
    expect(res.statusCode).toBe(200);
    const { goal, progress } = res.json();
    expect(goal.id).toBeTypeOf("string");
    expect(progress.daysElapsed).toBe(14);
    expect(progress.weeksElapsed).toBe(2);
    expect(progress.weekIndexInPlan).toBe(3);
    expect(progress.actualWeightKg).toBeLessThan(103);
    expect(progress.deficitBankedKcal).toBeGreaterThan(0);
    expect(progress.deficitPlannedKcal).toBeGreaterThan(0);
    expect(progress.percentComplete).toBeGreaterThan(0);
    expect(["ahead", "onTrack", "behind", "stalled"]).toContain(progress.onTrack);
    expect(progress.currentWeek.weekIndex).toBe(3);
  });
});

describe("PATCH /goals/current", () => {
  it("re-plans from the current state and keeps the original start", async () => {
    const { headers, user } = await withMeasurement();
    const created = await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 8 } });
    const before = created.json().goal;

    t.clock.now = new Date("2026-09-24T09:00:00.000Z");
    await t.app.inject({ method: "POST", url: `${api}/body/entries`, headers, payload: { ...eren, waistCm: 79, weightKg: 101 } });

    const res = await t.app.inject({ method: "PATCH", url: `${api}/goals/current`, headers, payload: { targetBodyFatPct: 7, profile: "conservative" } });
    expect(res.statusCode).toBe(200);
    const goal = res.json().goal;
    expect(goal.id).toBe(before.id);
    expect(goal.targetBodyFatPct).toBe(7);
    expect(goal.profile).toBe("conservative");
    expect(goal.start.dateKey).toBe("2026-09-10");
    expect(goal.start.weightKg).toBe(103);
    expect(goal.plan.startKey).toBe("2026-09-24");
    expect(goal.plan.roadmap[0].startWeightKg).toBeCloseTo(101, 1);
    void user;
  });

  it("404s without an active goal", async () => {
    const { headers } = await withMeasurement();
    const res = await t.app.inject({ method: "PATCH", url: `${api}/goals/current`, headers, payload: { targetBodyFatPct: 10 } });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /goals/current/recalibrate", () => {
  it("refuses politely when there is not enough data", async () => {
    const { headers } = await withMeasurement();
    await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } });
    const res = await t.app.inject({ method: "POST", url: `${api}/goals/current/recalibrate`, headers });
    expect(res.statusCode).toBe(200);
    const { recalibration, goal } = res.json();
    expect(recalibration.applied).toBe(false);
    expect(recalibration.reason).toBeTypeOf("string");
    expect(goal.tdeeOverride).toBeNull();
  });

  it("measures TDEE from real intake and the weight trend", async () => {
    t.clock.now = new Date("2026-08-01T09:00:00.000Z");
    const { headers, user } = await withMeasurement();
    await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } });

    await logWeighIns(user, "2026-07-20", 53, 104, 0.05);
    await logMeals(user, "2026-08-01", 41, 2600);
    t.clock.now = new Date("2026-09-10T09:00:00.000Z");

    const res = await t.app.inject({ method: "POST", url: `${api}/goals/current/recalibrate`, headers });
    expect(res.statusCode).toBe(200);
    const { recalibration, goal } = res.json();
    expect(recalibration.applied).toBe(true);
    expect(recalibration.daysUsed).toBe(21);
    expect(recalibration.avgIntake).toBeCloseTo(2600, 0);
    expect(recalibration.tdeeObserved).toBeGreaterThan(2600);
    expect(goal.tdeeOverride).toBe(recalibration.tdeeUsed);
    expect(goal.plan.tdee).toBe(recalibration.tdeeUsed);
    expect(goal.plan.startKey).toBe("2026-09-10");
    // a measured TDEE turns off the a-priori adaptation
    const tdeeOf = (w: { dailyCalorieTarget: number; weeklyDeficitKcal: number }) => w.dailyCalorieTarget + w.weeklyDeficitKcal / 7;
    for (const w of goal.plan.roadmap) expect(tdeeOf(w)).toBeCloseTo(recalibration.tdeeUsed, 0);
  });
});

describe("complete / abandon", () => {
  it("completes the goal and clears the active slot", async () => {
    const { headers } = await withMeasurement();
    await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } });
    const res = await t.app.inject({ method: "POST", url: `${api}/goals/current/complete`, headers });
    expect(res.json().goal.status).toBe("completed");
    expect(res.json().goal.completedAt).not.toBeNull();
    expect((await t.app.inject({ method: "GET", url: `${api}/goals/current`, headers })).json().goal).toBeNull();
    // a new goal may now be created
    const again = await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 9 } });
    expect(again.statusCode).toBe(200);
  });

  it("abandons the goal", async () => {
    const { headers } = await withMeasurement();
    await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } });
    const res = await t.app.inject({ method: "POST", url: `${api}/goals/current/abandon`, headers });
    expect(res.json().goal.status).toBe("abandoned");
  });

  it("404s when there is nothing to close", async () => {
    const { headers } = await asUser(t);
    expect((await t.app.inject({ method: "POST", url: `${api}/goals/current/complete`, headers })).statusCode).toBe(404);
  });
});

describe("DTO contract", () => {
  it("goal responses validate against the shared zod schemas", async () => {
    const { headers } = await withMeasurement();
    const preview = await t.app.inject({ method: "POST", url: `${api}/goals/preview`, headers, payload: { targetBodyFatPct: 7 } });
    expect(() => zGoalPreview.parse(preview.json())).not.toThrow();
    const created = await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } });
    expect(() => zGoal.parse(created.json().goal)).not.toThrow();
    const view = await t.app.inject({ method: "GET", url: `${api}/goals/current`, headers });
    expect(() => zGoalView.parse(view.json())).not.toThrow();
  });
});
