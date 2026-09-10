/**
 * Cross-module end-to-end flow on the real app (in-memory Mongo, mock vision):
 * seed → login → measurement → goal → auto diet target → meal → workout → weigh-in → weekly report → home → scan → admin overview.
 * Each module is unit/integration tested by its owner; this file checks that they agree with each other.
 */
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./harness";
import { runSeed } from "../src/seed/index";

let t: TestApp;
let headers: Record<string, string>;
let userId: string;
const api = "/api/v1";

function multipart(bytes: Buffer, boundaryTag = "e2e") {
  const boundary = `----fitfloow${boundaryTag}`;
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="meal.png"\r\nContent-Type: image/png\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, bytes, tail]), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

beforeAll(async () => {
  t = await createTestApp();
  await t.reset();
  await runSeed();
  const login = await t.app.inject({ method: "POST", url: `${api}/auth/login`, payload: { username: "eren", password: "Asd*123" } });
  expect(login.statusCode).toBe(200);
  headers = { authorization: `Bearer ${login.json().accessToken}` };
  userId = login.json().user.id;
});
afterAll(async () => {
  await t.close();
});

const get = (url: string) => t.app.inject({ method: "GET", url: `${api}${url}`, headers });
const post = (url: string, payload: unknown) => t.app.inject({ method: "POST", url: `${api}${url}`, headers, payload: payload as never });

