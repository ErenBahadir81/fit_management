import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { asAdmin, asUser, createTestApp, seedBasics, type TestApp } from "./harness";
import { Muscle } from "../src/models/muscle";
import { Exercise } from "../src/models/exercise";

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
const newMuscle = {
  key: "rearDelt",
  name: "Arka Omuz",
  short: "Arka Omuz",
  size: "small",
  fullRecoveryHours: 48,
  weeklyTarget: { min: 6, max: 12 },
  region: "back",
  color: "#123456",
  active: true,
};

describe("admin muscles", () => {
  it("is admin-only", async () => {
    const { headers } = await asUser(t);
    expect((await t.app.inject({ method: "GET", url: `${API}/admin/muscles`, headers })).statusCode).toBe(403);
  });

  it("lists every muscle (active and inactive) in order", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({ method: "GET", url: `${API}/admin/muscles`, headers });
    expect(res.statusCode).toBe(200);
    const muscles = res.json().muscles as Array<{ key: string; order: number; active: boolean }>;
    expect(muscles).toHaveLength(14);
    expect(muscles.filter((m) => !m.active)).not.toHaveLength(0);
    expect(muscles.map((m) => m.order)).toEqual([...muscles.map((m) => m.order)].sort((a, b) => a - b));
  });

  it("creates a muscle, auto-assigns order and rejects a duplicate key", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({ method: "POST", url: `${API}/admin/muscles`, headers, payload: newMuscle });
    expect(res.statusCode).toBe(201);
    expect(res.json().muscle).toMatchObject({ key: "rearDelt", name: "Arka Omuz", order: 14 });

    const dup = await t.app.inject({ method: "POST", url: `${API}/admin/muscles`, headers, payload: newMuscle });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("CONFLICT");
  });

  it("validates the input shape", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({ method: "POST", url: `${API}/admin/muscles`, headers, payload: { ...newMuscle, color: "mavi" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });

  it("patches a muscle but never its key", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({
      method: "PATCH",
      url: `${API}/admin/muscles/chest`,
      headers,
      payload: { key: "hacked", name: "Göğüs (yeni)", weeklyTarget: { min: 12, max: 22 }, active: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().muscle).toMatchObject({ key: "chest", name: "Göğüs (yeni)", active: false });
    expect(res.json().muscle.weeklyTarget).toEqual({ min: 12, max: 22 });
    expect(await Muscle.countDocuments({ key: "hacked" })).toBe(0);

    const missing = await t.app.inject({ method: "PATCH", url: `${API}/admin/muscles/yok`, headers, payload: { name: "x" } });
    expect(missing.statusCode).toBe(404);
  });

  it("refuses to delete a muscle referenced by an exercise, deletes an unused one", async () => {
    const { headers } = await asAdmin(t);
    const used = await t.app.inject({ method: "DELETE", url: `${API}/admin/muscles/chest`, headers });
    expect(used.statusCode).toBe(409);
    expect(used.json().error.message).toMatch(/pasif/i);
    expect(await Muscle.countDocuments({ key: "chest" })).toBe(1);

    const unused = await t.app.inject({ method: "DELETE", url: `${API}/admin/muscles/forearms`, headers });
    expect(unused.statusCode).toBe(204);
    expect(await Muscle.countDocuments({ key: "forearms" })).toBe(0);
  });

  it("reorders muscles by key list", async () => {
    const { headers } = await asAdmin(t);
    const before = (await Muscle.find().sort({ order: 1 }).lean()).map((m) => m.key);
    const reordered = [before[3], before[0], ...before.slice(1, 3), ...before.slice(4)];
    const res = await t.app.inject({ method: "PUT", url: `${API}/admin/muscles/order`, headers, payload: { keys: reordered } });
    expect(res.statusCode).toBe(200);
    expect((res.json().muscles as Array<{ key: string }>).map((m) => m.key)).toEqual(reordered);
    expect((await Muscle.find().sort({ order: 1 }).lean()).map((m) => m.key)).toEqual(reordered);
  });

  it("rejects an order payload that does not cover every key", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({ method: "PUT", url: `${API}/admin/muscles/order`, headers, payload: { keys: ["chest"] } });
    expect(res.statusCode).toBe(400);
  });
});

