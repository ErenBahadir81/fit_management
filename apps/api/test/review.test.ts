/**
 * Regression suite for the adversarial backend review (docs/plan/agents/REVIEW-backend.md).
 * Every `it` here is either a defect that was found and fixed, or a security property that was
 * audited and must not silently regress.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import type { FastifyRequest } from "fastify";
import { shiftKey } from "@fitfloow/core";
import { asAdmin, asUser, createTestApp, seedBasics, type TestApp, type TestUser } from "./harness";
import { rateLimitKey } from "../src/app";
import { loadConfig } from "../src/config";
import { LOGIN_RATE_LIMIT } from "../src/modules/platform/auth.routes";
import { BodyEntry, WeighIn } from "../src/models/body";
import { WeeklyReportCache } from "../src/models/goal";
import { MealEntry } from "../src/models/nutrition";
import { User } from "../src/models/user";
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
  t.clock.now = new Date("2026-09-10T09:00:00.000Z"); // Thursday, week 2026-09-06 (measurementDay 0)
});

const api = "/api/v1";

async function seedBodyEntry(user: TestUser, dateKey = "2026-09-01") {
  return BodyEntry.create({
    userId: user._id,
    date: new Date(`${dateKey}T09:00:00.000Z`),
    dateKey,
    gender: "male",
    heightCm: 186,
    neckCm: 40,
    waistCm: 80.7,
    weightKg: 103,
    bodyFatPct: 10,
    fatMassKg: 10.3,
    leanMassKg: 92.7,
  });
}

const fakeReq = (headers: Record<string, string>, ip = "10.0.0.1") => ({ headers, ip }) as unknown as FastifyRequest;

/* ------------------------------ authorization ----------------------------- */

describe("review · authorization", () => {
  it("PATCH /me cannot escalate the caller's role", async () => {
    const { user, headers } = await asUser(t);
    const res = await t.app.inject({
      method: "PATCH",
      url: `${api}/me`,
      headers,
      payload: { displayName: "Yeni", role: "admin", passwordHash: "x", username: "root" },
    });
    expect(res.statusCode).toBe(200);
    const stored = await User.findById(user._id).lean();
    expect(stored?.role).toBe("user");
    expect(stored?.username).toBe(user.username);
    expect(stored?.displayName).toBe("Yeni");
  });

  it("no IDOR: user-scoped writes of another user's rows are 404, never applied", async () => {
    const owner = await asUser(t);
    const attacker = await asUser(t);
    const entry = await seedBodyEntry(owner.user, "2026-09-09");
    const weighIn = await WeighIn.create({ userId: owner.user._id, dateKey: "2026-09-08", weightKg: 100, source: "manual" });
    const meal = await MealEntry.create({
      userId: owner.user._id,
      dateKey: "2026-09-09",
      meal: "lunch",
      name: "Pilav",
      grams: 100,
      per100g: { kcal: 130, protein: 3, carbs: 28, fat: 0.3 },
      totals: { kcal: 130, protein: 3, carbs: 28, fat: 0.3 },
      source: "manual",
      loggedAt: new Date(),
    });
    const log = await WorkoutLog.create({ userId: owner.user._id, date: new Date(), dateKey: "2026-09-09", title: "Push", kind: "strength" });

    const probes: Array<[string, string, object | undefined]> = [
      ["PATCH", `${api}/body/entries/${entry._id}`, { weightKg: 50 }],
      ["DELETE", `${api}/body/entries/${entry._id}`, undefined],
      ["DELETE", `${api}/body/weighins/${weighIn._id}`, undefined],
      ["PATCH", `${api}/nutrition/entries/${meal._id}`, { grams: 1 }],
      ["DELETE", `${api}/nutrition/entries/${meal._id}`, undefined],
      ["GET", `${api}/workouts/${log._id}`, undefined],
      ["PATCH", `${api}/workouts/${log._id}`, { notes: "hacked" }],
      ["DELETE", `${api}/workouts/${log._id}`, undefined],
    ];
    for (const [method, url, payload] of probes) {
      const res = await t.app.inject({ method: method as "GET", url, headers: attacker.headers, payload: payload as never });
      expect(`${method} ${url} → ${res.statusCode}`).toBe(`${method} ${url} → 404`);
    }
    expect((await BodyEntry.findById(entry._id).lean())?.weightKg).toBe(103);
    expect(await WeighIn.countDocuments({ _id: weighIn._id })).toBe(1);
    expect((await MealEntry.findById(meal._id).lean())?.grams).toBe(100);
    expect((await WorkoutLog.findById(log._id).lean())?.notes ?? null).toBeNull();
  });

  it("a private food is invisible and unusable for everyone but its owner", async () => {
    const owner = await asUser(t);
    const other = await asUser(t);
    const created = await t.app.inject({
      method: "POST",
      url: `${api}/nutrition/foods`,
      headers: owner.headers,
      payload: { name: "gizli tarif", per100g: { kcal: 120, protein: 5, carbs: 10, fat: 4 } },
    });
    const id = JSON.parse(created.body).food.id as string;
    expect((await t.app.inject({ method: "GET", url: `${api}/nutrition/foods/${id}`, headers: other.headers })).statusCode).toBe(404);
    const search = await t.app.inject({ method: "GET", url: `${api}/nutrition/foods/search?q=gizli`, headers: other.headers });
    expect(JSON.parse(search.body).foods).toHaveLength(0);
    const logged = await t.app.inject({
      method: "POST",
      url: `${api}/nutrition/entries`,
      headers: other.headers,
      payload: { meal: "lunch", foodId: id, grams: 100 },
    });
    expect(logged.statusCode).toBe(404);
  });

  it("scan images are owner-only and the path segments cannot escape the upload dir", async () => {
    const owner = await asUser(t);
    const other = await asUser(t);
    expect((await t.app.inject({ method: "GET", url: `${api}/uploads/scans/${owner.user._id}/x.jpg`, headers: other.headers })).statusCode).toBe(403);
    for (const url of [
      `${api}/uploads/scans/${owner.user._id}/..%2F..%2Fetc%2Fpasswd`,
      `${api}/uploads/scans/${owner.user._id}/..%2Fother.jpg`,
      `${api}/uploads/scans/${owner.user._id}/x.png`,
    ]) {
      expect((await t.app.inject({ method: "GET", url, headers: owner.headers })).statusCode).toBe(404);
    }
  });

  it("admin-only routes reject a normal user", async () => {
    const { headers } = await asUser(t);
    for (const url of [`${api}/admin/dashboard`, `${api}/admin/users`, `${api}/admin/settings`, `${api}/admin/scans`, `${api}/admin/system/health`]) {
      expect((await t.app.inject({ method: "GET", url, headers })).statusCode).toBe(403);
    }
  });
});

