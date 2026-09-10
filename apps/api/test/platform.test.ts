import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { DEFAULT_SETTINGS } from "@fitfloow/core";
import { asAdmin, asUser, createTestApp, createUser, seedBasics, type TestApp } from "./harness";
import { User } from "../src/models/user";
import { Program, ProgramTemplate } from "../src/models/program";
import { WorkoutLog } from "../src/models/workoutLog";
import { BodyEntry, WeighIn } from "../src/models/body";
import { Goal, WeeklyReportCache } from "../src/models/goal";
import { DietTarget, MealEntry, Scan } from "../src/models/nutrition";
import { Settings } from "../src/models/settings";

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
});

const API = "/api/v1";

describe("catalog (user facing)", () => {
  it("requires auth", async () => {
    const res = await t.app.inject({ method: "GET", url: `${API}/muscles` });
    expect(res.statusCode).toBe(401);
  });

  it("GET /muscles returns active muscles in order", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url: `${API}/muscles`, headers });
    expect(res.statusCode).toBe(200);
    const muscles = res.json().muscles as Array<{ key: string; order: number; active: boolean }>;
    expect(muscles).toHaveLength(7);
    expect(muscles.every((m) => m.active)).toBe(true);
    expect(muscles.map((m) => m.order)).toEqual([...muscles.map((m) => m.order)].sort((a, b) => a - b));
    expect(muscles[0].key).toBe("chest");
  });

  it("GET /exercises filters by q and returns only active ones", async () => {
    const { headers } = await asUser(t);
    const all = await t.app.inject({ method: "GET", url: `${API}/exercises`, headers });
    expect(all.json().exercises.length).toBe(20);

    const q = await t.app.inject({ method: "GET", url: `${API}/exercises?q=push`, headers });
    const names = (q.json().exercises as Array<{ name: string }>).map((e) => e.name);
    expect(names).toContain("Push-up");
    expect(names).toContain("Pike Push-up");
    expect(names).not.toContain("Squat");
  });
});

