import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { shiftKey, zMascotMessage, zWeeklyReport, zWeeklyReportSummary } from "@fitfloow/core";
import { asUser, createTestApp, seedBasics, type TestApp, type TestUser } from "./harness";
import { BodyEntry, WeighIn } from "../src/models/body";
import { WeeklyReportCache } from "../src/models/goal";
import { MealEntry } from "../src/models/nutrition";
import { Program, ProgramTemplate } from "../src/models/program";
import { WorkoutLog } from "../src/models/workoutLog";

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
  t.clock.now = new Date("2026-09-10T09:00:00.000Z"); // Thursday, week 2026-09-06
});

const api = "/api/v1";
const WEEK = "2026-09-06";
const eren = { heightCm: 186, neckCm: 40, waistCm: 80.7, weightKg: 103 };

async function seedMeals(user: TestUser, fromKey: string, days: number, kcal: number) {
  await MealEntry.insertMany(
    Array.from({ length: days }, (_, i) => ({
      userId: user._id,
      dateKey: shiftKey(fromKey, i),
      meal: "lunch",
      name: "Test",
      grams: 300,
      per100g: { kcal: kcal / 3, protein: 12, carbs: 20, fat: 5 },
      totals: { kcal, protein: 180, carbs: 200, fat: 60 },
      source: "manual",
      loggedAt: new Date(`${shiftKey(fromKey, i)}T12:00:00.000Z`),
    }))
  );
}

async function seedWeighIns(user: TestUser, fromKey: string, days: number, start: number, perDay: number) {
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

async function seedWorkouts(user: TestUser, dateKeys: string[]) {
  await WorkoutLog.insertMany(
    dateKeys.map((dateKey, i) => ({
      userId: user._id,
      date: new Date(`${dateKey}T06:00:00.000Z`),
      dateKey,
      dayOrder: i + 1,
      weekNumber: 1,
      title: "Push",
      kind: "strength",
      isOffDay: false,
      strength: [
        { name: "Bench", muscles: [{ key: "chest", load: 1 }], sets: [{ reps: 8, rir: 2 }, { reps: 8, rir: 2 }, { reps: 8, rir: 1 }], source: "planned", skipped: false, metric: "reps" },
      ],
    }))
  );
}

async function assignProgram(user: TestUser) {
  const template = await ProgramTemplate.findOne().lean();
  await Program.create({ userId: user._id, name: template!.name, days: template!.days, currentIndex: 0, sourceTemplateId: template!._id });
  return template!;
}

async function createGoal(headers: Record<string, string>) {
  await t.app.inject({ method: "POST", url: `${api}/body/entries`, headers, payload: eren });
  const res = await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } });
  return res.json().goal;
}

