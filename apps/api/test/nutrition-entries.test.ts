import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Food, MealEntry } from "../src/models/nutrition";
import { WeeklyReportCache } from "../src/models/goal";
import { seedFoods } from "../src/modules/nutrition/seed/index";
import { asUser, createTestApp, seedBasics, type TestApp, type TestUser } from "./harness";

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
  await seedFoods();
  t.clock.now = new Date("2026-09-10T09:00:00.000Z"); // Thursday 12:00 TR
});

const url = (p: string) => `/api/v1${p}`;

async function foodId(name: string): Promise<string> {
  const doc = await Food.findOne({ name }).lean();
  if (!doc) throw new Error(`seed food missing: ${name}`);
  return String(doc._id);
}

async function addEntry(headers: Record<string, string>, payload: Record<string, unknown>) {
  return t.app.inject({ method: "POST", url: url("/nutrition/entries"), headers, payload });
}

describe("POST /nutrition/entries", () => {
  it("logs a catalogue food, denormalizes it and returns the day totals", async () => {
    const { headers } = await asUser(t);
    const res = await addEntry(headers, { meal: "lunch", foodId: await foodId("Tavuk göğsü (ızgara)"), grams: 200 });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.entry).toMatchObject({
      name: "Tavuk göğsü (ızgara)",
      meal: "lunch",
      grams: 200,
      dateKey: "2026-09-10",
      source: "search",
      per100g: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
      totals: { kcal: 330, protein: 62, carbs: 0, fat: 7.2 },
    });
    expect(body.dayTotals).toEqual({ kcal: 330, protein: 62, carbs: 0, fat: 7.2 });
  });

  it("accumulates the day totals across entries and meals", async () => {
    const { headers } = await asUser(t);
    await addEntry(headers, { meal: "breakfast", foodId: await foodId("Yumurta (haşlanmış)"), grams: 100 });
    const res = await addEntry(headers, { meal: "lunch", foodId: await foodId("Beyaz pirinç (haşlanmış)"), grams: 200 });
    expect(res.json().dayTotals).toEqual({ kcal: 415, protein: 18.4, carbs: 57.1, fat: 11.6 });
  });

  it("logs a custom food without a catalogue entry", async () => {
    const { headers } = await asUser(t);
    const res = await addEntry(headers, {
      meal: "snack",
      custom: { name: "Teyzemin böreği", per100g: { kcal: 300, protein: 9, carbs: 30, fat: 16 } },
      grams: 150,
      source: "manual",
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().entry).toMatchObject({ name: "Teyzemin böreği", foodId: null, source: "manual", totals: { kcal: 450 } });
  });

  it("bumps the food's popularity", async () => {
    const { headers } = await asUser(t);
    const id = await foodId("Pilav");
    await addEntry(headers, { meal: "lunch", foodId: id, grams: 180 });
    await addEntry(headers, { meal: "dinner", foodId: id, grams: 180 });
    expect((await Food.findById(id).lean())?.popularity).toBe(2);
  });

  it("writes into the requested day", async () => {
    const { headers } = await asUser(t);
    const res = await addEntry(headers, { dateKey: "2026-09-08", meal: "dinner", foodId: await foodId("Pilav"), grams: 100 });
    expect(res.json().entry.dateKey).toBe("2026-09-08");
    expect(res.json().dayTotals.kcal).toBe(175);
  });

  it("rejects sending both foodId and custom, or neither", async () => {
    const { headers } = await asUser(t);
    const id = await foodId("Pilav");
    const both = await addEntry(headers, { meal: "lunch", foodId: id, custom: { name: "x", per100g: { kcal: 1, protein: 0, carbs: 0, fat: 0 } }, grams: 10 });
    expect(both.statusCode).toBe(400);
    const neither = await addEntry(headers, { meal: "lunch", grams: 10 });
    expect(neither.statusCode).toBe(400);
  });

  it("rejects a non-positive or absurd gram amount", async () => {
    const { headers } = await asUser(t);
    const id = await foodId("Pilav");
    expect((await addEntry(headers, { meal: "lunch", foodId: id, grams: 0 })).statusCode).toBe(400);
    expect((await addEntry(headers, { meal: "lunch", foodId: id, grams: 99999 })).statusCode).toBe(400);
  });

  it("404s for an unknown food", async () => {
    const { headers } = await asUser(t);
    expect((await addEntry(headers, { meal: "lunch", foodId: "64b7f0c2a1b2c3d4e5f60718", grams: 100 })).statusCode).toBe(404);
  });

  it("invalidates the weekly report cache of that week", async () => {
    const { user, headers } = await asUser(t, { measurementDay: 0 });
    await WeeklyReportCache.create({ userId: (user as TestUser)._id, weekKey: "2026-09-06", report: { stub: true } });
    await addEntry(headers, { meal: "lunch", foodId: await foodId("Pilav"), grams: 100 });
    expect(await WeeklyReportCache.countDocuments({ weekKey: "2026-09-06" })).toBe(0);
  });
});

