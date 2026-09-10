import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { asAdmin, asUser, createTestApp, seedBasics, type TestApp } from "./harness";
import { ProgramTemplate } from "../src/models/program";

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

const input = {
  name: "Test Şablonu",
  description: "İki günlük döngü",
  tags: ["test"],
  days: [
    {
      order: 9,
      title: "Gün A",
      kind: "strength",
      exercises: [
        { name: "Push-up", muscles: [{ key: "chest", load: 1 }, { key: "frontDelt", load: 0.5 }], targetSets: 4, targetReps: 12 },
      ],
    },
    {
      order: 3,
      title: "Gün B",
      kind: "strength",
      exercises: [{ name: "Squat", muscles: [{ key: "legs", load: 1 }], targetSets: 5, targetReps: 10, targetRIR: 2, metric: "reps" }],
    },
  ],
};

describe("admin program templates", () => {
  it("is admin-only", async () => {
    const { headers } = await asUser(t);
    expect((await t.app.inject({ method: "GET", url: `${API}/admin/program-templates`, headers })).statusCode).toBe(403);
  });

  it("lists seeded templates with cycleLength and computed weeklyVolume", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({ method: "GET", url: `${API}/admin/program-templates`, headers });
    expect(res.statusCode).toBe(200);
    const templates = res.json().templates as Array<{ name: string; cycleLength: number; weeklyVolume: Record<string, number> }>;
    expect(templates).toHaveLength(2);
    const eren = templates.find((x) => x.cycleLength === 7)!;
    expect(eren.weeklyVolume).toEqual({ chest: 17, frontDelt: 9, traps: 9, sideDelt: 6, lats: 10, abs: 6, legs: 14 });
    const inci = templates.find((x) => x.cycleLength === 4)!;
    expect(inci.weeklyVolume).toEqual({ legs: 5, frontDelt: 5, sideDelt: 5, traps: 5, abs: 5 });
  });

  it("creates a template, normalizes day orders to 1..N and fills exercise defaults", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({ method: "POST", url: `${API}/admin/program-templates`, headers, payload: input });
    expect(res.statusCode).toBe(201);
    const template = res.json().template;
    expect(template.days.map((d: { order: number; title: string }) => [d.order, d.title])).toEqual([
      [1, "Gün A"],
      [2, "Gün B"],
    ]);
    expect(template.cycleLength).toBe(2);
    expect(template.weeklyVolume).toEqual({ chest: 4, frontDelt: 2, legs: 5 });
    expect(template.days[0].exercises[0]).toMatchObject({ metric: "reps", targetRIR: null });
    expect(template.days[0].run).toBeNull();
    expect(await ProgramTemplate.countDocuments()).toBe(3);
  });

  it("validates the day list", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({ method: "POST", url: `${API}/admin/program-templates`, headers, payload: { ...input, days: [] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });

  it("gets one by id and 404s unknown ids", async () => {
    const { headers } = await asAdmin(t);
    const doc = await ProgramTemplate.findOne().lean();
    const res = await t.app.inject({ method: "GET", url: `${API}/admin/program-templates/${doc!._id}`, headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().template.id).toBe(String(doc!._id));
    expect(res.json().template.weeklyVolume).toBeTypeOf("object");

    expect((await t.app.inject({ method: "GET", url: `${API}/admin/program-templates/${new Types.ObjectId()}`, headers })).statusCode).toBe(404);
    expect((await t.app.inject({ method: "GET", url: `${API}/admin/program-templates/bozuk`, headers })).statusCode).toBe(404);
  });

  it("replaces days wholesale on PATCH and recomputes the volume", async () => {
    const { headers } = await asAdmin(t);
    const created = (await t.app.inject({ method: "POST", url: `${API}/admin/program-templates`, headers, payload: input })).json().template;
    const res = await t.app.inject({
      method: "PATCH",
      url: `${API}/admin/program-templates/${created.id}`,
      headers,
      payload: {
        name: "Güncel",
        days: [{ order: 1, title: "Tek Gün", kind: "strength", exercises: [{ name: "Pull-up", muscles: [{ key: "lats", load: 1 }], targetSets: 6, targetReps: 8 }] }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().template).toMatchObject({ name: "Güncel", cycleLength: 1 });
    expect(res.json().template.weeklyVolume).toEqual({ lats: 6 });
    expect(res.json().template.description).toBe("İki günlük döngü");
  });

  it("duplicates a template with a fresh id", async () => {
    const { headers } = await asAdmin(t);
    const source = await ProgramTemplate.findOne({ name: /Eren/ }).lean();
    const res = await t.app.inject({ method: "POST", url: `${API}/admin/program-templates/${source!._id}/duplicate`, headers });
    expect(res.statusCode).toBe(201);
    const copy = res.json().template;
    expect(copy.id).not.toBe(String(source!._id));
    expect(copy.name).toBe(`${source!.name} (kopya)`);
    expect(copy.days).toHaveLength(7);
    expect(await ProgramTemplate.countDocuments()).toBe(3);
  });

  it("deletes a template", async () => {
    const { headers } = await asAdmin(t);
    const doc = await ProgramTemplate.findOne().lean();
    const res = await t.app.inject({ method: "DELETE", url: `${API}/admin/program-templates/${doc!._id}`, headers });
    expect(res.statusCode).toBe(204);
    expect(await ProgramTemplate.countDocuments()).toBe(1);
    expect((await t.app.inject({ method: "DELETE", url: `${API}/admin/program-templates/${doc!._id}`, headers })).statusCode).toBe(404);
  });
});
