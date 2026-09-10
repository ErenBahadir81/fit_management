import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { navyBodyFat, zBodyEntry, zBodySummary, zBodyTrends, zWeighIn } from "@fitfloow/core";
import { asUser, createTestApp, seedBasics, type TestApp } from "./harness";
import { BodyEntry, WeighIn } from "../src/models/body";
import { WeeklyReportCache } from "../src/models/goal";
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
  t.clock.now = new Date("2026-09-10T09:00:00.000Z"); // Thursday, TR noon
});

const url = "/api/v1/body";
const measurement = { heightCm: 186, neckCm: 40, waistCm: 92, weightKg: 103 };

describe("POST /body/entries", () => {
  it("computes the Navy body fat and composition server side", async () => {
    const { headers } = await asUser(t, { gender: "male", heightCm: 186 });
    const res = await t.app.inject({ method: "POST", url: `${url}/entries`, headers, payload: measurement });
    expect(res.statusCode).toBe(200);
    const { entry } = res.json();
    const expectedBf = navyBodyFat({ gender: "male", ...measurement })!;
    expect(entry.bodyFatPct).toBeCloseTo(expectedBf, 5);
    expect(entry.fatMassKg).toBeCloseTo(Math.round((103 * expectedBf) / 100 * 10) / 10, 2);
    expect(entry.leanMassKg).toBeCloseTo(103 - entry.fatMassKg, 1);
    expect(entry.dateKey).toBe("2026-09-10");
    expect(entry.gender).toBe("male");
    expect(entry.id).toBeTypeOf("string");
  });

  it("upserts a weigh-in for that day tagged bodyEntry", async () => {
    const { headers, user } = await asUser(t);
    await t.app.inject({ method: "POST", url: `${url}/entries`, headers, payload: measurement });
    const w = await WeighIn.findOne({ userId: user._id, dateKey: "2026-09-10" }).lean();
    expect(w).toBeTruthy();
    expect(w!.weightKg).toBe(103);
    expect(w!.source).toBe("bodyEntry");
  });

  it("remembers gender and height on the profile", async () => {
    const { headers, user } = await asUser(t, { gender: "male", heightCm: null });
    await t.app.inject({ method: "POST", url: `${url}/entries`, headers, payload: { ...measurement, gender: "female", hipCm: 100 } });
    const fresh = await User.findById(user._id).lean();
    expect(fresh!.gender).toBe("female");
    expect(fresh!.heightCm).toBe(186);
  });

  it("rejects a measurement the Navy formula cannot use", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "POST", url: `${url}/entries`, headers, payload: { ...measurement, neckCm: 60, waistCm: 55 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });

  it("requires the hip measurement for women", async () => {
    const { headers } = await asUser(t, { gender: "female" });
    const res = await t.app.inject({ method: "POST", url: `${url}/entries`, headers, payload: measurement });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
    expect(res.json().error.message).toContain("kalça");
  });

  it("validates the input shape", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "POST", url: `${url}/entries`, headers, payload: { heightCm: 186 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });

  it("requires auth", async () => {
    const res = await t.app.inject({ method: "POST", url: `${url}/entries`, payload: measurement });
    expect(res.statusCode).toBe(401);
  });

  it("accepts an explicit date and keys it in Türkiye time", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({
      method: "POST",
      url: `${url}/entries`,
      headers,
      payload: { ...measurement, date: "2026-09-06T22:30:00.000Z" }, // 01:30 TR on the 7th
    });
    expect(res.json().entry.dateKey).toBe("2026-09-07");
  });

  it("drops the cached weekly report for that week", async () => {
    const { headers, user } = await asUser(t);
    await WeeklyReportCache.create({ userId: user._id, weekKey: "2026-09-06", report: { score: 1 } });
    await t.app.inject({ method: "POST", url: `${url}/entries`, headers, payload: measurement });
    expect(await WeeklyReportCache.countDocuments({ userId: user._id })).toBe(0);
  });
});