describe("GET /reports/weekly", () => {
  it("defaults to the current week for the user's measurement day", async () => {
    const { headers } = await asUser(t, { measurementDay: 0 });
    const res = await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers });
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r.weekKey).toBe(WEEK);
    expect(r.startKey).toBe(WEEK);
    expect(r.endKey).toBe("2026-09-12");
    expect(r.isCurrent).toBe(true);
    expect(r.dayIndexToday).toBe(4);
    expect(r.measurementDay).toBe(0);
  });

  it("follows a Monday measurement day", async () => {
    const { headers } = await asUser(t, { measurementDay: 1 });
    const res = await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers });
    expect(res.json().weekKey).toBe("2026-09-07");
  });

  it("snaps a mid-week date to the week start", async () => {
    const { headers } = await asUser(t, { measurementDay: 0 });
    const res = await t.app.inject({ method: "GET", url: `${api}/reports/weekly?week=2026-09-09`, headers });
    expect(res.json().weekKey).toBe(WEEK);
  });

  it("rejects a malformed week", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url: `${api}/reports/weekly?week=nope`, headers });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });

  it("is all zeros and sleepy for a brand new user", async () => {
    const { headers } = await asUser(t);
    const r = (await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers })).json();
    expect(r.score).toBe(0);
    expect(r.nutrition.daysLogged).toBe(0);
    expect(r.training.sessions).toBe(0);
    expect(r.goal).toBeNull();
    expect(r.mascot.key).toBe("report.empty");
    expect(r.mascot.mood).toBe("sleepy");
  });

  it("aggregates nutrition, body, training and the goal for the week", async () => {
    const { headers, user } = await asUser(t, { gender: "male", heightCm: 186 });
    const goal = await createGoal(headers);
    await assignProgram(user);
    await seedMeals(user, WEEK, 5, 2600);
    await seedWeighIns(user, WEEK, 5, 103, 0.08);
    await seedWorkouts(user, [WEEK, shiftKey(WEEK, 2), shiftKey(WEEK, 4)]);

    const r = (await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers })).json();
    expect(r.goal).toMatchObject({ targetBodyFatPct: 7, weekIndexInPlan: 1 });
    expect(r.goal.plannedDailyTarget).toBe(goal.plan.roadmap[0].dailyCalorieTarget);
    expect(r.nutrition.daysLogged).toBe(5);
    expect(r.nutrition.avgKcal).toBe(2600);
    expect(r.nutrition.deficitBankedKcal).toBeGreaterThan(0);
    expect(r.nutrition.days).toHaveLength(7);
    expect(r.nutrition.days[5].logged).toBe(false);
    expect(r.body.weighInDays).toBe(5);
    expect(r.body.hasMeasurement).toBe(true);
    expect(r.body.ewmaDelta).toBeLessThan(0);
    expect(r.training.sessions).toBe(3);
    expect(r.training.sets).toBe(9);
    expect(r.training.plannedSessions).toBeGreaterThan(0);
    expect(r.training.volumeByMuscle.find((m: { key: string }) => m.key === "chest").done).toBe(9);
    expect(r.goalDistance).not.toBeNull();
    expect(r.score).toBeGreaterThan(0);
    expect(r.highlights.length).toBeGreaterThan(0);
  });

  it("only counts the elapsed days of a live week for the planned deficit", async () => {
    const { headers } = await asUser(t);
    await createGoal(headers);
    const live = (await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers })).json();
    expect(live.nutrition.deficitPlannedKcal).toBeGreaterThan(0);
    expect(live.nutrition.deficitPlannedKcal).toBeLessThan(live.goal.plannedWeeklyDeficit);

    t.clock.now = new Date("2026-09-20T09:00:00.000Z");
    await WeeklyReportCache.deleteMany({});
    const past = (await t.app.inject({ method: "GET", url: `${api}/reports/weekly?week=${WEEK}`, headers })).json();
    expect(past.isCurrent).toBe(false);
    expect(past.nutrition.deficitPlannedKcal).toBe(past.goal.plannedWeeklyDeficit);
  });
});

describe("weekly report cache", () => {
  it("writes through and serves the cached document", async () => {
    const { headers, user } = await asUser(t);
    await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers });
    const cached = await WeeklyReportCache.findOne({ userId: user._id, weekKey: WEEK }).lean();
    expect(cached).toBeTruthy();

    await WeeklyReportCache.updateOne({ _id: cached!._id }, { $set: { "report.score": 42 } });
    const again = (await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers })).json();
    expect(again.score).toBe(42);
  });

  it("a weigh-in inside the week drops the cache", async () => {
    const { headers, user } = await asUser(t);
    await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers });
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBe(1);
    await t.app.inject({ method: "POST", url: `${api}/body/weighins`, headers, payload: { weightKg: 100.2 } });
    expect(await WeeklyReportCache.countDocuments({ userId: user._id, weekKey: WEEK })).toBe(0);
  });

  it("a measurement in a different week keeps other caches", async () => {
    const { headers, user } = await asUser(t);
    await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers });
    await t.app.inject({ method: "GET", url: `${api}/reports/weekly?week=2026-08-30`, headers });
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBe(2);
    await t.app.inject({ method: "POST", url: `${api}/body/weighins`, headers, payload: { weightKg: 99, dateKey: "2026-09-01" } });
    const left = await WeeklyReportCache.find({ userId: user._id }).lean();
    expect(left.map((c) => c.weekKey)).toEqual([WEEK]);
  });
});