/* -------------------------------- rate limit ------------------------------- */

describe("review · rate limiting", () => {
  it("the bucket is the verified subject, so a forged header cannot mint a fresh one", () => {
    // Before the fix the key was the last 32 chars of the raw header: any garbage value bought a
    // brand-new 20/min login bucket.
    expect(rateLimitKey(t.app, fakeReq({ authorization: "Bearer " + "a".repeat(200) }))).toBe("ip:10.0.0.1");
    expect(rateLimitKey(t.app, fakeReq({ authorization: "Bearer " + "b".repeat(200) }))).toBe("ip:10.0.0.1");
    expect(rateLimitKey(t.app, fakeReq({}))).toBe("ip:10.0.0.1");
  });

  it("rotating a token keeps the same bucket", () => {
    const id = new mongoose.Types.ObjectId().toString();
    const one = t.app.signAccessToken({ id, role: "user" });
    const two = t.app.signAccessToken({ id, role: "user" });
    expect(rateLimitKey(t.app, fakeReq({ authorization: `Bearer ${one}` }))).toBe(`u:${id}`);
    expect(rateLimitKey(t.app, fakeReq({ authorization: `Bearer ${two}` }))).toBe(`u:${id}`);
    const other = t.app.signAccessToken({ id: new mongoose.Types.ObjectId().toString(), role: "user" });
    expect(rateLimitKey(t.app, fakeReq({ authorization: `Bearer ${other}` }))).not.toBe(`u:${id}`);
  });

  it("/auth/login is limited per IP whatever the client sends", () => {
    expect(LOGIN_RATE_LIMIT.max).toBe(20);
    expect(LOGIN_RATE_LIMIT.keyGenerator({ ip: "1.2.3.4" } as never)).toBe("login:1.2.3.4");
  });
});

/* --------------------------------- config ---------------------------------- */

