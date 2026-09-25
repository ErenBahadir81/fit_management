/**
 * T3 — the workout cycle, end to end through the API.
 * "Next day = the day after the one you actually did", the pointer held by day id, and the
 * B1–B9 regressions from the production plan.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { HydratedDocument, Types } from "mongoose";
import { asUser, createTestApp, seedBasics, seedLoad, type TestApp } from "./harness";
import { Program, type ProgramDoc } from "../src/models/program";
import { WorkoutLog, WORKOUT_DAY_INDEX } from "../src/models/workoutLog";
import { Exercise } from "../src/models/exercise";
import { EREN_DAYS } from "../src/seed/data/index";
import { ensureUniqueWorkoutDay, rekeyExercises } from "../src/modules/training/migrate";
import { round, zProgramView, type DayDTO } from "@fitfloow/core";

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
const DAY_MS = 86_400_000;
const nextDay = () => {
  t.clock.now = new Date(t.clock.now.getTime() + DAY_MS);
};

/** Eren's example: a 3-day cycle independent of the weekdays. */
const TRIO: DayDTO[] = [
  {
    id: "idman",
    order: 1,
    title: "İdman",
    focus: "",
    kind: "strength",
    exercises: [{ name: "Push-up", muscles: [{ key: "chest", load: 1 }], targetSets: 4, targetReps: 10, targetRIR: 2, metric: "reps" }],
    run: null,
    swim: null,
  },
  { id: "kosu", order: 2, title: "Koşu", focus: "", kind: "run", exercises: [], run: { targetKm: 5, targetMin: 30, label: "" }, swim: null },
  { id: "mola", order: 3, title: "Mola", focus: "", kind: "rest", exercises: [], run: null, swim: null },
];

async function givenProgram(userId: Types.ObjectId, extra: Partial<ProgramDoc> = {}): Promise<HydratedDocument<ProgramDoc>> {
  return Program.create({
    userId,
    name: "Döngü",
    mode: "cycle",
    days: TRIO,
    currentDayId: "idman",
    cycleNumber: 1,
    currentIndex: 0,
    weekNumber: 1,
    startedAt: t.clock.now,
    lastActionAt: t.clock.now,
    ...extra,
  });
}

type Headers = Record<string, string>;
const post = (headers: Headers, url: string, payload: unknown = {}) => t.app.inject({ method: "POST", url: `/api/v1${url}`, headers, payload: payload as object });
const view = async (headers: Headers) => (await t.app.inject({ method: "GET", url: "/api/v1/program", headers })).json();

describe("the cycle rule", () => {
  it("Eren's week: idman → koşu → mola → idman, the rest day moves it on too (B1)", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    expect((await view(headers)).current.day.id).toBe("idman");

    await post(headers, "/program/complete", { strength: [{ name: "Push-up", sets: [{ reps: 10, rir: 2 }] }] });
    nextDay();
    expect((await view(headers)).current.day.id).toBe("kosu");
    await post(headers, "/program/complete", { run: { segments: [{ km: 5, min: 29 }] } });
    nextDay();
    expect((await view(headers)).current.day.id).toBe("mola");

    // "Dinlendim" on the rest day: it is a day done, the cycle continues.
    const rest = await post(headers, "/program/skip");
    expect(rest.statusCode).toBe(200);
    expect(rest.json().log).toMatchObject({ dayId: "mola", kind: "rest", isOffDay: true, isBreak: false });
    expect(rest.json().program).toMatchObject({ currentDayId: "idman", cycleNumber: 2 });
    nextDay();
    const v = await view(headers);
    expect(v.current.day.id).toBe("idman");
    expect(v.program.cycleNumber).toBe(2);
  });

  it("idman was due, a run was done: the cycle continues from the run", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const res = await post(headers, "/program/log-day", { dayId: "kosu", run: { segments: [{ km: 4, min: 25 }] } });
    expect(res.statusCode).toBe(200);
    expect(res.json().log).toMatchObject({ dayId: "kosu", title: "Koşu", kind: "run" });
    expect(res.json().program.currentDayId).toBe("mola");
    const stored = await WorkoutLog.findOne({ userId: user._id }).lean();
    expect(stored).toMatchObject({ pointerBeforeId: "idman", pointerAfterId: "mola", cycleBefore: 1 });
  });

  it("…or puts the missed day back in line with resumePlanned", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const res = await post(headers, "/program/log-day", { dayId: "kosu", resumePlanned: true, run: { segments: [{ km: 4, min: 25 }] } });
    expect(res.json().program.currentDayId).toBe("idman");
    nextDay();
    expect((await view(headers)).current.day.id).toBe("idman");
  });

  it("rejects a day that is not in the program", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const res = await post(headers, "/program/log-day", { dayId: "yok" });
    expect(res.statusCode).toBe(400);
  });

  it("a break on a training day keeps the day pending", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const res = await post(headers, "/program/skip", { reason: "Yorgunum" });
    expect(res.json().log).toMatchObject({ isBreak: true, dayId: null });
    expect(res.json().program.currentDayId).toBe("idman");
    const v = await view(headers);
    expect(v.schedule[0]).toMatchObject({ status: "skipped" });
    expect(v.schedule[1].day.id).toBe("idman");
  });
});

