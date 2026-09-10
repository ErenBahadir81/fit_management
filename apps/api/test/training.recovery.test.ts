import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Types } from "mongoose";
import { asUser, createTestApp, seedBasics, type TestApp } from "./harness";
import { WorkoutLog } from "../src/models/workoutLog";
import { Muscle } from "../src/models/muscle";
import { zRecoveryView, zTrainingStats } from "@fitfloow/core";

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
  t.clock.now = new Date("2026-09-10T09:00:00.000Z"); // TR Thursday 12:00
});

const HOUR = 3_600_000;
const sets = (n: number) => Array.from({ length: n }, () => ({ reps: 10, rir: 2 }));

async function givenSession(
  userId: Types.ObjectId,
  hoursAgo: number,
  entries: Array<{ key: string; sets: number; load?: number; metric?: "reps" | "time" | "stretch"; skipped?: boolean }>,
  extra: Record<string, unknown> = {}
) {
  const date = new Date(t.clock.now.getTime() - hoursAgo * HOUR);
  const dateKey = new Date(date.getTime() + 3 * HOUR).toISOString().slice(0, 10);
  return WorkoutLog.create({
    userId,
    date,
    dateKey,
    dayOrder: 1,
    weekNumber: 1,
    title: "Seans",
    kind: "strength",
    isOffDay: false,
    strength: entries.map((e) => ({
      name: e.key,
      muscles: [{ key: e.key, load: e.load ?? 1 }],
      plannedSets: e.sets,
      plannedReps: 10,
      plannedRIR: 2,
      source: "planned" as const,
      skipped: e.skipped ?? false,
      metric: e.metric ?? ("reps" as const),
      sets: e.skipped ? [] : sets(e.sets),
    })),
    ...extra,
  });
}

describe("GET /recovery", () => {
  it("requires auth", async () => {
    expect((await t.app.inject({ method: "GET", url: "/api/v1/recovery" })).statusCode).toBe(401);
  });

  it("reports every active muscle as ready when nothing was logged", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url: "/api/v1/recovery", headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.muscles).toHaveLength(7);
    expect(body.muscles[0]).toMatchObject({ key: "chest", name: "Göğüs", short: "Göğüs", color: "#EF6C6C", readiness: 100, status: "ready", lastTrainedAt: null, weeklySets: 0, weeklyTarget: { min: 15, max: 20 } });
    expect(body.overall).toMatchObject({ readiness: 100, status: "ready", readyCount: 7, fatiguedCount: 0 });
    expect(body.generatedAt).toBe(t.clock.now.toISOString());
    expect(() => zRecoveryView.parse(body)).not.toThrow();
  });

  it("follows the recovery curve from the real logs", async () => {
    const { user, headers } = await asUser(t);
    await givenSession(user._id, 0, [{ key: "chest", sets: 5 }]);
    await givenSession(user._id, 12, [{ key: "legs", sets: 4 }]); // 24 h muscle at half time
    await givenSession(user._id, 30, [{ key: "lats", sets: 5 }]); // fully recovered

    const body = (await t.app.inject({ method: "GET", url: "/api/v1/recovery", headers })).json();
    const by = Object.fromEntries(body.muscles.map((m: { key: string }) => [m.key, m]));
    expect(by.chest).toMatchObject({ readiness: 0, status: "fatigued", hoursSince: 0 });
    expect(by.legs).toMatchObject({ readiness: 70, status: "recovering", hoursToFull: 12 });
    expect(by.lats).toMatchObject({ readiness: 100, status: "ready", weeklySets: 5 });
    expect(body.overall).toMatchObject({ readyCount: 5, fatiguedCount: 1 }); // chest fatigued, legs recovering
  });

  it("weighs the load of the exercise→muscle mapping", async () => {
    const { user, headers } = await asUser(t);
    await givenSession(user._id, 20, [{ key: "chest", sets: 5 }]);
    await givenSession(user._id, 0, [{ key: "chest", sets: 4, load: 0.5 }]);
    const body = (await t.app.inject({ method: "GET", url: "/api/v1/recovery", headers })).json();
    expect(body.muscles.find((m: { key: string }) => m.key === "chest")).toMatchObject({ readiness: 50, weeklySets: 7 });
  });

  it("ignores off-days, skipped exercises and stretch work", async () => {
    const { user, headers } = await asUser(t);
    await givenSession(user._id, 1, [{ key: "abs", sets: 5 }], { isOffDay: true });
    await givenSession(user._id, 2, [{ key: "abs", sets: 5, skipped: true }]);
    await givenSession(user._id, 3, [{ key: "abs", sets: 5, metric: "stretch" }]);
    const body = (await t.app.inject({ method: "GET", url: "/api/v1/recovery", headers })).json();
    expect(body.muscles.find((m: { key: string }) => m.key === "abs")).toMatchObject({ readiness: 100, weeklySets: 0, lastTrainedAt: null });
  });

  it("follows the admin muscle list, not a hardcoded one", async () => {
    const { user, headers } = await asUser(t);
    await Muscle.updateOne({ key: "abs" }, { $set: { active: false } });
    await Muscle.updateOne({ key: "biceps" }, { $set: { active: true } });
    await givenSession(user._id, 0, [{ key: "biceps", sets: 4 }]);

    const body = (await t.app.inject({ method: "GET", url: "/api/v1/recovery", headers })).json();
    const keys = body.muscles.map((m: { key: string }) => m.key);
    expect(keys).not.toContain("abs");
    expect(keys).toContain("biceps");
    expect(body.muscles.find((m: { key: string }) => m.key === "biceps")).toMatchObject({ readiness: 0, fullRecoveryHours: 48 });
  });

  it("counts weekly sets over 7 days but no fatigue from old sessions", async () => {
    const { user, headers } = await asUser(t);
    await givenSession(user._id, 5 * 24, [{ key: "traps", sets: 6 }]);
    await givenSession(user._id, 9 * 24, [{ key: "traps", sets: 9 }]);
    const body = (await t.app.inject({ method: "GET", url: "/api/v1/recovery", headers })).json();
    expect(body.muscles.find((m: { key: string }) => m.key === "traps")).toMatchObject({ readiness: 100, weeklySets: 6 });
  });
});