describe("GET /body/entries", () => {
  it("returns entries ascending with the profile", async () => {
    const { headers, user } = await asUser(t, { gender: "male", heightCm: 186 });
    await BodyEntry.insertMany(
      ["2026-09-01", "2026-09-05", "2026-09-08"].map((dateKey, i) => ({
        userId: user._id,
        date: new Date(`${dateKey}T09:00:00.000Z`),
        dateKey,
        gender: "male",
        heightCm: 186,
        neckCm: 40,
        waistCm: 95 - i,
        hipCm: null,
        weightKg: 104 - i,
        bodyFatPct: 20 - i,
        fatMassKg: 20,
        leanMassKg: 84,
        notes: null,
      }))
    );
    const res = await t.app.inject({ method: "GET", url: `${url}/entries`, headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entries.map((e: { dateKey: string }) => e.dateKey)).toEqual(["2026-09-01", "2026-09-05", "2026-09-08"]);
    expect(body.profile).toEqual({ gender: "male", heightCm: 186 });
  });

  it("honours limit by keeping the newest entries", async () => {
    const { headers, user } = await asUser(t);
    await BodyEntry.insertMany(
      ["2026-09-01", "2026-09-05", "2026-09-08"].map((dateKey) => ({
        userId: user._id,
        date: new Date(`${dateKey}T09:00:00.000Z`),
        dateKey,
        gender: "male",
        heightCm: 186,
        neckCm: 40,
        waistCm: 95,
        weightKg: 104,
        bodyFatPct: 20,
        fatMassKg: 20,
        leanMassKg: 84,
      }))
    );
    const res = await t.app.inject({ method: "GET", url: `${url}/entries?limit=2`, headers });
    expect(res.json().entries.map((e: { dateKey: string }) => e.dateKey)).toEqual(["2026-09-05", "2026-09-08"]);
  });

  it("does not leak another user's entries", async () => {
    const a = await asUser(t);
    const b = await asUser(t);
    await t.app.inject({ method: "POST", url: `${url}/entries`, headers: a.headers, payload: measurement });
    const res = await t.app.inject({ method: "GET", url: `${url}/entries`, headers: b.headers });
    expect(res.json().entries).toHaveLength(0);
  });
});

describe("PATCH/DELETE /body/entries/:id", () => {
  it("recomputes body fat and the linked weigh-in", async () => {
    const { headers, user } = await asUser(t);
    const created = await t.app.inject({ method: "POST", url: `${url}/entries`, headers, payload: measurement });
    const id = created.json().entry.id;
    const res = await t.app.inject({ method: "PATCH", url: `${url}/entries/${id}`, headers, payload: { waistCm: 88, weightKg: 101 } });
    expect(res.statusCode).toBe(200);
    const entry = res.json().entry;
    expect(entry.waistCm).toBe(88);
    expect(entry.bodyFatPct).toBeCloseTo(navyBodyFat({ gender: "male", heightCm: 186, neckCm: 40, waistCm: 88 })!, 5);
    const w = await WeighIn.findOne({ userId: user._id, dateKey: "2026-09-10" }).lean();
    expect(w!.weightKg).toBe(101);
  });

  it("404s on someone else's entry", async () => {
    const a = await asUser(t);
    const b = await asUser(t);
    const created = await t.app.inject({ method: "POST", url: `${url}/entries`, headers: a.headers, payload: measurement });
    const id = created.json().entry.id;
    expect((await t.app.inject({ method: "PATCH", url: `${url}/entries/${id}`, headers: b.headers, payload: { weightKg: 90 } })).statusCode).toBe(404);
    expect((await t.app.inject({ method: "DELETE", url: `${url}/entries/${id}`, headers: b.headers })).statusCode).toBe(404);
  });

  it("removes the auto weigh-in on delete", async () => {
    const { headers, user } = await asUser(t);
    const created = await t.app.inject({ method: "POST", url: `${url}/entries`, headers, payload: measurement });
    const res = await t.app.inject({ method: "DELETE", url: `${url}/entries/${created.json().entry.id}`, headers });
    expect(res.statusCode).toBe(204);
    expect(await BodyEntry.countDocuments({ userId: user._id })).toBe(0);
    expect(await WeighIn.countDocuments({ userId: user._id })).toBe(0);
  });

  it("keeps a manual weigh-in on the same day", async () => {
    const { headers, user } = await asUser(t);
    const created = await t.app.inject({ method: "POST", url: `${url}/entries`, headers, payload: measurement });
    await WeighIn.updateOne({ userId: user._id, dateKey: "2026-09-10" }, { $set: { source: "manual", weightKg: 102 } });
    await t.app.inject({ method: "DELETE", url: `${url}/entries/${created.json().entry.id}`, headers });
    const w = await WeighIn.findOne({ userId: user._id, dateKey: "2026-09-10" }).lean();
    expect(w!.weightKg).toBe(102);
  });
});

describe("weigh-ins", () => {
  it("upserts one weigh-in per day", async () => {
    const { headers, user } = await asUser(t);
    const a = await t.app.inject({ method: "POST", url: `${url}/weighins`, headers, payload: { weightKg: 101.4 } });
    expect(a.statusCode).toBe(200);
    expect(a.json().weighIn).toMatchObject({ dateKey: "2026-09-10", weightKg: 101.4, source: "manual" });
    const b = await t.app.inject({ method: "POST", url: `${url}/weighins`, headers, payload: { weightKg: 101.9 } });
    expect(b.json().weighIn.weightKg).toBe(101.9);
    expect(await WeighIn.countDocuments({ userId: user._id })).toBe(1);
  });

  it("accepts an explicit dateKey and lists ascending within the window", async () => {
    const { headers } = await asUser(t);
    for (const [dateKey, weightKg] of [
      ["2026-09-08", 102],
      ["2026-09-09", 101.5],
      ["2026-05-01", 110],
    ] as const) {
      await t.app.inject({ method: "POST", url: `${url}/weighins`, headers, payload: { weightKg, dateKey } });
    }
    const res = await t.app.inject({ method: "GET", url: `${url}/weighins?days=30`, headers });
    expect(res.json().weighIns.map((w: { dateKey: string }) => w.dateKey)).toEqual(["2026-09-08", "2026-09-09"]);
  });

  it("rejects an invalid dateKey", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "POST", url: `${url}/weighins`, headers, payload: { weightKg: 100, dateKey: "10-09-2026" } });
    expect(res.statusCode).toBe(400);
  });

  it("deletes a weigh-in", async () => {
    const { headers, user } = await asUser(t);
    const created = await t.app.inject({ method: "POST", url: `${url}/weighins`, headers, payload: { weightKg: 100 } });
    const res = await t.app.inject({ method: "DELETE", url: `${url}/weighins/${created.json().weighIn.id}`, headers });
    expect(res.statusCode).toBe(204);
    expect(await WeighIn.countDocuments({ userId: user._id })).toBe(0);
  });
});

