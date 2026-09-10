import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { DEFAULT_MASCOT_MESSAGES, shiftKey, trDateKey } from "@fitfloow/core";
import { asAdmin, asUser, createTestApp, createUser, seedBasics, type TestApp } from "./harness";
import { MascotMessage } from "../src/models/mascot";
import { WorkoutLog } from "../src/models/workoutLog";
import { MealEntry, Scan } from "../src/models/nutrition";
import { Goal } from "../src/models/goal";
import { User } from "../src/models/user";

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

describe("admin mascot messages", () => {
  it("lists the seeded catalog", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({ method: "GET", url: `${API}/admin/mascot-messages`, headers });
    expect(res.statusCode).toBe(200);
    const messages = res.json().messages as Array<{ key: string; mood: string; variants: string[]; active: boolean }>;
    expect(messages).toHaveLength(DEFAULT_MASCOT_MESSAGES.length);
    expect(messages[0]).toMatchObject({ key: "home.morning", mood: "happy", active: true });
    expect(messages[0].variants.length).toBeGreaterThan(0);
  });

  it("is admin-only", async () => {
    const { headers } = await asUser(t);
    expect((await t.app.inject({ method: "GET", url: `${API}/admin/mascot-messages`, headers })).statusCode).toBe(403);
  });

  it("rejects keys outside MASCOT_KEYS and duplicates", async () => {
    const { headers } = await asAdmin(t);
    await MascotMessage.deleteOne({ key: "home.morning" });

    const bad = await t.app.inject({
      method: "POST",
      url: `${API}/admin/mascot-messages`,
      headers,
      payload: { key: "home.uydurma", mood: "happy", variants: ["Selam"] },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("VALIDATION");

    const ok = await t.app.inject({
      method: "POST",
      url: `${API}/admin/mascot-messages`,
      headers,
      payload: { key: "home.morning", mood: "cheer", variants: ["Günaydın!"] },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().message).toMatchObject({ key: "home.morning", mood: "cheer", active: true });

    const dup = await t.app.inject({
      method: "POST",
      url: `${API}/admin/mascot-messages`,
      headers,
      payload: { key: "home.morning", mood: "happy", variants: ["Tekrar"] },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("patches and deletes a message", async () => {
    const { headers } = await asAdmin(t);
    const doc = await MascotMessage.findOne({ key: "home.morning" }).lean();
    const patch = await t.app.inject({
      method: "PATCH",
      url: `${API}/admin/mascot-messages/${doc!._id}`,
      headers,
      payload: { variants: ["Tek cümle"], mood: "flex", active: false },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().message).toMatchObject({ key: "home.morning", mood: "flex", active: false });
    expect(patch.json().message.variants).toEqual(["Tek cümle"]);

    const del = await t.app.inject({ method: "DELETE", url: `${API}/admin/mascot-messages/${doc!._id}`, headers });
    expect(del.statusCode).toBe(204);
    expect(await MascotMessage.countDocuments({ key: "home.morning" })).toBe(0);
    expect((await t.app.inject({ method: "DELETE", url: `${API}/admin/mascot-messages/${new Types.ObjectId()}`, headers })).statusCode).toBe(404);
  });

  it("resets the catalog back to the core defaults", async () => {
    const { headers } = await asAdmin(t);
    await MascotMessage.deleteMany({ key: { $ne: "home.morning" } });
    await MascotMessage.updateOne({ key: "home.morning" }, { $set: { variants: ["bozuk"], mood: "worried" } });

    const res = await t.app.inject({ method: "POST", url: `${API}/admin/mascot-messages/reset`, headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().messages).toHaveLength(DEFAULT_MASCOT_MESSAGES.length);
    expect(await MascotMessage.countDocuments()).toBe(DEFAULT_MASCOT_MESSAGES.length);
    const restored = await MascotMessage.findOne({ key: "home.morning" }).lean();
    expect(restored!.mood).toBe("happy");
    expect(restored!.variants).toEqual(DEFAULT_MASCOT_MESSAGES[0].variants);
  });
});

describe("admin dashboard", () => {
  it("counts users, activity and a 14-day series", async () => {
    const { headers, user: admin } = await asAdmin(t);
    const u = await createUser({ username: "aktif" });
    const today = trDateKey(t.clock.now);
    const yesterday = shiftKey(today, -1);
    const old = shiftKey(today, -20);

    await User.updateOne({ _id: u._id }, { $set: { lastSeenAt: t.clock.now } });
    await User.updateOne({ _id: admin._id }, { $set: { lastSeenAt: new Date("2026-01-01T00:00:00Z") } });

    await WorkoutLog.create({ userId: u._id, dateKey: today, date: t.clock.now, title: "A" });
    await WorkoutLog.create({ userId: u._id, dateKey: yesterday, date: new Date(t.clock.now.getTime() - 86400000), title: "B" });
    await WorkoutLog.create({ userId: u._id, dateKey: old, date: new Date(t.clock.now.getTime() - 20 * 86400000), title: "Eski" });

    const per100g = { kcal: 100, protein: 5, carbs: 10, fat: 2 };
    const totals = { kcal: 100, protein: 5, carbs: 10, fat: 2 };
    await MealEntry.create({ userId: u._id, dateKey: today, meal: "lunch", name: "Yemek", grams: 100, per100g, totals });
    await MealEntry.create({ userId: u._id, dateKey: yesterday, meal: "dinner", name: "Yemek", grams: 100, per100g, totals });

    await Scan.collection.insertOne({ userId: u._id, detections: [], createdAt: t.clock.now, updatedAt: t.clock.now });
    await Scan.collection.insertOne({
      userId: u._id,
      detections: [],
      createdAt: new Date(t.clock.now.getTime() - 30 * 86400000),
      updatedAt: t.clock.now,
    });

    await Goal.create({ userId: u._id, status: "active", targetBodyFatPct: 15, profile: "optimal", start: {}, plan: {} });
    await Goal.create({ userId: admin._id, status: "abandoned", targetBodyFatPct: 15, profile: "optimal", start: {}, plan: {} });

    const res = await t.app.inject({ method: "GET", url: `${API}/admin/dashboard`, headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ users: 2, activeUsers7d: 1, workouts7d: 2, meals7d: 2, scans7d: 1, goalsActive: 1 });
    expect(body.series).toHaveLength(14);
    expect(body.series[13].dateKey).toBe(today);
    expect(body.series[0].dateKey).toBe(shiftKey(today, -13));
    expect(body.series[13]).toMatchObject({ workouts: 1, meals: 1, scans: 1 });
    expect(body.series[12]).toMatchObject({ workouts: 1, meals: 1, scans: 0 });
    expect(body.series[0]).toMatchObject({ workouts: 0, meals: 0, scans: 0 });
  });

  it("is admin-only", async () => {
    const { headers } = await asUser(t);
    expect((await t.app.inject({ method: "GET", url: `${API}/admin/dashboard`, headers })).statusCode).toBe(403);
  });
});

describe("admin system health", () => {
  it("reports db, vision (mock in tests) and the api version", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({ method: "GET", url: `${API}/admin/system/health`, headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.db).toBe("ok");
    expect(body.vision).toMatchObject({ ok: true, mock: true, modelVersion: "mock" });
    expect(body.version).toBe("2.0.0");
    expect(typeof body.uptimeSec).toBe("number");
    expect(Number.isNaN(Date.parse(body.checkedAt))).toBe(false);
  });

  it("is admin-only", async () => {
    const { headers } = await asUser(t);
    expect((await t.app.inject({ method: "GET", url: `${API}/admin/system/health`, headers })).statusCode).toBe(403);
  });
});
