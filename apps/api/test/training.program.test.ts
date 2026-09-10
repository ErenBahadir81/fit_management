import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { HydratedDocument, Types } from "mongoose";
import { asUser, createTestApp, seedBasics, type TestApp } from "./harness";
import { Program, type ProgramDoc } from "../src/models/program";
import { WorkoutLog } from "../src/models/workoutLog";
import { WeeklyReportCache } from "../src/models/goal";
import { EREN_DAYS, INCI_DAYS } from "../src/seed/data/index";
import { zProgramView, zWorkoutLog, type DayDTO } from "@fitfloow/core";

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
  t.clock.now = new Date("2026-09-10T09:00:00.000Z"); // TR: Thursday 2026-09-10 12:00
});

const TODAY = "2026-09-10";

async function givenProgram(
  userId: Types.ObjectId,
  opts: { days?: DayDTO[]; currentIndex?: number; weekNumber?: number } = {}
): Promise<HydratedDocument<ProgramDoc>> {
  return Program.create({
    userId,
    name: "Test Programı",
    days: opts.days ?? EREN_DAYS,
    currentIndex: opts.currentIndex ?? 0,
    weekNumber: opts.weekNumber ?? 1,
    startedAt: t.clock.now,
    lastActionAt: t.clock.now,
  });
}

const sets = (n: number, reps = 10) => Array.from({ length: n }, () => ({ reps, rir: 2 }));

describe("GET /program", () => {
  it("requires auth", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/v1/program" });
    expect(res.statusCode).toBe(401);
  });

  it("404 NOT_FOUND when the user has no program yet", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url: "/api/v1/program", headers });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatchObject({ code: "NOT_FOUND", message: "Program yok" });
  });

  it("returns the composite view: program, current day, 7-day schedule and weekly volume", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentIndex: 2 });
    const res = await t.app.inject({ method: "GET", url: "/api/v1/program", headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.program).toMatchObject({ name: "Test Programı", currentIndex: 2, weekNumber: 1 });
    expect(body.program.days).toHaveLength(7);
    expect(body.current).toMatchObject({ index: 2 });
    expect(body.current.day.title).toBe("Bacak");
    expect(body.todayLog).toBeNull();
    expect(body.schedule).toHaveLength(7);
    expect(body.schedule[0]).toMatchObject({ dateKey: TODAY, isToday: true, status: "today" });
    expect(body.schedule.map((s: { day: DayDTO }) => s.day.order)).toEqual([3, 4, 5, 6, 7, 1, 2]);
    expect(body.weeklyVolume.map((v: { key: string }) => v.key)).toEqual(["chest", "frontDelt", "sideDelt", "traps", "lats", "legs", "abs"]);
    expect(body.weeklyVolume[0]).toMatchObject({ key: "chest", done: 0, status: "none", target: { min: 15, max: 20 } });
    expect(() => zProgramView.parse(body)).not.toThrow(); // the DTO contract frontends compile against
  });

  it("repairs an out-of-range pointer instead of crashing", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { days: INCI_DAYS, currentIndex: 9 });
    const res = await t.app.inject({ method: "GET", url: "/api/v1/program", headers });
    expect(res.json().current).toMatchObject({ index: 1 });
  });
});

