/**
 * C1 — set weight (kg).
 *
 * The load field arrived in 2.1. Every set logged before it exists in Mongo *without* the field,
 * so the first test here inserts a genuinely old-shaped document through the raw driver (bypassing
 * every Mongoose default) and asserts it still reads, serializes and validates — with `weightKg`
 * coming back as `null`, never `0`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { HydratedDocument, Types } from "mongoose";
import { asUser, createTestApp, seedBasics, type TestApp } from "./harness";
import { Program, type ProgramDoc } from "../src/models/program";
import { WorkoutLog } from "../src/models/workoutLog";
import { EREN_DAYS } from "../src/seed/data/index";
import { zWorkoutLog, type DayDTO } from "@fitfloow/core";

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

const TODAY = "2026-09-10";

async function givenProgram(userId: Types.ObjectId, days: DayDTO[] = EREN_DAYS): Promise<HydratedDocument<ProgramDoc>> {
  return Program.create({ userId, name: "Test", days, currentIndex: 0, weekNumber: 1, startedAt: t.clock.now, lastActionAt: t.clock.now });
}

/** A log exactly as 2.0 wrote it: sets are `{reps, rir}` and nothing else. */
async function givenLegacyLog(userId: Types.ObjectId, dateKey: string, name = "Push-up") {
  await WorkoutLog.collection.insertOne({
    userId,
    programId: null,
    date: new Date(`${dateKey}T09:00:00.000Z`),
    dateKey,
    dayOrder: 1,
    weekNumber: 1,
    title: "Push A",
    kind: "strength",
    isOffDay: false,
    strength: [
      {
        name,
        muscles: [{ key: "chest", load: 1 }],
        plannedSets: 3,
        plannedReps: 12,
        plannedRIR: 2,
        source: "planned",
        skipped: false,
        metric: "reps",
        sets: [{ reps: 12, rir: 2 }, { reps: 11, rir: 1 }],
      },
    ],
    run: null,
    swim: null,
    durationMin: 50,
    notes: null,
    rpe: null,
    pointerBefore: null,
    createdAt: new Date(`${dateKey}T09:00:00.000Z`),
    updatedAt: new Date(`${dateKey}T09:00:00.000Z`),
  });
}

describe("C1 migration safety — logs written before weightKg existed", () => {
  it("reads an old log back with weightKg null, never 0, and never throws", async () => {
    const { user, headers } = await asUser(t);
    await givenLegacyLog(user._id, "2026-09-08");

    const res = await t.app.inject({ method: "GET", url: "/api/v1/workouts", headers });
    expect(res.statusCode).toBe(200);
    const logs = res.json().logs;
    expect(() => zWorkoutLog.array().parse(logs)).not.toThrow();
    expect(logs[0].strength[0].sets).toEqual([
      { reps: 12, rir: 2, weightKg: null },
      { reps: 11, rir: 1, weightKg: null },
    ]);
  });

  it("counts an old log's tonnage as 0 instead of inventing kilos", async () => {
    const { user, headers } = await asUser(t);
    await givenLegacyLog(user._id, "2026-09-08");
    const res = await t.app.inject({ method: "GET", url: "/api/v1/training/stats?weeks=2", headers });
    expect(res.statusCode).toBe(200);
    const week = res.json().weeks.at(-1);
    expect(week.sets).toBe(2);
    expect(week.tonnageKg).toBe(0);
  });

  it("editing an old log does not silently zero its untouched loads", async () => {
    const { user, headers } = await asUser(t);
    await givenLegacyLog(user._id, "2026-09-08");
    const id = (await t.app.inject({ method: "GET", url: "/api/v1/workouts", headers })).json().logs[0].id;
    const res = await t.app.inject({ method: "PATCH", url: `/api/v1/workouts/${id}`, headers, payload: { rpe: 7 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().log.strength[0].sets[0]).toEqual({ reps: 12, rir: 2, weightKg: null });
  });
});

describe("C1 — logging load", () => {
  it("stores and returns the kg lifted per set", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/program/complete",
      headers,
      payload: { strength: [{ name: "Push-up", sets: [{ reps: 8, rir: 2, weightKg: 60 }, { reps: 8, rir: 1, weightKg: 62.5 }] }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().log.strength[0].sets).toEqual([
      { reps: 8, rir: 2, weightKg: 60 },
      { reps: 8, rir: 1, weightKg: 62.5 },
    ]);
    const stats = (await t.app.inject({ method: "GET", url: "/api/v1/training/stats?weeks=1", headers })).json();
    expect(stats.weeks.at(-1).tonnageKg).toBe(980);
  });

  it("bodyweight sets keep weightKg null", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/program/complete",
      headers,
      payload: { strength: [{ name: "Push-up", sets: [{ reps: 20, rir: 2, weightKg: null }, { reps: 18, rir: 1 }] }] },
    });
    expect(res.json().log.strength[0].sets).toEqual([
      { reps: 20, rir: 2, weightKg: null },
      { reps: 18, rir: 1, weightKg: null },
    ]);
  });

  it("rejects an impossible load", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/program/complete",
      headers,
      payload: { strength: [{ name: "Push-up", sets: [{ reps: 8, rir: 2, weightKg: 5000 }] }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });
});

