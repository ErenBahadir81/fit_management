import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { shiftKey, zHome } from "@fitfloow/core";
import { asUser, createTestApp, seedBasics, type TestApp, type TestUser } from "./harness";
import { BodyEntry, WeighIn } from "../src/models/body";
import { MealEntry, DietTarget } from "../src/models/nutrition";
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
  t.clock.now = new Date("2026-09-10T09:00:00.000Z"); // Thursday 12:00 TR
});

const api = "/api/v1";
const TODAY = "2026-09-10";
const eren = { heightCm: 186, neckCm: 40, waistCm: 80.7, weightKg: 103 };

async function meals(user: TestUser, fromKey: string, days: number, kcal: number, protein = 160) {
  await MealEntry.insertMany(
    Array.from({ length: days }, (_, i) => ({
      userId: user._id,
      dateKey: shiftKey(fromKey, i),
      meal: "lunch",
      name: "Test",
      grams: 300,
      per100g: { kcal: kcal / 3, protein: protein / 3, carbs: 20, fat: 5 },
      totals: { kcal, protein, carbs: 200, fat: 60 },
      source: "manual",
      loggedAt: new Date(`${shiftKey(fromKey, i)}T12:00:00.000Z`),
    }))
  );
}

async function weighIns(user: TestUser, fromKey: string, days: number, start: number, perDay: number) {
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

async function workouts(user: TestUser, dateKeys: string[], muscle = "chest") {
  await WorkoutLog.insertMany(
    dateKeys.map((dateKey) => ({
      userId: user._id,
      date: new Date(`${dateKey}T06:00:00.000Z`),
      dateKey,
      dayOrder: 1,
      weekNumber: 1,
      title: "Push",
      kind: "strength",
      isOffDay: false,
      strength: [
        { name: "Bench", muscles: [{ key: muscle, load: 1 }], sets: [{ reps: 8, rir: 2 }, { reps: 8, rir: 2 }], source: "planned", skipped: false, metric: "reps" },
      ],
    }))
  );
}

async function assignProgram(user: TestUser) {
  const template = await ProgramTemplate.findOne().lean();
  await Program.create({ userId: user._id, name: template!.name, days: template!.days, currentIndex: 0, sourceTemplateId: template!._id });
  return template!;
}

describe("GET /reports/home", () => {
  it("is well formed for a brand new user", async () => {
    const { headers, user } = await asUser(t, { gender: "male", heightCm: 186 });
    const res = await t.app.inject({ method: "GET", url: `${api}/reports/home`, headers });
    expect(res.statusCode).toBe(200);
    const h = res.json();
    expect(h.user).toMatchObject({ id: String(user._id), measurementDay: 0 });
    expect(h.today).toMatchObject({ dateKey: TODAY, weekday: 4, weighedIn: false });
    expect(h.today.workout).toEqual({ day: null, log: null, programName: null });
    expect(h.today.calories).toEqual({ target: 0, eaten: 0, remaining: 0 });
    expect(h.goal).toBeNull();
    expect(h.week).toMatchObject({ weekKey: "2026-09-06", dayIndex: 4, deficitBankedKcal: 0, score: 0, onTrack: null });
    expect(h.streaks).toEqual({ workout: 0, logging: 0, weighIn: 0 });
    expect(h.recovery.readiness).toBe(100);
    expect(h.recovery.top).toHaveLength(3);
    expect(h.mascot.key).toBe("home.noData");
  });

  it("shows today's plate against the goal target", async () => {
    const { headers, user } = await asUser(t);
    await t.app.inject({ method: "POST", url: `${api}/body/entries`, headers, payload: eren });
    const goal = (await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } })).json().goal;
    await meals(user, TODAY, 1, 1800, 140);

    const h = (await t.app.inject({ method: "GET", url: `${api}/reports/home`, headers })).json();
    expect(h.today.calories.target).toBe(goal.plan.roadmap[0].dailyCalorieTarget);
    expect(h.today.calories.eaten).toBe(1800);
    expect(h.today.calories.remaining).toBe(goal.plan.roadmap[0].dailyCalorieTarget - 1800);
    expect(h.today.protein).toEqual({ target: goal.plan.roadmap[0].macros.protein, eaten: 140 });
    expect(h.today.weighedIn).toBe(true);
    expect(h.goal.weekIndexInPlan).toBe(1);
    expect(h.mascot.key).toBe("home.caloriesLeft");
    expect(h.mascot.text).toContain(String(goal.plan.roadmap[0].dailyCalorieTarget - 1800));
  });

  it("prefers a manual diet target over the goal", async () => {
    const { headers, user } = await asUser(t);
    await t.app.inject({ method: "POST", url: `${api}/body/entries`, headers, payload: eren });
    await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } });
    await DietTarget.create({ userId: user._id, mode: "manual", calories: 2200, protein: 190, carbs: 200, fat: 70 });
    const h = (await t.app.inject({ method: "GET", url: `${api}/reports/home`, headers })).json();
    expect(h.today.calories.target).toBe(2200);
    expect(h.today.protein.target).toBe(190);
  });

  it("surfaces today's program day and the workout log", async () => {
    const { headers, user } = await asUser(t);
    const template = await assignProgram(user);
    const before = (await t.app.inject({ method: "GET", url: `${api}/reports/home`, headers })).json();
    expect(before.today.workout.day.title).toBe(template.days[0].title);
    expect(before.today.workout.programName).toBe(template.name);
    expect(before.today.workout.log).toBeNull();
    expect(["home.workoutDue", "home.restDay", "home.noData"]).toContain(before.mascot.key);

    await workouts(user, [TODAY]);
    const after = (await t.app.inject({ method: "GET", url: `${api}/reports/home`, headers })).json();
    expect(after.today.workout.log.dateKey).toBe(TODAY);
    expect(after.mascot.key).toBe("home.workoutDone");
  });

  it("computes recovery from the last week of training", async () => {
    const { headers, user } = await asUser(t);
    await workouts(user, [TODAY], "chest");
    const h = (await t.app.inject({ method: "GET", url: `${api}/reports/home`, headers })).json();
    const chest = h.recovery.top.find((m: { key: string }) => m.key === "chest");
    expect(chest).toBeTruthy();
    expect(chest.readiness).toBeLessThan(100);
    expect(["fatigued", "recovering"]).toContain(chest.status);
    expect(h.recovery.readiness).toBeLessThan(100);
    expect(h.recovery.fatiguedCount).toBeGreaterThanOrEqual(1);
  });

  it("counts streaks back from today", async () => {
    const { headers, user } = await asUser(t);
    await meals(user, shiftKey(TODAY, -4), 5, 2200);
    await weighIns(user, shiftKey(TODAY, -2), 3, 101, 0.1);
    await workouts(user, [TODAY, shiftKey(TODAY, -1)]);
    const h = (await t.app.inject({ method: "GET", url: `${api}/reports/home`, headers })).json();
    expect(h.streaks.logging).toBe(5);
    expect(h.streaks.weighIn).toBe(3);
    expect(h.streaks.workout).toBe(2);
  });

  it("keeps the streak alive when today has not happened yet", async () => {
    const { headers, user } = await asUser(t);
    await meals(user, shiftKey(TODAY, -3), 3, 2200); // up to yesterday
    const h = (await t.app.inject({ method: "GET", url: `${api}/reports/home`, headers })).json();
    expect(h.streaks.logging).toBe(3);
  });

  it("reports the live week block from the same data", async () => {
    const { headers, user } = await asUser(t);
    await t.app.inject({ method: "POST", url: `${api}/body/entries`, headers, payload: eren });
    await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } });
    await meals(user, "2026-09-06", 5, 2400);
    await weighIns(user, "2026-09-06", 5, 103, 0.08);

    const h = (await t.app.inject({ method: "GET", url: `${api}/reports/home`, headers })).json();
    const weekly = (await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers })).json();
    expect(h.week.deficitBankedKcal).toBe(weekly.nutrition.deficitBankedKcal);
    expect(h.week.score).toBe(weekly.score);
    expect(h.week.onTrack).toBe(weekly.goalDistance.onTrack);
  });

  it("stays silent when the mascot is disabled", async () => {
    const { headers } = await asUser(t);
    await t.app.inject({ method: "PATCH", url: `${api}/me`, headers, payload: { mascotEnabled: false } });
    const h = (await t.app.inject({ method: "GET", url: `${api}/reports/home`, headers })).json();
    expect(h.mascot.text).toBe("");
  });

  it("requires auth", async () => {
    expect((await t.app.inject({ method: "GET", url: `${api}/reports/home` })).statusCode).toBe(401);
  });
});

