import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Types } from "mongoose";
import { asUser, createTestApp, seedBasics, type TestApp } from "./harness";
import { WorkoutLog } from "../src/models/workoutLog";
import { WeeklyReportCache } from "../src/models/goal";
import { zWorkoutLog } from "@fitfloow/core";

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

const sets = (n: number) => Array.from({ length: n }, () => ({ reps: 10, rir: 2 }));

async function givenLog(userId: Types.ObjectId, dateKey: string, extra: Record<string, unknown> = {}) {
  return WorkoutLog.create({
    userId,
    date: new Date(`${dateKey}T09:00:00.000Z`),
    dateKey,
    dayOrder: 1,
    weekNumber: 1,
    title: "Push A",
    kind: "strength",
    isOffDay: false,
    strength: [{ name: "Push-up", muscles: [{ key: "chest", load: 1 }], plannedSets: 5, plannedReps: 12, plannedRIR: 2, source: "planned" as const, skipped: false, metric: "reps" as const, sets: sets(3) }],
    ...extra,
  });
}

describe("GET /workouts", () => {
  it("requires auth", async () => {
    expect((await t.app.inject({ method: "GET", url: "/api/v1/workouts" })).statusCode).toBe(401);
  });

  it("returns the user's logs newest first", async () => {
    const { user, headers } = await asUser(t);
    const other = await asUser(t, { username: "someone-else" });
    await givenLog(user._id, "2026-09-08");
    await givenLog(user._id, "2026-09-10");
    await givenLog(user._id, "2026-09-09");
    await givenLog(other.user._id, "2026-09-10");

    const res = await t.app.inject({ method: "GET", url: "/api/v1/workouts", headers });
    expect(res.statusCode).toBe(200);
    const logs = res.json().logs;
    expect(logs.map((l: { dateKey: string }) => l.dateKey)).toEqual(["2026-09-10", "2026-09-09", "2026-09-08"]);
    expect(logs[0].strength[0]).toMatchObject({ name: "Push-up", muscles: [{ key: "chest", load: 1 }] });
    expect(() => zWorkoutLog.array().parse(logs)).not.toThrow();
  });

  it("filters by from/to on the day key", async () => {
    const { user, headers } = await asUser(t);
    for (const key of ["2026-09-05", "2026-09-07", "2026-09-09"]) await givenLog(user._id, key);
    const res = await t.app.inject({ method: "GET", url: "/api/v1/workouts?from=2026-09-06&to=2026-09-08", headers });
    expect(res.json().logs.map((l: { dateKey: string }) => l.dateKey)).toEqual(["2026-09-07"]);
  });

  it("pages with limit + the before cursor", async () => {
    const { user, headers } = await asUser(t);
    for (const key of ["2026-09-06", "2026-09-07", "2026-09-08"]) await givenLog(user._id, key);
    const first = await t.app.inject({ method: "GET", url: "/api/v1/workouts?limit=2", headers });
    const page1 = first.json().logs;
    expect(page1.map((l: { dateKey: string }) => l.dateKey)).toEqual(["2026-09-08", "2026-09-07"]);
    const second = await t.app.inject({ method: "GET", url: `/api/v1/workouts?limit=2&before=${page1[1].id}`, headers });
    expect(second.json().logs.map((l: { dateKey: string }) => l.dateKey)).toEqual(["2026-09-06"]);
  });

  it("rejects a limit above 100 and a broken cursor", async () => {
    const { headers } = await asUser(t);
    expect((await t.app.inject({ method: "GET", url: "/api/v1/workouts?limit=500", headers })).statusCode).toBe(400);
    const bad = await t.app.inject({ method: "GET", url: "/api/v1/workouts?before=nope", headers });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("VALIDATION");
  });
});

describe("GET/PATCH/DELETE /workouts/:id", () => {
  it("reads one log", async () => {
    const { user, headers } = await asUser(t);
    const log = await givenLog(user._id, "2026-09-09");
    const res = await t.app.inject({ method: "GET", url: `/api/v1/workouts/${log._id}`, headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().log).toMatchObject({ id: String(log._id), dateKey: "2026-09-09" });
  });

  it("404s for another user's log and for a non-id", async () => {
    const { headers } = await asUser(t);
    const other = await asUser(t, { username: "other-user" });
    const log = await givenLog(other.user._id, "2026-09-09");
    expect((await t.app.inject({ method: "GET", url: `/api/v1/workouts/${log._id}`, headers })).statusCode).toBe(404);
    expect((await t.app.inject({ method: "GET", url: "/api/v1/workouts/not-an-id", headers })).statusCode).toBe(404);
  });

  it("edits the sets afterwards without touching the pointer or the targets", async () => {
    const { user, headers } = await asUser(t);
    const log = await givenLog(user._id, "2026-09-09");
    const res = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/workouts/${log._id}`,
      headers,
      payload: { strength: [{ name: "Pull-up", sets: sets(5) }], durationMin: 42, notes: "düzeltildi", rpe: 7 },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().log;
    expect(updated.strength).toHaveLength(1);
    expect(updated.strength[0]).toMatchObject({ name: "Pull-up", muscles: [{ key: "lats", load: 1 }], sets: sets(5) });
    expect(updated).toMatchObject({ durationMin: 42, notes: "düzeltildi", rpe: 7, dateKey: "2026-09-09" });
  });

  it("refuses to edit a rest day", async () => {
    const { user, headers } = await asUser(t);
    const log = await givenLog(user._id, "2026-09-09", { isOffDay: true, title: "Dinlenme", strength: [] });
    const res = await t.app.inject({ method: "PATCH", url: `/api/v1/workouts/${log._id}`, headers, payload: { strength: [] } });
    expect(res.statusCode).toBe(400);
  });

  it("deletes a log and invalidates that week's cached report", async () => {
    const { user, headers } = await asUser(t);
    const log = await givenLog(user._id, "2026-09-09");
    await WeeklyReportCache.create({ userId: user._id, weekKey: "2026-09-06", generatedAt: t.clock.now, report: {} });
    const res = await t.app.inject({ method: "DELETE", url: `/api/v1/workouts/${log._id}`, headers });
    expect(res.statusCode).toBe(204);
    expect(await WorkoutLog.countDocuments({ userId: user._id })).toBe(0);
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBe(0);
    expect((await t.app.inject({ method: "DELETE", url: `/api/v1/workouts/${log._id}`, headers })).statusCode).toBe(404);
  });
});