describe("GET /training/stats", () => {
  it("buckets sessions into the user's weeks (Sunday start by default)", async () => {
    const { user, headers } = await asUser(t);
    await givenSession(user._id, 0, [{ key: "chest", sets: 5 }]);
    await givenSession(user._id, 24, [{ key: "legs", sets: 4, load: 0.5 }]);
    await givenSession(user._id, 8 * 24, [{ key: "chest", sets: 3 }]);

    const res = await t.app.inject({ method: "GET", url: "/api/v1/training/stats?weeks=3", headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.weeks.map((w: { weekKey: string }) => w.weekKey)).toEqual(["2026-08-23", "2026-08-30", "2026-09-06"]);
    expect(body.weeks[2]).toMatchObject({ sessions: 2, sets: 9, volumeByMuscle: { chest: 5, legs: 2 } });
    expect(body.weeks[1]).toMatchObject({ sessions: 1, sets: 3 });
    expect(body.totalSessions).toBe(3);
    expect(body.streakDays).toBe(2);
    expect(() => zTrainingStats.parse(body)).not.toThrow();
  });

  it("respects a Monday measurement day", async () => {
    const { headers } = await asUser(t, { measurementDay: 1 });
    const body = (await t.app.inject({ method: "GET", url: "/api/v1/training/stats?weeks=2", headers })).json();
    expect(body.weeks.map((w: { weekKey: string }) => w.weekKey)).toEqual(["2026-08-31", "2026-09-07"]);
  });

  it("defaults to 8 weeks and validates the parameter", async () => {
    const { headers } = await asUser(t);
    const body = (await t.app.inject({ method: "GET", url: "/api/v1/training/stats", headers })).json();
    expect(body.weeks).toHaveLength(8);
    expect((await t.app.inject({ method: "GET", url: "/api/v1/training/stats?weeks=0", headers })).statusCode).toBe(400);
    expect((await t.app.inject({ method: "GET", url: "/api/v1/training/stats?weeks=abc", headers })).statusCode).toBe(400);
  });

  it("sums cardio kilometres per week", async () => {
    const { user, headers } = await asUser(t);
    await givenSession(user._id, 2, [], {
      run: { segments: [{ km: 5, min: 27 }], totalKm: 5, totalMin: 27, targetKm: 5, targetMin: 30 },
    });
    const body = (await t.app.inject({ method: "GET", url: "/api/v1/training/stats?weeks=1", headers })).json();
    expect(body.weeks[0]).toMatchObject({ sessions: 1, cardioKm: 5, sets: 0 });
  });
});