describe("PUT /program", () => {
  it("replaces the days, resolving muscles and metric from the catalog", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentIndex: 5 });
    const res = await t.app.inject({
      method: "PUT",
      url: "/api/v1/program",
      headers,
      payload: {
        name: "Yeni Program",
        days: [
          { order: 1, title: "Göğüs", focus: "Push", kind: "strength", exercises: [{ name: "push-up", targetSets: 4, targetReps: 12, targetRIR: 2 }] },
          { order: 2, title: "Karın", focus: "", kind: "strength", exercises: [{ name: "Plank", targetSets: 3, targetReps: 45, targetRIR: null }] },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const program = res.json().program;
    expect(program.name).toBe("Yeni Program");
    expect(program.days).toHaveLength(2);
    expect(program.days[0].exercises[0].muscles).toEqual([
      { key: "chest", load: 1 },
      { key: "frontDelt", load: 1 },
      { key: "traps", load: 1 },
    ]);
    expect(program.days[1].exercises[0].metric).toBe("time");
    expect(program.currentIndex).toBe(1); // pointer kept inside the shorter cycle
  });

  it("rejects an exercise that is not in the catalog and has no muscles", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const res = await t.app.inject({
      method: "PUT",
      url: "/api/v1/program",
      headers,
      payload: { days: [{ order: 1, title: "X", focus: "", kind: "strength", exercises: [{ name: "Uydurma", targetSets: 3, targetReps: 10, targetRIR: null }] }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });

  it("accepts an ad-hoc exercise with explicit muscles", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const res = await t.app.inject({
      method: "PUT",
      url: "/api/v1/program",
      headers,
      payload: {
        days: [
          {
            order: 1,
            title: "X",
            focus: "",
            kind: "strength",
            exercises: [{ name: "Uydurma", muscles: [{ key: "lats", load: 0.5 }], targetSets: 3, targetReps: 10, targetRIR: null }],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().program.days[0].exercises[0].muscles).toEqual([{ key: "lats", load: 0.5 }]);
  });

  it("validates the payload shape", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const res = await t.app.inject({ method: "PUT", url: "/api/v1/program", headers, payload: { days: [] } });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /program/jump", () => {
  it("moves the pointer without touching the week", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentIndex: 0, weekNumber: 3 });
    const res = await t.app.inject({ method: "POST", url: "/api/v1/program/jump", headers, payload: { index: 4 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().program).toMatchObject({ currentIndex: 4, weekNumber: 3 });
  });

  it("rejects an index outside the cycle", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const res = await t.app.inject({ method: "POST", url: "/api/v1/program/jump", headers, payload: { index: 7 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });
});

describe("POST /program/complete", () => {
  it("logs the session with catalog muscles, advances the pointer and stores it for undo", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentIndex: 0 });
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/program/complete",
      headers,
      payload: {
        strength: [
          { name: "Push-up", sets: sets(5, 12) },
          { name: "DB Fly", sets: sets(4, 12) },
          { name: "Lateral Raise", sets: [], skipped: true },
        ],
        durationMin: 55,
        notes: "İyi geçti",
        rpe: 8,
      },
    });
    expect(res.statusCode).toBe(200);
    const { log, program } = res.json();
    expect(log).toMatchObject({ dateKey: TODAY, dayOrder: 1, title: "Push A", kind: "strength", isOffDay: false, durationMin: 55, notes: "İyi geçti", rpe: 8 });
    expect(log.strength[0].muscles).toEqual([
      { key: "chest", load: 1 },
      { key: "frontDelt", load: 1 },
      { key: "traps", load: 1 },
    ]);
    expect(log.strength[0]).toMatchObject({ plannedSets: 5, plannedReps: 12, plannedRIR: 2, source: "planned", metric: "reps" });
    expect(log.strength[2]).toMatchObject({ skipped: true, sets: [] });
    expect(program.currentIndex).toBe(1);
    expect(() => zWorkoutLog.parse(log)).not.toThrow();
    const stored = await WorkoutLog.findOne({ userId: user._id }).lean();
    expect(stored?.pointerBefore).toBe(0);
  });

  it("shows up in the composite view as today's log, done schedule and weekly volume", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentIndex: 0 });
    await t.app.inject({ method: "POST", url: "/api/v1/program/complete", headers, payload: { strength: [{ name: "Push-up", sets: sets(5) }] } });
    const view = (await t.app.inject({ method: "GET", url: "/api/v1/program", headers })).json();
    expect(view.todayLog).not.toBeNull();
    expect(view.schedule[0]).toMatchObject({ status: "done", isToday: true });
    expect(view.schedule[0].day.order).toBe(1);
    expect(view.schedule[1].day.order).toBe(2);
    expect(view.weeklyVolume.find((v: { key: string }) => v.key === "chest")).toMatchObject({ done: 5 });
    expect(view.current.index).toBe(1);
  });

  it("keeps ad-hoc (extra) exercises with the muscles the client sent", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentIndex: 0 });
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/program/complete",
      headers,
      payload: { strength: [{ name: "Farmer Walk", muscles: [{ key: "traps", load: 0.8 }], metric: "time", sets: sets(2, 60) }] },
    });
    expect(res.json().log.strength[0]).toMatchObject({ source: "extra", metric: "time", muscles: [{ key: "traps", load: 0.8 }] });
  });

  it("wraps the cycle and bumps the week number on the last day", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentIndex: 6, weekNumber: 2 });
    const res = await t.app.inject({ method: "POST", url: "/api/v1/program/complete", headers, payload: { run: { segments: [{ km: 5, min: 30 }] } } });
    expect(res.json().program).toMatchObject({ currentIndex: 0, weekNumber: 3 });
  });

  it("updates the day's cardio target for the next cycle (never worse)", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentIndex: 1 }); // day 2 has run 5 km / 30 min
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/program/complete",
      headers,
      payload: { strength: [], run: { segments: [{ km: 5, min: 27 }] } },
    });
    const body = res.json();
    expect(body.log.run).toMatchObject({ totalKm: 5, totalMin: 27, targetKm: 5, targetMin: 30 });
    expect(body.program.days[1].run).toMatchObject({ targetKm: 5, targetMin: 27 });
  });

  it("re-completing the same day updates the log without moving the pointer again", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentIndex: 0 });
    await t.app.inject({ method: "POST", url: "/api/v1/program/complete", headers, payload: { strength: [{ name: "Push-up", sets: sets(3) }] } });
    const res = await t.app.inject({ method: "POST", url: "/api/v1/program/complete", headers, payload: { strength: [{ name: "Push-up", sets: sets(5) }] } });
    expect(res.statusCode).toBe(200);
    expect(res.json().program.currentIndex).toBe(1);
    expect(res.json().log.strength[0].sets).toHaveLength(5);
    expect(await WorkoutLog.countDocuments({ userId: user._id })).toBe(1);
  });

  it("replaces today's rest log and advances from there", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentIndex: 0 });
    await t.app.inject({ method: "POST", url: "/api/v1/program/skip", headers, payload: {} });
    const res = await t.app.inject({ method: "POST", url: "/api/v1/program/complete", headers, payload: { strength: [{ name: "Push-up", sets: sets(5) }] } });
    expect(res.json().log.isOffDay).toBe(false);
    expect(res.json().program.currentIndex).toBe(1);
    expect(await WorkoutLog.countDocuments({ userId: user._id })).toBe(1);
  });

  it("invalidates the cached weekly report of that week", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    await WeeklyReportCache.create({ userId: user._id, weekKey: "2026-09-06", generatedAt: t.clock.now, report: { x: 1 } });
    await t.app.inject({ method: "POST", url: "/api/v1/program/complete", headers, payload: { strength: [{ name: "Push-up", sets: sets(3) }] } });
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBe(0);
  });

  it("404s without a program", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "POST", url: "/api/v1/program/complete", headers, payload: { strength: [] } });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /program/skip", () => {
  it("writes an off-day log and leaves the pointer alone", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentIndex: 3 });
    const res = await t.app.inject({ method: "POST", url: "/api/v1/program/skip", headers, payload: { reason: "Hastayım" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().log).toMatchObject({ isOffDay: true, title: "Dinlenme", dayOrder: 4, dateKey: TODAY, notes: "Hastayım" });
    expect(res.json().program.currentIndex).toBe(3);
  });

  it("is idempotent for the day", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const first = await t.app.inject({ method: "POST", url: "/api/v1/program/skip", headers, payload: {} });
    const second = await t.app.inject({ method: "POST", url: "/api/v1/program/skip", headers, payload: {} });
    expect(second.statusCode).toBe(200);
    expect(second.json().log.id).toBe(first.json().log.id);
    expect(await WorkoutLog.countDocuments({ userId: user._id })).toBe(1);
  });

  it("refuses to skip a day that was already completed", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    await t.app.inject({ method: "POST", url: "/api/v1/program/complete", headers, payload: { strength: [{ name: "Push-up", sets: sets(3) }] } });
    const res = await t.app.inject({ method: "POST", url: "/api/v1/program/skip", headers, payload: {} });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("marks the schedule entry as skipped and keeps the day pending for tomorrow", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentIndex: 1 });
    await t.app.inject({ method: "POST", url: "/api/v1/program/skip", headers, payload: {} });
    const view = (await t.app.inject({ method: "GET", url: "/api/v1/program", headers })).json();
    expect(view.schedule[0]).toMatchObject({ status: "skipped" });
    expect(view.schedule[1].day.order).toBe(2);
  });
});