describe("admin exercises", () => {
  it("lists, filters by q and by muscle", async () => {
    const { headers } = await asAdmin(t);
    const all = await t.app.inject({ method: "GET", url: `${API}/admin/exercises`, headers });
    expect(all.json().exercises).toHaveLength(20);

    const q = await t.app.inject({ method: "GET", url: `${API}/admin/exercises?q=squat`, headers });
    expect((q.json().exercises as Array<{ name: string }>).map((e) => e.name).sort()).toEqual(["Pistol Squat", "Squat"]);

    const byMuscle = await t.app.inject({ method: "GET", url: `${API}/admin/exercises?muscle=abs`, headers });
    const names = (byMuscle.json().exercises as Array<{ name: string }>).map((e) => e.name);
    expect(names).toContain("Plank");
    expect(names).not.toContain("Squat");
  });

  it("creates an exercise and rejects a case-insensitive duplicate name", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({
      method: "POST",
      url: `${API}/admin/exercises`,
      headers,
      payload: { name: "Face Pull", muscles: [{ key: "traps", load: 0.5 }], defaultSets: 3, defaultReps: 15 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().exercise).toMatchObject({ name: "Face Pull", metric: "reps", kind: "strength", active: true });
    expect(res.json().exercise.muscles).toEqual([{ key: "traps", load: 0.5 }]);

    const dup = await t.app.inject({
      method: "POST",
      url: `${API}/admin/exercises`,
      headers,
      payload: { name: "face pull", muscles: [], defaultSets: 3, defaultReps: 10 },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("rejects unknown muscle keys", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({
      method: "POST",
      url: `${API}/admin/exercises`,
      headers,
      payload: { name: "Uydurma", muscles: [{ key: "kanat", load: 1 }], defaultSets: 3, defaultReps: 10 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
    expect(JSON.stringify(res.json().error.details)).toContain("kanat");
  });

  it("accepts inactive muscle keys", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({
      method: "POST",
      url: `${API}/admin/exercises`,
      headers,
      payload: { name: "Curl", muscles: [{ key: "biceps", load: 1 }], defaultSets: 3, defaultReps: 12 },
    });
    expect(res.statusCode).toBe(201);
  });

  it("gets, patches and deletes an exercise", async () => {
    const { headers } = await asAdmin(t);
    const doc = await Exercise.findOne({ nameKey: "squat" }).lean();
    const id = String(doc!._id);

    const get = await t.app.inject({ method: "GET", url: `${API}/admin/exercises/${id}`, headers });
    expect(get.json().exercise).toMatchObject({ id, name: "Squat" });

    const patch = await t.app.inject({
      method: "PATCH",
      url: `${API}/admin/exercises/${id}`,
      headers,
      payload: { name: "Back Squat", defaultSets: 5, active: false },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().exercise).toMatchObject({ name: "Back Squat", defaultSets: 5, active: false });
    expect((await Exercise.findById(id).lean())!.nameKey).toBe("back squat");

    const del = await t.app.inject({ method: "DELETE", url: `${API}/admin/exercises/${id}`, headers });
    expect(del.statusCode).toBe(204);
    expect(await Exercise.countDocuments({ _id: id })).toBe(0);

    const missing = await t.app.inject({ method: "GET", url: `${API}/admin/exercises/${new Types.ObjectId()}`, headers });
    expect(missing.statusCode).toBe(404);
  });

  it("keeps public /exercises free of inactive entries", async () => {
    const { headers: adminHeaders } = await asAdmin(t);
    const doc = await Exercise.findOne({ nameKey: "plank" }).lean();
    await t.app.inject({ method: "PATCH", url: `${API}/admin/exercises/${doc!._id}`, headers: adminHeaders, payload: { active: false } });
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url: `${API}/exercises`, headers });
    expect((res.json().exercises as Array<{ name: string }>).map((e) => e.name)).not.toContain("Plank");
  });
});
