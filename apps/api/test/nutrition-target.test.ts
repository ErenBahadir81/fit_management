import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { GoalPlan, RoadmapWeek } from "@fitfloow/core";
import { BodyEntry } from "../src/models/body";
import { Goal } from "../src/models/goal";
import { DietTarget } from "../src/models/nutrition";
import { asUser, createTestApp, seedBasics, type TestApp, type TestUser } from "./harness";

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

const url = "/api/v1/nutrition/target";

function roadmapWeek(weekIndex: number, startKey: string, endKey: string, calories: number): RoadmapWeek {
  return {
    weekIndex,
    startKey,
    endKey,
    startWeightKg: 90,
    endWeightKg: 89.4,
    startBfPct: 24,
    endBfPct: 23.6,
    rateKgPerWeek: 0.6,
    weeklyDeficitKcal: 4620,
    dailyCalorieTarget: calories,
    cumulativeDeficitKcal: 4620 * weekIndex,
    macros: { calories, protein: 180, carbs: 190, fat: 60 },
  };
}

async function createGoal(user: TestUser, roadmap: RoadmapWeek[], headline = 2000) {
  const plan = {
    macros: { calories: headline, protein: 170, carbs: 180, fat: 55 },
    roadmap,
  } as unknown as GoalPlan;
  await Goal.create({
    userId: user._id,
    status: "active",
    targetBodyFatPct: 15,
    profile: "optimal",
    start: { dateKey: "2026-09-06", weightKg: 90, bodyFatPct: 24, leanMassKg: 68.4, fatMassKg: 21.6, bodyEntryId: null },
    plan,
    tdeeOverride: null,
  });
}

async function createBody(user: TestUser, leanMassKg: number) {
  await BodyEntry.create({
    userId: user._id,
    date: new Date("2026-09-09T09:00:00.000Z"),
    dateKey: "2026-09-09",
    gender: "male",
    heightCm: 178,
    neckCm: 39,
    waistCm: 92,
    weightKg: 90,
    bodyFatPct: 24,
    fatMassKg: 90 - leanMassKg,
    leanMassKg,
  });
}

describe("GET /nutrition/target — auto mode", () => {
  it("falls back to the flat defaults with no goal and no body entry", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url, headers });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ mode: "auto", calories: 2000, protein: 150, carbs: 200, fat: 65, derivedFrom: "default" });
  });

  it("derives maintenance from the latest body entry and the activity multiplier", async () => {
    const { user, headers } = await asUser(t, { activityLevel: "moderate" }); // ×1.55
    await createBody(user, 68);
    const body = (await t.app.inject({ method: "GET", url, headers })).json();
    // Katch-McArdle: 370 + 21.6 × 68 = 1839 → ×1.55 = 2850
    expect(body).toMatchObject({ mode: "auto", derivedFrom: "maintenance", calories: 2850, protein: 136 });
  });

  it("scales maintenance with the user's activity level", async () => {
    const sedentary = await asUser(t, { activityLevel: "sedentary" }); // ×1.2
    await createBody(sedentary.user, 68);
    const body = (await t.app.inject({ method: "GET", url, headers: sedentary.headers })).json();
    expect(body.calories).toBe(2207);
  });

  it("prefers the active goal's roadmap week for today", async () => {
    const { user, headers } = await asUser(t);
    await createBody(user, 68);
    await createGoal(user, [
      roadmapWeek(1, "2026-09-06", "2026-09-12", 2100),
      roadmapWeek(2, "2026-09-13", "2026-09-19", 2050),
    ]);
    const body = (await t.app.inject({ method: "GET", url, headers })).json();
    expect(body).toEqual({ mode: "auto", calories: 2100, protein: 180, carbs: 190, fat: 60, derivedFrom: "goal" });
  });

  it("follows the roadmap as the plan weeks advance", async () => {
    const { user, headers } = await asUser(t);
    await createGoal(user, [
      roadmapWeek(1, "2026-09-06", "2026-09-12", 2100),
      roadmapWeek(2, "2026-09-13", "2026-09-19", 2050),
    ]);
    t.clock.now = new Date("2026-09-15T09:00:00.000Z");
    expect((await t.app.inject({ method: "GET", url, headers })).json().calories).toBe(2050);
  });

  it("clamps past the end of the roadmap to the last week", async () => {
    const { user, headers } = await asUser(t);
    await createGoal(user, [roadmapWeek(1, "2026-08-01", "2026-08-07", 2200)]);
    expect((await t.app.inject({ method: "GET", url, headers })).json().calories).toBe(2200);
  });

  it("falls back to the plan's headline macros when the roadmap is empty", async () => {
    const { user, headers } = await asUser(t);
    await createGoal(user, [], 1950);
    const body = (await t.app.inject({ method: "GET", url, headers })).json();
    expect(body).toMatchObject({ calories: 1950, protein: 170, derivedFrom: "goal" });
  });

  it("ignores a goal that is no longer active", async () => {
    const { user, headers } = await asUser(t);
    await createGoal(user, [roadmapWeek(1, "2026-09-06", "2026-09-12", 2100)]);
    await Goal.updateOne({ userId: user._id }, { $set: { status: "completed" } });
    expect((await t.app.inject({ method: "GET", url, headers })).json().derivedFrom).toBe("default");
  });
});

describe("PUT /nutrition/target", () => {
  it("stores manual values and stops deriving", async () => {
    const { user, headers } = await asUser(t);
    await createBody(user, 68);
    const res = await t.app.inject({
      method: "PUT",
      url,
      headers,
      payload: { mode: "manual", calories: 1800, protein: 160, carbs: 150, fat: 60 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ mode: "manual", calories: 1800, protein: 160, carbs: 150, fat: 60, derivedFrom: null });
    expect((await t.app.inject({ method: "GET", url, headers })).json().calories).toBe(1800);
    expect(await DietTarget.countDocuments({ userId: user._id })).toBe(1);
  });

  it("keeps unspecified manual fields at their current value", async () => {
    const { headers } = await asUser(t);
    await t.app.inject({ method: "PUT", url, headers, payload: { mode: "manual", calories: 1800, protein: 160, carbs: 150, fat: 60 } });
    const res = await t.app.inject({ method: "PUT", url, headers, payload: { mode: "manual", calories: 1700 } });
    expect(res.json()).toEqual({ mode: "manual", calories: 1700, protein: 160, carbs: 150, fat: 60, derivedFrom: null });
  });

  it("switching back to auto re-derives", async () => {
    const { user, headers } = await asUser(t, { activityLevel: "moderate" });
    await createBody(user, 68);
    await t.app.inject({ method: "PUT", url, headers, payload: { mode: "manual", calories: 1500 } });
    const res = await t.app.inject({ method: "PUT", url, headers, payload: { mode: "auto" } });
    expect(res.json()).toMatchObject({ mode: "auto", calories: 2850, derivedFrom: "maintenance" });
  });

  it("rejects out-of-range values", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "PUT", url, headers, payload: { mode: "manual", calories: 99 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });

  it("requires auth", async () => {
    expect((await t.app.inject({ method: "GET", url })).statusCode).toBe(401);
    expect((await t.app.inject({ method: "PUT", url, payload: { mode: "auto" } })).statusCode).toBe(401);
  });
});
