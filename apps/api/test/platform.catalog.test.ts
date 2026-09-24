import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { asAdmin, asUser, createTestApp, seedBasics, type TestApp } from "./harness";
import { Muscle } from "../src/models/muscle";
import { Exercise } from "../src/models/exercise";
import { SEED_EXERCISES } from "../src/seed/data/index";
import { EXERCISE_ACTIVATION_V1 } from "../src/seed/data/exerciseActivation.v1";
import { zExerciseActivationReference } from "@fitfloow/core";

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
  key: "serratus",
  name: "Serratus",
  short: "Serratus",
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
    expect(muscles).toHaveLength(18);
    expect(muscles.filter((m) => !m.active)).not.toHaveLength(0);
    expect(muscles.map((m) => m.order)).toEqual([...muscles.map((m) => m.order)].sort((a, b) => a - b));
  });

  it("creates a muscle, auto-assigns order and rejects a duplicate key", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({ method: "POST", url: `${API}/admin/muscles`, headers, payload: newMuscle });
    expect(res.statusCode).toBe(201);
    expect(res.json().muscle).toMatchObject({ key: "serratus", name: "Serratus", order: 18 });

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

    // Since the activation catalog, no exercise uses the retired v1 catch-all `legs` any more.
    const unused = await t.app.inject({ method: "DELETE", url: `${API}/admin/muscles/legs`, headers });
    expect(unused.statusCode).toBe(204);
    expect(await Muscle.countDocuments({ key: "legs" })).toBe(0);
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
    expect(all.json().exercises).toHaveLength(SEED_EXERCISES.length);

    const q = await t.app.inject({ method: "GET", url: `${API}/admin/exercises?q=pistol`, headers });
    expect((q.json().exercises as Array<{ name: string }>).map((e) => e.name)).toEqual(["Pistol Squat"]);
    const squats = await t.app.inject({ method: "GET", url: `${API}/admin/exercises?q=squat`, headers });
    expect((squats.json().exercises as Array<{ name: string }>).map((e) => e.name)).toEqual(
      expect.arrayContaining(["Barbell Back Squat", "Bulgarian Split Squat", "Pistol Squat", "Squat"])
    );

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
      payload: { name: "Band Pull-Apart", muscles: [{ key: "rearDelt", load: 0.85 }, { key: "traps", load: 0.35 }], defaultSets: 3, defaultReps: 15 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().exercise).toMatchObject({ name: "Band Pull-Apart", metric: "reps", kind: "strength", active: true });
    expect(res.json().exercise.muscles).toEqual([
      { key: "rearDelt", load: 0.85 },
      { key: "traps", load: 0.35 },
    ]);

    const dup = await t.app.inject({
      method: "POST",
      url: `${API}/admin/exercises`,
      headers,
      payload: { name: "band pull-apart", muscles: [], defaultSets: 3, defaultReps: 10 },
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

  it("returns the literature reference of a seeded exercise, by slug even after a rename", async () => {
    const { headers } = await asAdmin(t);
    const doc = await Exercise.findOne({ nameKey: "barbell bench press" }).lean();
    const row = EXERCISE_ACTIVATION_V1.find((r) => r.slug === "barbell-bench-press")!;

    const res = await t.app.inject({ method: "GET", url: `${API}/admin/exercises/${doc!._id}`, headers });
    expect(res.statusCode).toBe(200);
    const { exercise, reference } = res.json();
    expect(exercise.name).toBe("Barbell Bench Press");
    expect(() => zExerciseActivationReference.parse(reference)).not.toThrow();
    expect(reference).toMatchObject({ version: "v1", slug: "barbell-bench-press", name: "Barbell Bench Press" });
    expect(reference.muscles).toEqual(row.muscles); // load, confidence {level, n, spread}, source ids
    const cited = [...new Set(row.muscles.flatMap((m) => m.sources))].sort();
    expect((reference.sources as Array<{ id: string }>).map((x) => x.id).sort()).toEqual(cited);
    for (const src of reference.sources) expect(src).toMatchObject({ title: expect.any(String), url: expect.stringMatching(/^https?:\/\//) });

    // Renamed by an admin (who cannot touch the slug): the reference follows the slug.
    const patch = await t.app.inject({
      method: "PATCH",
      url: `${API}/admin/exercises/${doc!._id}`,
      headers,
      payload: { name: "Bench Press", slug: "hacked" },
    });
    expect(patch.statusCode).toBe(200);
    const again = (await t.app.inject({ method: "GET", url: `${API}/admin/exercises/${doc!._id}`, headers })).json();
    expect(again.exercise.name).toBe("Bench Press");
    expect(again.reference.slug).toBe("barbell-bench-press");
    expect((await Exercise.findById(doc!._id).lean())!.slug).toBe("barbell-bench-press");
  });

  it("has no reference for an exercise an admin made up", async () => {
    const { headers } = await asAdmin(t);
    const created = await t.app.inject({
      method: "POST",
      url: `${API}/admin/exercises`,
      headers,
      payload: { name: "Kendi Hareketim", muscles: [{ key: "chest", load: 0.5 }], defaultSets: 3, defaultReps: 10 },
    });
    const res = await t.app.inject({ method: "GET", url: `${API}/admin/exercises/${created.json().exercise.id}`, headers });
    expect(res.json().reference).toBeNull();
  });

  it("accepts loads on the 0.05 grid for any of the 17 keys; rejects repeated keys and loads outside 0–1", async () => {
    const { headers } = await asAdmin(t);
    const doc = await Exercise.findOne({ nameKey: "push-up" }).lean();
    const url = `${API}/admin/exercises/${doc!._id}`;
    const muscles = [
      { key: "chest", load: 0.35 },
      { key: "triceps", load: 0.05 },
      { key: "obliques", load: 1 },
      { key: "adductors", load: 0.95 },
    ];
    const ok = await t.app.inject({ method: "PATCH", url, headers, payload: { muscles } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().exercise.muscles).toEqual(muscles);
    expect((await Exercise.findById(doc!._id).lean())!.muscles.map((m) => ({ key: m.key, load: m.load }))).toEqual(muscles);

    const repeated = await t.app.inject({ method: "PATCH", url, headers, payload: { muscles: [{ key: "chest", load: 0.5 }, { key: "chest", load: 0.4 }] } });
    expect(repeated.statusCode).toBe(400);
    expect(repeated.json().error.code).toBe("VALIDATION");
    expect(JSON.stringify(repeated.json().error.details)).toContain("chest");
    const created = await t.app.inject({
      method: "POST",
      url: `${API}/admin/exercises`,
      headers,
      payload: { name: "Tekrarlı", muscles: [{ key: "lats", load: 1 }, { key: "lats", load: 0.5 }], defaultSets: 3, defaultReps: 10 },
    });
    expect(created.statusCode).toBe(400);

    for (const load of [1.05, -0.05]) {
      const bad = await t.app.inject({ method: "PATCH", url, headers, payload: { muscles: [{ key: "chest", load }] } });
      expect(bad.statusCode, String(load)).toBe(400);
    }
    expect((await Exercise.findById(doc!._id).lean())!.muscles.map((m) => ({ key: m.key, load: m.load }))).toEqual(muscles);
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