describe("e2e flow (eren)", () => {
  let dailyTarget = 0;

  it("seed created eren with a 7-day program and empty state everywhere", async () => {
    const prog = await get("/program");
    expect(prog.statusCode).toBe(200);
    expect(prog.json().program.days).toHaveLength(7);
    expect(prog.json().schedule).toHaveLength(7);
    const goal = await get("/goals/current");
    expect(goal.json()).toEqual({ goal: null, progress: null });
    const home = await get("/reports/home");
    expect(home.statusCode).toBe(200);
    expect(home.json().mascot.text.length).toBeGreaterThan(0);
  });

  it("a tape measurement yields a Navy body-fat entry and an auto weigh-in", async () => {
    const res = await post("/body/entries", { heightCm: 178, neckCm: 38, waistCm: 90, weightKg: 84 });
    expect([200, 201]).toContain(res.statusCode);
    const e = res.json().entry;
    expect(e.bodyFatPct).toBeGreaterThan(15);
    expect(e.bodyFatPct).toBeLessThan(25);
    expect(e.leanMassKg + e.fatMassKg).toBeCloseTo(84, 0);
    const w = await get("/body/weighins?days=30");
    expect(w.json().weighIns.map((x: { source: string }) => x.source)).toContain("bodyEntry");
  });

  it("goal preview and creation produce a roadmap consistent with the settings", async () => {
    const preview = await post("/goals/preview", { targetBodyFatPct: 12, profile: "optimal" });
    expect(preview.statusCode).toBe(200);
    const plan = preview.json().plan;
    expect(plan.fatToLoseKg).toBeGreaterThan(0);
    expect(plan.roadmap.length).toBe(plan.estimatedWeeks);
    expect(plan.roadmap.at(-1).endBfPct).toBeLessThanOrEqual(12.05);
    for (let i = 1; i < plan.roadmap.length; i++) expect(plan.roadmap[i].endWeightKg).toBeLessThan(plan.roadmap[i - 1].endWeightKg);
    expect(plan.initialDailyCalorieTarget).toBeGreaterThanOrEqual(1500);

    const created = await post("/goals", { targetBodyFatPct: 12, profile: "optimal" });
    expect([200, 201]).toContain(created.statusCode);
    dailyTarget = created.json().goal.plan.roadmap[0].dailyCalorieTarget;
    const again = await post("/goals", { targetBodyFatPct: 12 });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("GOAL_EXISTS");
  });

  it("diet target switches to auto mode derived from the goal's current roadmap week", async () => {
    const target = await get("/nutrition/target");
    expect(target.statusCode).toBe(200);
    expect(target.json().mode).toBe("auto");
    expect(target.json().derivedFrom).toBe("goal");
    expect(target.json().calories).toBe(dailyTarget);
    const day = await get("/nutrition/day");
    expect(day.json().target.calories).toBe(dailyTarget);
  });

  it("logging a seed food updates day totals and home calories", async () => {
    const search = await get("/nutrition/foods/search?q=pilav");
    expect(search.statusCode).toBe(200);
    const food = search.json().foods[0];
    expect(food.name.toLowerCase()).toContain("pilav");
    const entry = await post("/nutrition/entries", { meal: "lunch", foodId: food.id, grams: 200, source: "search" });
    expect(entry.statusCode).toBe(201);
    expect(entry.json().dayTotals.kcal).toBeCloseTo((food.per100g.kcal * 200) / 100, 0);
    const home = await get("/reports/home");
    expect(home.json().today.calories.eaten).toBe(entry.json().dayTotals.kcal);
    expect(home.json().today.calories.target).toBe(dailyTarget);
  });

  it("completing today's workout advances the program and fatigues the trained muscles", async () => {
    const before = (await get("/program")).json();
    const day = before.current.day;
    const strength = day.exercises.map((ex: { name: string; targetSets: number; targetReps: number }) => ({
      name: ex.name,
      sets: Array.from({ length: ex.targetSets }, () => ({ reps: ex.targetReps, rir: 2 })),
    }));
    const done = await post("/program/complete", { strength, durationMin: 45 });
    expect([200, 201]).toContain(done.statusCode);
    expect(done.json().program.currentIndex).toBe((before.program.currentIndex + 1) % 7);
    const recovery = (await get("/recovery")).json();
    const trained = new Set(day.exercises.flatMap((ex: { muscles: Array<{ key: string }> }) => ex.muscles.map((m) => m.key)));
    for (const m of recovery.muscles) {
      if (trained.has(m.key)) expect(m.readiness).toBeLessThan(100);
    }
    expect(recovery.overall.fatiguedCount + recovery.overall.readyCount).toBeLessThanOrEqual(recovery.muscles.length);
    const home = await get("/reports/home");
    expect(home.json().today.workout.log).not.toBeNull();
  });

  it("a quick weigh-in is reflected in trends and the weekly report ties everything together", async () => {
    const w = await post("/body/weighins", { weightKg: 83.6 });
    expect([200, 201]).toContain(w.statusCode);
    const trends = (await get("/body/trends?days=30")).json();
    expect(trends.summary.ewmaLatest).toBeGreaterThan(80);

    const report = await get("/reports/weekly");
    expect(report.statusCode).toBe(200);
    const r = report.json();
    expect(r.isCurrent).toBe(true);
    expect(r.goal).not.toBeNull();
    expect(r.nutrition.daysLogged).toBe(1);
    expect(r.training.sessions).toBe(1);
    expect(r.body.weighInDays).toBeGreaterThanOrEqual(1);
    expect(r.body.hasMeasurement).toBe(true);
    expect(r.score).toBeGreaterThan(0);
    expect(r.mascot.text.length).toBeGreaterThan(0);
    expect(r.nutrition.days).toHaveLength(7);

    const history = (await get("/reports/weekly/history?limit=4")).json();
    expect(history.weeks.at(-1).weekKey).toBe(r.weekKey); // ascending for charts
    expect(history.weeks.map((w: { weekKey: string }) => w.weekKey)).toEqual([...history.weeks.map((w: { weekKey: string }) => w.weekKey)].sort());

    const goalView = (await get("/goals/current")).json();
    expect(goalView.progress).not.toBeNull();
    expect(goalView.progress.daysElapsed).toBe(0);
    expect(["ahead", "onTrack", "behind", "stalled"]).toContain(goalView.progress.onTrack);
  });

  it("scanning a photo maps mock labels to seeded foods and can be logged from the scan", async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 120, b: 60 } } }).png().toBuffer();
    const m = multipart(png);
    const res = await t.app.inject({ method: "POST", url: `${api}/nutrition/scan`, headers: { ...headers, ...m.headers }, payload: m.payload });
    expect(res.statusCode).toBe(200);
    const scan = res.json();
    expect(scan.mock).toBe(true);
    expect(scan.detections.length).toBeGreaterThan(0);
    for (const d of scan.detections) {
      expect(d.food, `label ${d.label} must map to a seeded food`).not.toBeNull();
      expect(d.suggestedGrams).toBeGreaterThan(0);
    }
    const first = scan.detections[0];
    const logged = await post("/nutrition/entries", { meal: "dinner", foodId: first.food.id, grams: first.suggestedGrams, source: "scan", scanId: scan.scanId });
    expect(logged.statusCode).toBe(201);
    const day = (await get("/nutrition/day")).json();
    expect(day.meals.dinner).toHaveLength(1);
    expect(day.meals.dinner[0].source).toBe("scan");
  });

  it("admin overview for eren aggregates program, body, goal, workouts and the live week report", async () => {
    const res = await get(`/admin/users/${userId}/overview`);
    expect(res.statusCode).toBe(200);
    const o = res.json();
    expect(o.program.days).toHaveLength(7);
    expect(o.latestBody.weightKg).toBe(84);
    expect(o.goal.status).toBe("active");
    expect(o.lastWorkouts).toHaveLength(1);
    expect(o.weekReport).not.toBeNull();
    expect(o.weekReport.training.sessions).toBe(1);
    const dash = (await get("/admin/dashboard")).json();
    expect(dash.goalsActive).toBe(1);
    expect(dash.meals7d).toBe(2);
    expect(dash.workouts7d).toBe(1);
    expect(dash.scans7d).toBe(1);
  });

  it("recalibration refuses gracefully before enough data exists", async () => {
    const res = await post("/goals/current/recalibrate", {});
    expect(res.statusCode).toBe(200);
    expect(res.json().recalibration.applied).toBe(false);
    expect(res.json().recalibration.reason).toBeTruthy();
  });
});