describe("GET /body/trends", () => {
  it("merges weigh-ins with measurements and smooths the weight", async () => {
    const { headers } = await asUser(t);
    for (let i = 0; i < 10; i++) {
      await t.app.inject({
        method: "POST",
        url: `${url}/weighins`,
        headers,
        payload: { weightKg: 103 - i * 0.1, dateKey: `2026-09-${String(1 + i).padStart(2, "0")}` },
      });
    }
    await t.app.inject({ method: "POST", url: `${url}/entries`, headers, payload: { ...measurement, date: "2026-09-05T09:00:00.000Z" } });

    const res = await t.app.inject({ method: "GET", url: `${url}/trends?days=30`, headers });
    expect(res.statusCode).toBe(200);
    const { points, summary } = res.json();
    expect(points.length).toBe(10);
    expect(points[0].dateKey).toBe("2026-09-01");
    expect(points[0].weightEwma).toBeCloseTo(103, 2);
    const withBf = points.find((p: { bodyFatPct: number | null }) => p.bodyFatPct !== null);
    expect(withBf.dateKey).toBe("2026-09-05");
    expect(withBf.waistCm).toBe(92);
    expect(withBf.leanMassKg).toBeGreaterThan(0);
    expect(summary.ewmaLatest).toBeLessThan(103);
    expect(summary.weightDelta7d).toBeLessThan(0);
  });

  it("returns an empty trend for a new user", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url: `${url}/trends`, headers });
    expect(res.json()).toMatchObject({
      points: [],
      summary: { weightDelta7d: null, weightDelta30d: null, bfDelta30d: null, waistDelta30d: null, ewmaLatest: null },
    });
  });
});

describe("GET /body/summary", () => {
  it("returns the latest measurement, the previous one and the deltas", async () => {
    const { headers } = await asUser(t, { gender: "male", heightCm: 186 });
    await t.app.inject({ method: "POST", url: `${url}/entries`, headers, payload: { ...measurement, date: "2026-09-01T09:00:00.000Z" } });
    await t.app.inject({
      method: "POST",
      url: `${url}/entries`,
      headers,
      payload: { ...measurement, waistCm: 89, weightKg: 101, date: "2026-09-09T09:00:00.000Z" },
    });
    const res = await t.app.inject({ method: "GET", url: `${url}/summary`, headers });
    expect(res.statusCode).toBe(200);
    const s = res.json();
    expect(s.latest.dateKey).toBe("2026-09-09");
    expect(s.prev.dateKey).toBe("2026-09-01");
    expect(s.deltas.weightKg).toBeCloseTo(-2, 5);
    expect(s.deltas.waistCm).toBeCloseTo(-3, 5);
    expect(s.deltas.bodyFatPct).toBeLessThan(0);
    expect(s.category).toBeTypeOf("string");
    expect(s.latestWeighIn.dateKey).toBe("2026-09-09");
    expect(s.ewmaWeightKg).toBeGreaterThan(0);
    expect(s.profile).toEqual({ gender: "male", heightCm: 186 });
  });

  it("is empty but well formed for a new user", async () => {
    const { headers } = await asUser(t, { gender: "female", heightCm: null });
    const res = await t.app.inject({ method: "GET", url: `${url}/summary`, headers });
    expect(res.json()).toMatchObject({
      latest: null,
      prev: null,
      latestWeighIn: null,
      ewmaWeightKg: null,
      category: null,
      profile: { gender: "female", heightCm: null },
    });
  });
});

describe("DTO contract", () => {
  it("every body response validates against the shared zod schemas", async () => {
    const { headers } = await asUser(t, { gender: "male", heightCm: 186 });
    const entry = await t.app.inject({ method: "POST", url: `${url}/entries`, headers, payload: measurement });
    expect(() => zBodyEntry.parse(entry.json().entry)).not.toThrow();
    const weighIn = await t.app.inject({ method: "POST", url: `${url}/weighins`, headers, payload: { weightKg: 102 } });
    expect(() => zWeighIn.parse(weighIn.json().weighIn)).not.toThrow();
    const trends = await t.app.inject({ method: "GET", url: `${url}/trends`, headers });
    expect(() => zBodyTrends.parse(trends.json())).not.toThrow();
    const summary = await t.app.inject({ method: "GET", url: `${url}/summary`, headers });
    expect(() => zBodySummary.parse(summary.json())).not.toThrow();
  });
});