describe("GET /reports/weekly/history", () => {
  it("builds the missing weeks on demand, oldest first", async () => {
    const { headers, user } = await asUser(t);
    await createGoal(headers);
    await seedMeals(user, shiftKey(WEEK, -14), 20, 2500);
    await seedWeighIns(user, shiftKey(WEEK, -14), 20, 104, 0.07);

    const res = await t.app.inject({ method: "GET", url: `${api}/reports/weekly/history?limit=4`, headers });
    expect(res.statusCode).toBe(200);
    const { weeks } = res.json();
    expect(weeks).toHaveLength(4);
    expect(weeks.map((w: { weekKey: string }) => w.weekKey)).toEqual([shiftKey(WEEK, -21), shiftKey(WEEK, -14), shiftKey(WEEK, -7), WEEK]);
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBe(4);
    expect(weeks[1].daysLogged).toBeGreaterThan(0);
    expect(weeks[3]).toHaveProperty("score");
    expect(weeks[3]).toHaveProperty("ewmaDelta");
  });

  it("caps the window at 26 weeks", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url: `${api}/reports/weekly/history?limit=60`, headers });
    expect(res.statusCode).toBe(400);
    const ok = await t.app.inject({ method: "GET", url: `${api}/reports/weekly/history?limit=26`, headers });
    expect(ok.json().weeks).toHaveLength(26);
  });

  it("defaults to 12 weeks", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url: `${api}/reports/weekly/history`, headers });
    expect(res.json().weeks).toHaveLength(12);
  });
});

describe("GET /mascot/message", () => {
  it("returns a rendered line per context", async () => {
    const { headers } = await asUser(t);
    for (const context of ["home", "report", "scan", "workout", "body", "goal"]) {
      const res = await t.app.inject({ method: "GET", url: `${api}/mascot/message?context=${context}`, headers });
      expect(res.statusCode).toBe(200);
      const m = res.json();
      expect(m.text.length).toBeGreaterThan(0);
      expect(m.text).not.toContain("{");
      expect(["happy", "cheer", "think", "sleepy", "flex", "worried"]).toContain(m.mood);
    }
  });

  it("nudges a user without a goal and celebrates one with a plan", async () => {
    const { headers } = await asUser(t);
    expect((await t.app.inject({ method: "GET", url: `${api}/mascot/message?context=goal`, headers })).json().key).toBe("goal.none");
    await createGoal(headers);
    expect((await t.app.inject({ method: "GET", url: `${api}/mascot/message?context=goal`, headers })).json().key).toBe("goal.created");
  });

  it("asks for a measurement when there is none", async () => {
    const { headers } = await asUser(t);
    expect((await t.app.inject({ method: "GET", url: `${api}/mascot/message?context=body`, headers })).json().key).toBe("body.noMeasurement7d");
    await t.app.inject({ method: "POST", url: `${api}/body/entries`, headers, payload: eren });
    expect((await t.app.inject({ method: "GET", url: `${api}/mascot/message?context=body`, headers })).json().key).toBe("body.newMeasurement");
  });

  it("stays silent when the mascot is switched off", async () => {
    const { headers, user } = await asUser(t);
    await BodyEntry.deleteMany({ userId: user._id });
    await t.app.inject({ method: "PATCH", url: `${api}/me`, headers, payload: { mascotEnabled: false } });
    const res = await t.app.inject({ method: "GET", url: `${api}/mascot/message?context=body`, headers });
    expect(res.json().text).toBe("");
  });

  it("rejects an unknown context", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url: `${api}/mascot/message?context=space`, headers });
    expect(res.statusCode).toBe(400);
  });

  it("requires auth", async () => {
    expect((await t.app.inject({ method: "GET", url: `${api}/mascot/message` })).statusCode).toBe(401);
  });
});

describe("DTO contract", () => {
  it("the weekly report, its summary and the mascot line validate against the schemas", async () => {
    const { headers, user } = await asUser(t);
    await createGoal(headers);
    await assignProgram(user);
    await seedMeals(user, WEEK, 4, 2500);
    await seedWeighIns(user, WEEK, 4, 103, 0.1);
    await seedWorkouts(user, [WEEK, shiftKey(WEEK, 2)]);

    const weekly = await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers });
    expect(() => zWeeklyReport.parse(weekly.json())).not.toThrow();
    const history = await t.app.inject({ method: "GET", url: `${api}/reports/weekly/history?limit=3`, headers });
    for (const w of history.json().weeks) expect(() => zWeeklyReportSummary.parse(w)).not.toThrow();
    const mascot = await t.app.inject({ method: "GET", url: `${api}/mascot/message?context=report`, headers });
    expect(() => zMascotMessage.parse(mascot.json())).not.toThrow();
  });
});