describe("admin users", () => {
  it("rejects non-admins with FORBIDDEN", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url: `${API}/admin/users`, headers });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("lists users with hasProgram and goalStatus, filtered by q", async () => {
    const { headers, user: admin } = await asAdmin(t, { username: "eren" });
    const inci = await createUser({ username: "inci", gender: "female" });
    await Program.create({ userId: inci._id, name: "P", days: [], currentIndex: 0 });
    await Goal.create({ userId: inci._id, status: "active", targetBodyFatPct: 15, profile: "optimal", start: {}, plan: {} });

    const res = await t.app.inject({ method: "GET", url: `${API}/admin/users`, headers });
    expect(res.statusCode).toBe(200);
    const users = res.json().users as Array<{ id: string; username: string; hasProgram: boolean; goalStatus: string | null }>;
    expect(users).toHaveLength(2);
    const byName = Object.fromEntries(users.map((u) => [u.username, u]));
    expect(byName.inci).toMatchObject({ hasProgram: true, goalStatus: "active" });
    expect(byName.eren).toMatchObject({ hasProgram: false, goalStatus: null });
    expect(byName.eren.id).toBe(String(admin._id));
    expect((byName.eren as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();

    const filtered = await t.app.inject({ method: "GET", url: `${API}/admin/users?q=inc`, headers });
    expect(filtered.json().users).toHaveLength(1);
  });

  it("prefers the active goal over a newer abandoned one", async () => {
    const { headers } = await asAdmin(t);
    const u = await createUser({ username: "hedefli" });
    const active = await Goal.create({
      userId: u._id, status: "active", targetBodyFatPct: 14, profile: "optimal", start: {}, plan: {},
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    await Goal.create({
      userId: u._id, status: "abandoned", targetBodyFatPct: 20, profile: "optimal", start: {}, plan: {},
      createdAt: new Date("2026-06-01T00:00:00Z"),
    });

    const list = await t.app.inject({ method: "GET", url: `${API}/admin/users?q=hedefli`, headers });
    expect(list.json().users[0].goalStatus).toBe("active");

    const overview = await t.app.inject({ method: "GET", url: `${API}/admin/users/${u._id}/overview`, headers });
    expect(overview.json().goal.id).toBe(String(active._id));
  });

  it("falls back to the most recent goal when none is active", async () => {
    const { headers } = await asAdmin(t);
    const u = await createUser({ username: "eskihedef" });
    await Goal.create({ userId: u._id, status: "abandoned", targetBodyFatPct: 20, profile: "optimal", start: {}, plan: {} });
    const latest = await Goal.create({ userId: u._id, status: "completed", targetBodyFatPct: 15, profile: "optimal", start: {}, plan: {} });
    await Goal.updateOne({ _id: latest._id }, { $set: { createdAt: new Date("2027-01-01T00:00:00Z") } });

    const list = await t.app.inject({ method: "GET", url: `${API}/admin/users?q=eskihedef`, headers });
    expect(list.json().users[0].goalStatus).toBe("completed");
    const overview = await t.app.inject({ method: "GET", url: `${API}/admin/users/${u._id}/overview`, headers });
    expect(overview.json().goal.id).toBe(String(latest._id));
  });

  it("creates a user that can log in, and rejects a duplicate username with CONFLICT", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({
      method: "POST",
      url: `${API}/admin/users`,
      headers,
      payload: { username: "Yeni", displayName: "Yeni Kullanıcı", password: "Asd*123", gender: "female", heightCm: 165 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({ username: "yeni", role: "user", gender: "female", heightCm: 165 });

    const login = await t.app.inject({ method: "POST", url: `${API}/auth/login`, payload: { username: "yeni", password: "Asd*123" } });
    expect(login.statusCode).toBe(200);

    const dup = await t.app.inject({
      method: "POST",
      url: `${API}/admin/users`,
      headers,
      payload: { username: "yeni", displayName: "Kopya", password: "Asd*123" },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("CONFLICT");
  });

  it("survives a double-submit: one create wins, the other gets CONFLICT", async () => {
    const { headers } = await asAdmin(t);
    await User.init(); // make sure the unique index is live before racing
    const payload = { username: "cift", displayName: "Çift Tık", password: "Asd*123" };
    const [a, b] = await Promise.all([
      t.app.inject({ method: "POST", url: `${API}/admin/users`, headers, payload }),
      t.app.inject({ method: "POST", url: `${API}/admin/users`, headers, payload }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    expect(await User.countDocuments({ username: "cift" })).toBe(1);
  });

  it("gets, patches (incl. password) and 404s unknown users", async () => {
    const { headers } = await asAdmin(t);
    const u = await createUser({ username: "hedef", password: "Asd*123" });

    const get = await t.app.inject({ method: "GET", url: `${API}/admin/users/${u._id}`, headers });
    expect(get.statusCode).toBe(200);
    expect(get.json().user).toMatchObject({ username: "hedef", hasProgram: false, goalStatus: null });

    const patch = await t.app.inject({
      method: "PATCH",
      url: `${API}/admin/users/${u._id}`,
      headers,
      payload: { displayName: "Hedef 2", measurementDay: 3, password: "Yeni*123" },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().user).toMatchObject({ displayName: "Hedef 2", measurementDay: 3 });
    const login = await t.app.inject({ method: "POST", url: `${API}/auth/login`, payload: { username: "hedef", password: "Yeni*123" } });
    expect(login.statusCode).toBe(200);

    const missing = await t.app.inject({ method: "GET", url: `${API}/admin/users/${new Types.ObjectId()}`, headers });
    expect(missing.statusCode).toBe(404);
    const bad = await t.app.inject({ method: "GET", url: `${API}/admin/users/not-an-id`, headers });
    expect(bad.statusCode).toBe(404);
  });

  it("PATCH only touches the fields that were sent", async () => {
    const { headers } = await asAdmin(t);
    const u = await createUser({ username: "kismi", role: "admin", gender: "female", measurementDay: 4, activityLevel: "active" });
    const res = await t.app.inject({ method: "PATCH", url: `${API}/admin/users/${u._id}`, headers, payload: { displayName: "Sadece isim" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({
      displayName: "Sadece isim",
      role: "admin",
      gender: "female",
      measurementDay: 4,
      activityLevel: "active",
      heightCm: 178,
    });
  });

  it("rejects a username collision on PATCH", async () => {
    const { headers } = await asAdmin(t);
    await createUser({ username: "alinmis" });
    const u = await createUser({ username: "digeri" });
    const res = await t.app.inject({ method: "PATCH", url: `${API}/admin/users/${u._id}`, headers, payload: { username: "alinmis" } });
    expect(res.statusCode).toBe(409);
  });

  it("deletes a user and cascades all of their data", async () => {
    const { headers } = await asAdmin(t);
    const u = await createUser({ username: "silinecek" });
    const other = await createUser({ username: "kalacak" });
    const uid = u._id;
    await Program.create({ userId: uid, name: "P", days: [], currentIndex: 0 });
    await Program.create({ userId: other._id, name: "P2", days: [], currentIndex: 0 });
    await WorkoutLog.create({ userId: uid, dateKey: "2026-09-10", title: "x" });
    await BodyEntry.create({
      userId: uid, dateKey: "2026-09-10", gender: "male", heightCm: 178, neckCm: 38, waistCm: 84, weightKg: 80,
      bodyFatPct: 18, fatMassKg: 14.4, leanMassKg: 65.6,
    });
    await WeighIn.create({ userId: uid, dateKey: "2026-09-10", weightKg: 80 });
    await Goal.create({ userId: uid, status: "active", targetBodyFatPct: 15, profile: "optimal", start: {}, plan: {} });
    await WeeklyReportCache.create({ userId: uid, weekKey: "2026-09-06", report: {} });
    await MealEntry.create({
      userId: uid, dateKey: "2026-09-10", meal: "lunch", name: "Pilav", grams: 200,
      per100g: { kcal: 130, protein: 3, carbs: 28, fat: 0.3 }, totals: { kcal: 260, protein: 6, carbs: 56, fat: 0.6 },
    });
    await DietTarget.create({ userId: uid, mode: "manual", calories: 2000, protein: 150, carbs: 200, fat: 65 });
    await Scan.create({ userId: uid, detections: [] });

    const res = await t.app.inject({ method: "DELETE", url: `${API}/admin/users/${uid}`, headers });
    expect(res.statusCode).toBe(204);

    expect(await User.countDocuments({ _id: uid })).toBe(0);
    expect(await Program.countDocuments({ userId: uid })).toBe(0);
    expect(await WorkoutLog.countDocuments({ userId: uid })).toBe(0);
    expect(await BodyEntry.countDocuments({ userId: uid })).toBe(0);
    expect(await WeighIn.countDocuments({ userId: uid })).toBe(0);
    expect(await Goal.countDocuments({ userId: uid })).toBe(0);
    expect(await WeeklyReportCache.countDocuments({ userId: uid })).toBe(0);
    expect(await MealEntry.countDocuments({ userId: uid })).toBe(0);
    expect(await DietTarget.countDocuments({ userId: uid })).toBe(0);
    expect(await Scan.countDocuments({ userId: uid })).toBe(0);
    // untouched neighbour
    expect(await Program.countDocuments({ userId: other._id })).toBe(1);
  });

  it("refuses to delete the acting admin", async () => {
    const { headers, user } = await asAdmin(t);
    const res = await t.app.inject({ method: "DELETE", url: `${API}/admin/users/${user._id}`, headers });
    expect(res.statusCode).toBe(403);
    expect(await User.countDocuments({ _id: user._id })).toBe(1);
  });

  it("resets a password", async () => {
    const { headers } = await asAdmin(t);
    const u = await createUser({ username: "unuttu", password: "Asd*123" });
    const res = await t.app.inject({ method: "POST", url: `${API}/admin/users/${u._id}/reset-password`, headers, payload: { password: "Sifre*456" } });
    expect(res.statusCode).toBe(204);
    const login = await t.app.inject({ method: "POST", url: `${API}/auth/login`, payload: { username: "unuttu", password: "Sifre*456" } });
    expect(login.statusCode).toBe(200);
  });

  it("assigns a program template to a user (create then replace)", async () => {
    const { headers } = await asAdmin(t);
    const u = await createUser({ username: "atanan" });
    const templates = await ProgramTemplate.find().sort({ name: 1 }).lean();
    const eren = templates.find((x) => x.days.length === 7)!;
    const inci = templates.find((x) => x.days.length === 4)!;

    const res = await t.app.inject({ method: "POST", url: `${API}/admin/users/${u._id}/assign-program`, headers, payload: { templateId: String(eren._id) } });
    expect(res.statusCode).toBe(200);
    const program = res.json().program;
    expect(program.days).toHaveLength(7);
    expect(program.currentIndex).toBe(0);
    expect(program.weekNumber).toBe(1);
    expect(program.sourceTemplateId).toBe(String(eren._id));

    const again = await t.app.inject({ method: "POST", url: `${API}/admin/users/${u._id}/assign-program`, headers, payload: { templateId: String(inci._id) } });
    expect(again.statusCode).toBe(200);
    expect(again.json().program.days).toHaveLength(4);
    expect(await Program.countDocuments({ userId: u._id })).toBe(1);

    const missing = await t.app.inject({ method: "POST", url: `${API}/admin/users/${u._id}/assign-program`, headers, payload: { templateId: String(new Types.ObjectId()) } });
    expect(missing.statusCode).toBe(404);
  });

  it("returns a full overview composite", async () => {
    const { headers } = await asAdmin(t);
    const u = await createUser({ username: "genel" });
    await Program.create({ userId: u._id, name: "P", days: [], currentIndex: 0 });
    await BodyEntry.create({
      userId: u._id, date: new Date("2026-09-09T07:00:00Z"), dateKey: "2026-09-09", gender: "male", heightCm: 178,
      neckCm: 38, waistCm: 84, weightKg: 80, bodyFatPct: 18, fatMassKg: 14.4, leanMassKg: 65.6,
    });
    await BodyEntry.create({
      userId: u._id, date: new Date("2026-09-01T07:00:00Z"), dateKey: "2026-09-01", gender: "male", heightCm: 178,
      neckCm: 39, waistCm: 86, weightKg: 82, bodyFatPct: 19, fatMassKg: 15.6, leanMassKg: 66.4,
    });
    await Goal.create({ userId: u._id, status: "active", targetBodyFatPct: 12, profile: "optimal", start: {}, plan: {} });
    for (let i = 0; i < 7; i++) {
      await WorkoutLog.create({ userId: u._id, date: new Date(Date.UTC(2026, 8, 3 + i, 9)), dateKey: `2026-09-0${3 + i}`, title: `G${i}` });
    }

    const res = await t.app.inject({ method: "GET", url: `${API}/admin/users/${u._id}/overview`, headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({ username: "genel", hasProgram: true, goalStatus: "active" });
    expect(body.program.name).toBe("P");
    expect(body.latestBody.dateKey).toBe("2026-09-09");
    expect(body.goal.targetBodyFatPct).toBe(12);
    expect(body.lastWorkouts).toHaveLength(5);
    expect(body.lastWorkouts[0].dateKey).toBe("2026-09-09");
    // B3 has not shipped reports.service yet → null, never a crash
    expect(body).toHaveProperty("weekReport");
  });
});

describe("admin settings", () => {
  it("returns defaults and persists a full replace", async () => {
    const { headers } = await asAdmin(t);
    const get = await t.app.inject({ method: "GET", url: `${API}/admin/settings`, headers });
    expect(get.statusCode).toBe(200);
    expect(get.json().goal.kcalPerKgFat).toBe(7700);
    expect(get.json().recovery).toMatchObject({ small: 48, large: 24 });

    const next = { ...DEFAULT_SETTINGS, recovery: { small: 60, large: 30 }, mascot: { name: "Floo" } };
    const put = await t.app.inject({ method: "PUT", url: `${API}/admin/settings`, headers, payload: next });
    expect(put.statusCode).toBe(200);
    expect(put.json().recovery).toMatchObject({ small: 60, large: 30 });

    const again = await t.app.inject({ method: "GET", url: `${API}/admin/settings`, headers });
    expect(again.json().recovery.small).toBe(60);
    expect(await Settings.countDocuments()).toBe(1);
  });

  it("rejects a rate table with gaps via validateRateTable", async () => {
    const { headers } = await asAdmin(t);
    const broken = {
      ...DEFAULT_SETTINGS,
      goal: {
        ...DEFAULT_SETTINGS.goal,
        rateTable: DEFAULT_SETTINGS.goal.rateTable.filter((b) => !(b.sex === "male" && b.bfMin === 12)),
      },
    };
    const res = await t.app.inject({ method: "PUT", url: `${API}/admin/settings`, headers, payload: broken });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
    expect(String(JSON.stringify(res.json().error.details))).toContain("male");
  });

  it("rejects a malformed payload", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({ method: "PUT", url: `${API}/admin/settings`, headers, payload: { recovery: { small: 1 } } });
    expect(res.statusCode).toBe(400);
  });

  it("is admin-only", async () => {
    const { headers } = await asUser(t);
    expect((await t.app.inject({ method: "GET", url: `${API}/admin/settings`, headers })).statusCode).toBe(403);
  });
});