describe("PATCH/DELETE /nutrition/entries/:id", () => {
  it("recomputes totals when grams change", async () => {
    const { headers } = await asUser(t);
    const created = await addEntry(headers, { meal: "lunch", foodId: await foodId("Tavuk göğsü (ızgara)"), grams: 100 });
    const id = created.json().entry.id;
    const res = await t.app.inject({ method: "PATCH", url: url(`/nutrition/entries/${id}`), headers, payload: { grams: 250 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().entry.totals).toEqual({ kcal: 413, protein: 77.5, carbs: 0, fat: 9 });
    expect(res.json().dayTotals.kcal).toBe(413);
  });

  it("moves an entry to another meal", async () => {
    const { headers } = await asUser(t);
    const created = await addEntry(headers, { meal: "lunch", foodId: await foodId("Pilav"), grams: 100 });
    const res = await t.app.inject({
      method: "PATCH",
      url: url(`/nutrition/entries/${created.json().entry.id}`),
      headers,
      payload: { meal: "dinner" },
    });
    expect(res.json().entry).toMatchObject({ meal: "dinner", grams: 100 });
  });

  it("refuses to touch another user's entry", async () => {
    const a = await asUser(t);
    const b = await asUser(t);
    const created = await addEntry(a.headers, { meal: "lunch", foodId: await foodId("Pilav"), grams: 100 });
    const id = created.json().entry.id;
    expect((await t.app.inject({ method: "PATCH", url: url(`/nutrition/entries/${id}`), headers: b.headers, payload: { grams: 10 } })).statusCode).toBe(404);
    expect((await t.app.inject({ method: "DELETE", url: url(`/nutrition/entries/${id}`), headers: b.headers })).statusCode).toBe(404);
  });

  it("deletes and clears the day", async () => {
    const { headers } = await asUser(t);
    const created = await addEntry(headers, { meal: "lunch", foodId: await foodId("Pilav"), grams: 100 });
    const res = await t.app.inject({ method: "DELETE", url: url(`/nutrition/entries/${created.json().entry.id}`), headers });
    expect(res.statusCode).toBe(204);
    expect(await MealEntry.countDocuments({})).toBe(0);
    const day = await t.app.inject({ method: "GET", url: url("/nutrition/day"), headers });
    expect(day.json().totals).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe("GET /nutrition/day", () => {
  it("groups entries per meal with per-meal and day totals and remaining", async () => {
    const { headers } = await asUser(t);
    await addEntry(headers, { meal: "breakfast", foodId: await foodId("Yumurta (haşlanmış)"), grams: 100 });
    await addEntry(headers, { meal: "lunch", foodId: await foodId("Pilav"), grams: 200 });
    await addEntry(headers, { meal: "lunch", foodId: await foodId("Tavuk göğsü (ızgara)"), grams: 150 });

    const res = await t.app.inject({ method: "GET", url: url("/nutrition/day"), headers });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dateKey).toBe("2026-09-10");
    expect(body.meals.breakfast).toHaveLength(1);
    expect(body.meals.lunch).toHaveLength(2);
    expect(body.meals.dinner).toEqual([]);
    expect(body.mealTotals.breakfast).toEqual({ kcal: 155, protein: 13, carbs: 1.1, fat: 11 });
    expect(body.mealTotals.lunch.kcal).toBe(598);
    expect(body.totals.kcal).toBe(753);
    expect(body.remaining.kcal).toBe(body.target.calories - 753);
    expect(body.target).toMatchObject({ mode: "auto", derivedFrom: "default" });
  });

  it("returns an empty but well-formed day", async () => {
    const { headers } = await asUser(t);
    const body = (await t.app.inject({ method: "GET", url: url("/nutrition/day?date=2026-01-01"), headers })).json();
    expect(body.dateKey).toBe("2026-01-01");
    expect(body.totals).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
    expect(body.meals).toEqual({ breakfast: [], lunch: [], dinner: [], snack: [] });
    expect(body.remaining.kcal).toBe(body.target.calories);
  });

  it("falls back to today for a malformed date", async () => {
    const { headers } = await asUser(t);
    const body = (await t.app.inject({ method: "GET", url: url("/nutrition/day?date=nope"), headers })).json();
    expect(body.dateKey).toBe("2026-09-10");
  });

  it("uses the Türkiye day boundary", async () => {
    const { headers } = await asUser(t);
    t.clock.now = new Date("2026-09-10T21:30:00.000Z"); // 00:30 TR on the 11th
    const body = (await t.app.inject({ method: "GET", url: url("/nutrition/day"), headers })).json();
    expect(body.dateKey).toBe("2026-09-11");
  });
});

describe("GET /nutrition/week", () => {
  it("starts the week on the user's measurement day", async () => {
    const sunday = await asUser(t, { measurementDay: 0 });
    const wednesday = await asUser(t, { measurementDay: 3 });
    const a = (await t.app.inject({ method: "GET", url: url("/nutrition/week"), headers: sunday.headers })).json();
    const b = (await t.app.inject({ method: "GET", url: url("/nutrition/week"), headers: wednesday.headers })).json();
    expect(a.weekKey).toBe("2026-09-06");
    expect(b.weekKey).toBe("2026-09-09");
    expect(a.days).toHaveLength(7);
    expect(a.days[0].dateKey).toBe("2026-09-06");
    expect(a.days[6].dateKey).toBe("2026-09-12");
  });

  it("fills unlogged days with zeros and reports daysLogged", async () => {
    const { headers } = await asUser(t, { measurementDay: 0 });
    await addEntry(headers, { dateKey: "2026-09-07", meal: "lunch", foodId: await foodId("Pilav"), grams: 200 });
    const body = (await t.app.inject({ method: "GET", url: url("/nutrition/week"), headers })).json();
    expect(body.daysLogged).toBe(1);
    expect(body.days[1]).toMatchObject({ dateKey: "2026-09-07", logged: true, totals: { kcal: 350 } });
    expect(body.days[0]).toMatchObject({ logged: false, totals: { kcal: 0 } });
    expect(body.avg.kcal).toBe(350); // averaged over logged days only
  });

  it("scores adherence as the share of logged days within ±10 % of the target", async () => {
    const { headers } = await asUser(t, { measurementDay: 0 });
    await t.app.inject({
      method: "PUT",
      url: url("/nutrition/target"),
      headers,
      payload: { mode: "manual", calories: 1000, protein: 100, carbs: 100, fat: 30 },
    });
    // 500 kcal / 100 g, so grams read straight as kcal/5: 1000 ✓, 1050 ✓, 2000 ✗, 400 ✗
    const custom = { name: "Gün", per100g: { kcal: 500, protein: 0, carbs: 0, fat: 0 } };
    await addEntry(headers, { dateKey: "2026-09-07", meal: "lunch", custom, grams: 200 });
    await addEntry(headers, { dateKey: "2026-09-08", meal: "lunch", custom, grams: 210 });
    await addEntry(headers, { dateKey: "2026-09-09", meal: "lunch", custom, grams: 400 });
    await addEntry(headers, { dateKey: "2026-09-10", meal: "lunch", custom, grams: 80 });

    const body = (await t.app.inject({ method: "GET", url: url("/nutrition/week"), headers })).json();
    expect(body.daysLogged).toBe(4);
    expect(body.adherence).toBe(0.5);
    expect(body.days.every((d: { target: number }) => d.target === 1000)).toBe(true);
  });

  it("accepts an explicit week and only counts that week's entries", async () => {
    const { headers } = await asUser(t, { measurementDay: 0 });
    await addEntry(headers, { dateKey: "2026-09-02", meal: "lunch", foodId: await foodId("Pilav"), grams: 100 });
    await addEntry(headers, { dateKey: "2026-09-10", meal: "lunch", foodId: await foodId("Pilav"), grams: 100 });
    const prev = (await t.app.inject({ method: "GET", url: url("/nutrition/week?week=2026-09-02"), headers })).json();
    expect(prev.weekKey).toBe("2026-08-30");
    expect(prev.daysLogged).toBe(1);
    expect(prev.days.find((d: { dateKey: string }) => d.dateKey === "2026-09-02").totals.kcal).toBe(175);
  });

  it("returns an all-zero week with adherence 0 when nothing is logged", async () => {
    const { headers } = await asUser(t);
    const body = (await t.app.inject({ method: "GET", url: url("/nutrition/week"), headers })).json();
    expect(body.daysLogged).toBe(0);
    expect(body.adherence).toBe(0);
    expect(body.avg).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
});