describe("POST /program/undo-last", () => {
  it("deletes today's session and restores the pointer", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentIndex: 3 });
    await t.app.inject({ method: "POST", url: "/api/v1/program/complete", headers, payload: { strength: [{ name: "HSPU", sets: sets(4) }] } });
    const res = await t.app.inject({ method: "POST", url: "/api/v1/program/undo-last", headers, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().program.currentIndex).toBe(3);
    expect(await WorkoutLog.countDocuments({ userId: user._id })).toBe(0);
  });

  it("rolls the week back when it undoes the session that closed the cycle", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentIndex: 6, weekNumber: 4 });
    await t.app.inject({ method: "POST", url: "/api/v1/program/complete", headers, payload: { run: { segments: [{ km: 5, min: 33 }] } } });
    const res = await t.app.inject({ method: "POST", url: "/api/v1/program/undo-last", headers, payload: {} });
    expect(res.json().program).toMatchObject({ currentIndex: 6, weekNumber: 4 });
  });

  it("undoes a skip without moving the pointer", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentIndex: 6, weekNumber: 2 });
    await t.app.inject({ method: "POST", url: "/api/v1/program/skip", headers, payload: {} });
    const res = await t.app.inject({ method: "POST", url: "/api/v1/program/undo-last", headers, payload: {} });
    expect(res.json().program).toMatchObject({ currentIndex: 6, weekNumber: 2 });
    expect(await WorkoutLog.countDocuments({ userId: user._id })).toBe(0);
  });

  it("404s when the newest log is not from today", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentIndex: 1 });
    await WorkoutLog.create({
      userId: user._id,
      date: new Date("2026-09-08T09:00:00.000Z"),
      dateKey: "2026-09-08",
      dayOrder: 1,
      weekNumber: 1,
      title: "Push A",
      kind: "strength",
      isOffDay: false,
      strength: [],
      pointerBefore: 0,
    });
    const res = await t.app.inject({ method: "POST", url: "/api/v1/program/undo-last", headers, payload: {} });
    expect(res.statusCode).toBe(404);
    expect(await WorkoutLog.countDocuments({ userId: user._id })).toBe(1);
  });

  it("404s when there is nothing to undo", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const res = await t.app.inject({ method: "POST", url: "/api/v1/program/undo-last", headers, payload: {} });
    expect(res.statusCode).toBe(404);
  });
});