describe("review · config", () => {
  it("auth cookies are Secure in production unless explicitly disabled", () => {
    expect(loadConfig({ NODE_ENV: "production", JWT_SECRET: "x".repeat(24) }).COOKIE_SECURE).toBe(true);
    expect(loadConfig({ NODE_ENV: "production", JWT_SECRET: "x".repeat(24), COOKIE_SECURE: "0" }).COOKIE_SECURE).toBe(false);
    expect(loadConfig({ NODE_ENV: "test" }).COOKIE_SECURE).toBe(false);
  });
});

/* ------------------------------- correctness ------------------------------- */

describe("review · reports", () => {
  it("an abandoned goal never shadows the active one", async () => {
    const { user, headers } = await asUser(t);
    await seedBodyEntry(user);
    expect((await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 8 } })).statusCode).toBe(200);
    await t.app.inject({ method: "POST", url: `${api}/goals/current/abandon`, headers });
    expect((await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } })).statusCode).toBe(200);

    const home = JSON.parse((await t.app.inject({ method: "GET", url: `${api}/reports/home`, headers })).body);
    expect(home.goal).not.toBeNull();

    const report = JSON.parse((await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers })).body);
    expect(report.goal?.targetBodyFatPct).toBe(7);
  });

  it("the live week's cached report is not reused after the Türkiye day rolls over", async () => {
    const { headers } = await asUser(t);
    const day1 = JSON.parse((await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers })).body);
    expect(day1.dayIndexToday).toBe(4); // Thursday of a Sunday-start week

    t.clock.now = new Date("2026-09-11T09:00:00.000Z"); // Friday, same week, no write in between
    const day2 = JSON.parse((await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers })).body);
    expect(day2.weekKey).toBe(day1.weekKey);
    expect(day2.dayIndexToday).toBe(5);

    const history = JSON.parse((await t.app.inject({ method: "GET", url: `${api}/reports/weekly/history?limit=2`, headers })).body);
    expect(history.weeks.at(-1).weekKey).toBe(day1.weekKey);
  });

  it("a goal re-plan drops every cached week, not only today's", async () => {
    const { user, headers } = await asUser(t);
    await seedBodyEntry(user);
    await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } });
    await t.app.inject({ method: "GET", url: `${api}/reports/weekly/history?limit=4`, headers });
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBeGreaterThan(1);

    await t.app.inject({ method: "PATCH", url: `${api}/goals/current`, headers, payload: { targetBodyFatPct: 9 } });
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBe(0);
  });

  it("changing the measurement day drops the cached reports keyed by the old boundary", async () => {
    const { user, headers } = await asUser(t, { measurementDay: 0 });
    await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers });
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBe(1);

    await t.app.inject({ method: "PATCH", url: `${api}/me`, headers, payload: { measurementDay: 4 } });
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBe(0);

    // An unrelated PATCH keeps the cache.
    await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers });
    await t.app.inject({ method: "PATCH", url: `${api}/me`, headers, payload: { displayName: "Floo" } });
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBe(1);
  });

  it("admin moving a user's measurement day drops that user's cached reports", async () => {
    const admin = await asAdmin(t);
    const { user, headers } = await asUser(t, { measurementDay: 0 });
    await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers });
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBe(1);
    const res = await t.app.inject({
      method: "PATCH",
      url: `${api}/admin/users/${user._id}`,
      headers: admin.headers,
      payload: { measurementDay: 2 },
    });
    expect(res.statusCode).toBe(200);
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBe(0);
  });

  it("replacing the program drops the cached reports it fed plannedSessions into", async () => {
    const admin = await asAdmin(t);
    const { user, headers } = await asUser(t);
    const templates = JSON.parse((await t.app.inject({ method: "GET", url: `${api}/admin/program-templates`, headers: admin.headers })).body);
    await t.app.inject({
      method: "POST",
      url: `${api}/admin/users/${user._id}/assign-program`,
      headers: admin.headers,
      payload: { templateId: templates.templates[0].id },
    });
    await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers });
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBe(1);

    const put = await t.app.inject({
      method: "PUT",
      url: `${api}/program`,
      headers,
      payload: { days: [{ order: 1, title: "Dinlenme", kind: "rest", exercises: [] }] },
    });
    expect(put.statusCode).toBe(200);
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBe(0);
  });

  it("changing the global goal settings drops every cached report", async () => {
    const admin = await asAdmin(t);
    const { user, headers } = await asUser(t);
    await t.app.inject({ method: "GET", url: `${api}/reports/weekly`, headers });
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBe(1);

    const settings = JSON.parse((await t.app.inject({ method: "GET", url: `${api}/admin/settings`, headers: admin.headers })).body);
    settings.goal.kcalPerKgFat = 7000;
    const put = await t.app.inject({ method: "PUT", url: `${api}/admin/settings`, headers: admin.headers, payload: settings });
    expect(put.statusCode).toBe(200);
    expect(await WeeklyReportCache.countDocuments({})).toBe(0);
  });
});