describe("GET /training/exercises/:name/last", () => {
  it("requires auth", async () => {
    expect((await t.app.inject({ method: "GET", url: "/api/v1/training/exercises/Push-up/last" })).statusCode).toBe(401);
  });

  it("returns an empty answer instead of 404 when the exercise was never logged", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url: "/api/v1/training/exercises/Push-up/last", headers });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ dateKey: null, sets: [] });
  });

  it("returns the most recent logged instance of that exercise", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    await t.app.inject({
      method: "POST",
      url: "/api/v1/program/complete",
      headers,
      payload: { strength: [{ name: "Push-up", sets: [{ reps: 8, rir: 2, weightKg: 50 }] }] },
    });
    await WorkoutLog.updateOne({ userId: user._id }, { $set: { date: new Date("2026-09-01T09:00:00.000Z"), dateKey: "2026-09-01" } });
    await t.app.inject({
      method: "POST",
      url: "/api/v1/program/complete",
      headers,
      payload: { strength: [{ name: "Push-up", sets: [{ reps: 8, rir: 2, weightKg: 60 }, { reps: 7, rir: 1, weightKg: 60 }] }] },
    });

    const res = await t.app.inject({ method: "GET", url: "/api/v1/training/exercises/Push-up/last", headers });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      dateKey: TODAY,
      sets: [
        { reps: 8, rir: 2, weightKg: 60 },
        { reps: 7, rir: 1, weightKg: 60 },
      ],
    });
  });

  it("matches the name case-insensitively and URL-encoded", async () => {
    const { user, headers } = await asUser(t);
    await givenLegacyLog(user._id, "2026-09-08", "Barbell Row");
    const res = await t.app.inject({ method: "GET", url: `/api/v1/training/exercises/${encodeURIComponent("barbell row")}/last`, headers });
    expect(res.json().dateKey).toBe("2026-09-08");
    expect(res.json().sets[0]).toEqual({ reps: 12, rir: 2, weightKg: null });
  });

  it("never leaks another user's history", async () => {
    const mine = await asUser(t);
    const theirs = await asUser(t, { username: "someone-else" });
    await givenLegacyLog(theirs.user._id, "2026-09-08");
    const res = await t.app.inject({ method: "GET", url: "/api/v1/training/exercises/Push-up/last", headers: mine.headers });
    expect(res.json()).toEqual({ dateKey: null, sets: [] });
  });

  it("skips sessions where the exercise was skipped or logged empty", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    await t.app.inject({
      method: "POST",
      url: "/api/v1/program/complete",
      headers,
      payload: { strength: [{ name: "Push-up", sets: [{ reps: 8, rir: 2, weightKg: 40 }] }] },
    });
    await WorkoutLog.updateOne({ userId: user._id }, { $set: { date: new Date("2026-09-01T09:00:00.000Z"), dateKey: "2026-09-01" } });
    await t.app.inject({
      method: "POST",
      url: "/api/v1/program/complete",
      headers,
      payload: { strength: [{ name: "Push-up", sets: [], skipped: true }] },
    });

    const res = await t.app.inject({ method: "GET", url: "/api/v1/training/exercises/Push-up/last", headers });
    expect(res.json()).toEqual({ dateKey: "2026-09-01", sets: [{ reps: 8, rir: 2, weightKg: 40 }] });
  });
});