describe("one log per day (B3, B9)", () => {
  it("B3: re-completing after doing a different day edits *that* day and never moves twice", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    await post(headers, "/program/log-day", { dayId: "kosu", run: { segments: [{ km: 4, min: 25 }] } });
    const again = await post(headers, "/program/complete", { run: { segments: [{ km: 5, min: 28 }] } });
    expect(again.statusCode).toBe(200);
    expect(again.json().log).toMatchObject({ dayId: "kosu", title: "Koşu" });
    expect(again.json().log.run).toMatchObject({ totalKm: 5 });
    expect(again.json().program.currentDayId).toBe("mola");
    expect(await WorkoutLog.countDocuments({ userId: user._id })).toBe(1);
  });

  it("changing today's day re-derives the pointer from before today's first log", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    await post(headers, "/program/log-day", { dayId: "idman", strength: [] });
    const swap = await post(headers, "/program/log-day", { dayId: "mola" });
    expect(swap.json().log.dayId).toBe("mola");
    // Pointer: back to idman (before today), then mola done → idman, one full pass.
    expect(swap.json().program).toMatchObject({ currentDayId: "idman", cycleNumber: 2 });
    expect(await WorkoutLog.countDocuments({ userId: user._id })).toBe(1);
  });

  it("B9: the database refuses a second log for the same day", async () => {
    const { user } = await asUser(t);
    await WorkoutLog.syncIndexes();
    const base = { userId: user._id, date: t.clock.now, dateKey: TODAY, title: "A", kind: "strength" as const, strength: [] };
    await WorkoutLog.create(base);
    await expect(WorkoutLog.create(base)).rejects.toThrow(/duplicate key/);
  });
});

describe("taking logs back (B4)", () => {
  it("undo restores the exact day and cycle count", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentDayId: "mola", currentIndex: 2, cycleNumber: 4, weekNumber: 4 });
    await post(headers, "/program/skip"); // rest day done → idman, cycle 5
    const res = await post(headers, "/program/undo-last");
    expect(res.json().program).toMatchObject({ currentDayId: "mola", cycleNumber: 4 });
  });

  it("deleting today's log from history puts the pointer back", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const done = await post(headers, "/program/complete", { strength: [{ name: "Push-up", sets: [{ reps: 10, rir: 2 }] }] });
    const del = await t.app.inject({ method: "DELETE", url: `/api/v1/workouts/${done.json().log.id}`, headers });
    expect(del.statusCode).toBe(204);
    expect((await view(headers)).current.day.id).toBe("idman");
  });

  it("deleting an older log does not touch a pointer later days already moved", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const first = await post(headers, "/program/complete", { strength: [] });
    nextDay();
    await post(headers, "/program/complete", { run: { segments: [{ km: 5, min: 30 }] } });
    await t.app.inject({ method: "DELETE", url: `/api/v1/workouts/${first.json().log.id}`, headers });
    expect((await view(headers)).current.day.id).toBe("mola");
  });
});