describe("review · goal targets", () => {
  it("after a re-plan the home screen uses the new plan's week-1 target", async () => {
    const { user, headers } = await asUser(t);
    await seedBodyEntry(user);
    await t.app.inject({ method: "POST", url: `${api}/goals`, headers, payload: { targetBodyFatPct: 7 } });

    t.clock.now = new Date("2026-10-01T09:00:00.000Z"); // 21 days later
    await t.app.inject({ method: "PATCH", url: `${api}/goals/current`, headers, payload: { profile: "conservative" } });

    const view = JSON.parse((await t.app.inject({ method: "GET", url: `${api}/goals/current`, headers })).body);
    expect(view.goal.plan.startKey).toBe("2026-10-01");
    expect(view.progress.currentWeek.weekIndex).toBe(view.progress.weekIndexInPlan);
    expect(view.progress.currentWeek.weekIndex).toBe(1);

    const home = JSON.parse((await t.app.inject({ method: "GET", url: `${api}/reports/home`, headers })).body);
    expect(home.today.calories.target).toBe(view.goal.plan.roadmap[0].dailyCalorieTarget);
  });
});

/* ------------------------------ query hygiene ------------------------------ */

describe("review · queries", () => {
  it("bodyEntries is indexed on the (userId, dateKey) range every report scans", async () => {
    await BodyEntry.syncIndexes();
    const keys = (await mongoose.connection.db!.collection("bodyentries").indexes()).map((i) => JSON.stringify(i.key));
    expect(keys).toContain(JSON.stringify({ userId: 1, dateKey: 1 }));
  });

  it("GET /body/entries is bounded even without ?limit", async () => {
    const { user, headers } = await asUser(t);
    await BodyEntry.insertMany(
      Array.from({ length: 12 }, (_, i) => ({
        userId: user._id,
        date: new Date(`${shiftKey("2026-08-01", i)}T09:00:00.000Z`),
        dateKey: shiftKey("2026-08-01", i),
        gender: "male",
        heightCm: 186,
        neckCm: 40,
        waistCm: 80,
        weightKg: 100,
        bodyFatPct: 10,
        fatMassKg: 10,
        leanMassKg: 90,
      }))
    );
    const res = await t.app.inject({ method: "GET", url: `${api}/body/entries`, headers });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).entries).toHaveLength(12);
    const limited = await t.app.inject({ method: "GET", url: `${api}/body/entries?limit=3`, headers });
    expect(JSON.parse(limited.body).entries).toHaveLength(3);
  });

  it("food search rejects an unbounded query string", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url: `${api}/nutrition/foods/search?q=${"a".repeat(5000)}`, headers });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("VALIDATION");
  });

  it("invalid object ids are 400/404, never a 500", async () => {
    const { headers } = await asUser(t);
    const admin = await asAdmin(t);
    const probes: Array<[string, string, string, object | undefined]> = [
      ["GET", `${api}/workouts/nope`, "user", undefined],
      ["PATCH", `${api}/body/entries/nope`, "user", { weightKg: 90 }],
      ["DELETE", `${api}/body/weighins/nope`, "user", undefined],
      ["PATCH", `${api}/nutrition/entries/nope`, "user", { grams: 10 }],
      ["GET", `${api}/nutrition/foods/nope`, "user", undefined],
      ["GET", `${api}/admin/users/nope`, "admin", undefined],
      ["GET", `${api}/admin/exercises/nope`, "admin", undefined],
      ["GET", `${api}/admin/program-templates/nope`, "admin", undefined],
      ["DELETE", `${api}/admin/foods/nope`, "admin", undefined],
    ];
    for (const [method, url, who, payload] of probes) {
      const res = await t.app.inject({
        method: method as "GET",
        url,
        headers: who === "admin" ? admin.headers : headers,
        payload: payload as never,
      });
      expect(`${url} → ${res.statusCode}`).toBe(`${url} → 404`);
    }
    const cursor = await t.app.inject({ method: "GET", url: `${api}/workouts?before=nope`, headers });
    expect(cursor.statusCode).toBe(400);
  });
});