describe("DTO contract", () => {
  it("the home composite validates against zHome", async () => {
    const { headers, user } = await asUser(t);
    await assignProgram(user);
    await t.app.inject({ method: "POST", url: `${api}/body/entries`, headers, payload: eren });
    await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } });
    await meals(user, shiftKey(TODAY, -3), 4, 2300);
    await weighIns(user, shiftKey(TODAY, -3), 4, 103, 0.1);
    await workouts(user, [shiftKey(TODAY, -1)]);
    const res = await t.app.inject({ method: "GET", url: `${api}/reports/home`, headers });
    expect(() => zHome.parse(res.json())).not.toThrow();
  });
});

describe("GET /reports/home — performance", () => {
  it("answers in under 40 ms with a realistic data set (~200 docs)", async () => {
    const { headers, user } = await asUser(t);
    await assignProgram(user);
    await t.app.inject({ method: "POST", url: `${api}/body/entries`, headers, payload: eren });
    await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } });
    await weighIns(user, shiftKey(TODAY, -89), 90, 106, 0.03);
    await meals(user, shiftKey(TODAY, -59), 60, 2400);
    await workouts(
      user,
      Array.from({ length: 30 }, (_, i) => shiftKey(TODAY, -i * 2))
    );
    await BodyEntry.insertMany(
      Array.from({ length: 12 }, (_, i) => ({
        userId: user._id,
        date: new Date(`${shiftKey(TODAY, -i * 7)}T09:00:00.000Z`),
        dateKey: shiftKey(TODAY, -i * 7),
        gender: "male",
        heightCm: 186,
        neckCm: 40,
        waistCm: 82 + i * 0.3,
        weightKg: 103 + i * 0.2,
        bodyFatPct: 11 + i * 0.2,
        fatMassKg: 12,
        leanMassKg: 91,
      }))
    );

    const total =
      (await WeighIn.countDocuments()) +
      (await MealEntry.countDocuments()) +
      (await WorkoutLog.countDocuments()) +
      (await BodyEntry.countDocuments());
    expect(total).toBeGreaterThan(180);

    for (let i = 0; i < 3; i++) await t.app.inject({ method: "GET", url: `${api}/reports/home`, headers });
    const samples: number[] = [];
    for (let i = 0; i < 9; i++) {
      const started = performance.now();
      const res = await t.app.inject({ method: "GET", url: `${api}/reports/home`, headers });
      samples.push(performance.now() - started);
      expect(res.statusCode).toBe(200);
    }
    const median = samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    expect(median).toBeLessThan(40);
  });
});