describe("editing the program (B5)", () => {
  it("reordering days keeps 'next' on the same day", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentDayId: "kosu", currentIndex: 1 });
    const res = await t.app.inject({
      method: "PUT",
      url: "/api/v1/program",
      headers,
      payload: { days: [TRIO[2], TRIO[1], TRIO[0]].map((d, i) => ({ ...d, order: i + 1 })) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().program).toMatchObject({ currentDayId: "kosu", currentIndex: 1 });
    expect(res.json().program.days.map((d: DayDTO) => d.id)).toEqual(["mola", "kosu", "idman"]);
  });

  it("a new day gets a fresh id; deleting the current day hands over to its neighbour", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id, { currentDayId: "kosu", currentIndex: 1 });
    const res = await t.app.inject({
      method: "PUT",
      url: "/api/v1/program",
      headers,
      payload: {
        days: [
          { ...TRIO[0], order: 1 },
          { order: 2, title: "Yüzme", kind: "swim", exercises: [], swim: { targetKm: 1, targetMin: 30, label: "" } },
          { ...TRIO[2], order: 3 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const days = res.json().program.days as DayDTO[];
    expect(days[1].id).not.toMatch(/^(idman|kosu|mola)$/);
    expect(res.json().program.currentDayId).toBe(days[1].id);
  });

  it("weekly mode: 7 days, today's weekday decides", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const week = Array.from({ length: 7 }, (_, i) => ({ order: i + 1, kind: i % 2 ? "rest" : "strength", title: `G${i + 1}`, exercises: [] }));
    const bad = await t.app.inject({ method: "PUT", url: "/api/v1/program", headers, payload: { mode: "weekly", days: week.slice(0, 3) } });
    expect(bad.statusCode).toBe(400);
    const ok = await t.app.inject({ method: "PUT", url: "/api/v1/program", headers, payload: { mode: "weekly", days: week } });
    expect(ok.statusCode).toBe(200);
    const v = await view(headers);
    expect(v.program.mode).toBe("weekly");
    expect(v.current.day.title).toBe("G4"); // Thursday
    expect(v.schedule.map((s: { day: DayDTO }) => s.day.title)).toEqual(["G4", "G5", "G6", "G7", "G1", "G2", "G3"]);
    await post(headers, "/program/complete", { strength: [] });
    expect((await view(headers)).current.day.title).toBe("G5");
  });
});

describe("editing a log keeps what was planned (B6)", () => {
  it("PATCH strength keeps plannedSets/Reps/RIR and the planned source", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const done = await post(headers, "/program/complete", { strength: [{ name: "Push-up", sets: [{ reps: 10, rir: 2 }] }] });
    const res = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/workouts/${done.json().log.id}`,
      headers,
      payload: { strength: [{ name: "push-up", sets: [{ reps: 12, rir: 1 }, { reps: 10, rir: 1 }] }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().log.strength[0]).toMatchObject({ plannedSets: 4, plannedReps: 10, plannedRIR: 2, source: "planned" });
    expect(res.json().log.strength[0].sets).toHaveLength(2);
  });
});

describe("legacy (pre-3.0) programs", () => {
  it("are read by index, get ids d<order>, and their logs map by dayOrder", async () => {
    const { user, headers } = await asUser(t);
    const legacyDays = EREN_DAYS.map(({ id: _id, ...d }) => d);
    await Program.collection.insertOne({
      userId: user._id,
      name: "Eski",
      days: legacyDays,
      currentIndex: 3,
      weekNumber: 5,
      startedAt: t.clock.now,
      lastActionAt: t.clock.now,
    });
    await WorkoutLog.collection.insertOne({
      userId: user._id,
      date: new Date(t.clock.now.getTime() - DAY_MS),
      dateKey: "2026-09-09",
      dayOrder: 3,
      weekNumber: 5,
      title: "Bacak",
      kind: "strength",
      isOffDay: false,
      strength: [],
      pointerBefore: 2,
    });
    const v = await view(headers);
    expect(() => zProgramView.parse(v)).not.toThrow();
    expect(v.program).toMatchObject({ mode: "cycle", currentDayId: "d4", currentIndex: 3, cycleNumber: 5, weekNumber: 5 });
    expect(v.program.days.map((d: DayDTO) => d.id)).toEqual(["d1", "d2", "d3", "d4", "d5", "d6", "d7"]);
    const stored = await Program.findOne({ userId: user._id }).lean();
    expect(stored).toMatchObject({ currentDayId: "d4", cycleNumber: 5 }); // upgraded in place
  });

  it("a pre-3.0 log of today still undoes by index", async () => {
    const { user, headers } = await asUser(t);
    await Program.collection.insertOne({ userId: user._id, name: "Eski", days: EREN_DAYS.map(({ id: _id, ...d }) => d), currentIndex: 0, weekNumber: 3, startedAt: t.clock.now, lastActionAt: t.clock.now });
    await WorkoutLog.collection.insertOne({ userId: user._id, date: t.clock.now, dateKey: TODAY, dayOrder: 7, weekNumber: 2, title: "Esneme", kind: "stretch", isOffDay: false, strength: [], pointerBefore: 6 });
    const res = await post(headers, "/program/undo-last");
    expect(res.json().program).toMatchObject({ currentIndex: 6, cycleNumber: 2 });
  });
});

describe("planned volume in the program view", () => {
  it("scales a 3-day cycle to a week and rates it with advice", async () => {
    const { user, headers } = await asUser(t);
    await givenProgram(user._id);
    const v = await view(headers);
    const chest = v.plannedVolume.muscles.find((m: { key: string }) => m.key === "chest");
    // Push-up 4 sets per 3-day pass at the catalog's chest load (it wins over the snapshot's 1.0),
    // scaled to a week: 4 × 0.8 = 3.2 per pass → 3.2 × 7 / 3 = 7.5 per week.
    const perCycle = round(4 * seedLoad("Push-up", "chest"), 2);
    expect(v.plannedVolume.cycleLength).toBe(3);
    expect(chest).toMatchObject({ perCycle, weekly: round((perCycle * 7) / 3, 1), zone: "maintain", severity: "info" });
    expect(v.plannedVolume.advice.find((a: { key: string }) => a.key === "chest").message).toContain("Göğüs");
  });
});

describe("startup migration", () => {
  it("swaps the legacy non-unique day index for the unique one when there are no duplicates", async () => {
    await WorkoutLog.collection.dropIndexes().catch(() => undefined);
    await WorkoutLog.collection.createIndex({ userId: 1, dateKey: 1 });
    const log = { info: () => undefined, warn: () => undefined };
    expect(await ensureUniqueWorkoutDay(log)).toBe("created");
    expect(await ensureUniqueWorkoutDay(log)).toBe("exists");
    const names = (await WorkoutLog.collection.indexes()).map((i) => i.name);
    expect(names).toContain(WORKOUT_DAY_INDEX);
    expect(names).not.toContain("userId_1_dateKey_1");
  });

  it("leaves the index alone (and says so) when duplicates exist", async () => {
    await WorkoutLog.collection.dropIndexes().catch(() => undefined);
    const { user } = await asUser(t);
    const doc = { userId: user._id, date: t.clock.now, dateKey: TODAY, strength: [] };
    await WorkoutLog.collection.insertMany([{ ...doc }, { ...doc }]);
    const warnings: unknown[] = [];
    expect(await ensureUniqueWorkoutDay({ info: () => undefined, warn: (o: unknown) => warnings.push(o) })).toBe("blocked");
    expect(warnings).toHaveLength(1);
  });

  it("re-keys exercise names with the I/İ-folding key (B8)", async () => {
    await Exercise.collection.insertOne({ name: "İncline Press", nameKey: "i̇ncline press", muscles: [], active: true });
    await rekeyExercises({ info: () => undefined, warn: () => undefined });
    expect((await Exercise.findOne({ name: "İncline Press" }).lean())?.nameKey).toBe("incline press");
  });
});
