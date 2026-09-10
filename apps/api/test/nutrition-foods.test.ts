import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Food } from "../src/models/nutrition";
import { seedFoods } from "../src/modules/nutrition/seed/index";
import { asUser, createTestApp, seedBasics, type TestApp } from "./harness";

const OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl";
const OFF_PRODUCT = "https://world.openfoodfacts.org/api/v2/product/";

type FakeReply = { status?: number; body: unknown };
const EMPTY_SEARCH: FakeReply = { body: { count: 0, products: [] } };
const NO_PRODUCT: FakeReply = { status: 404, body: { status: 0 } };

/**
 * `FakeHttpClient` has no reset, so each upstream is registered once with an indirection the tests
 * swap per case (routes are matched first-registered-wins).
 */
let offSearchReply: FakeReply = EMPTY_SEARCH;
let offProductReply: FakeReply = NO_PRODUCT;

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
  t.http.on(OFF_SEARCH, () => offSearchReply);
  t.http.on(OFF_PRODUCT, () => offProductReply);
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.reset();
  await seedBasics();
  await seedFoods();
  offSearchReply = EMPTY_SEARCH;
  offProductReply = NO_PRODUCT;
  t.http.calls.length = 0;
  t.clock.now = new Date("2026-09-10T09:00:00.000Z");
});

const nutella = {
  code: "3017624010701",
  product_name: "Nutella",
  brands: "Ferrero",
  serving_size: "15 g",
  nutriments: {
    "energy-kcal_100g": 539,
    proteins_100g: 6.3,
    carbohydrates_100g: 57.5,
    fat_100g: 30.9,
  },
};

describe("seedFoods", () => {
  it("inserts the curated catalogue once and is idempotent", async () => {
    const count = await Food.countDocuments({ source: "seed" });
    expect(count).toBeGreaterThan(390);
    const again = await seedFoods();
    expect(again).toEqual({ inserted: 0, skipped: true });
    expect(await Food.countDocuments({ source: "seed" })).toBe(count);
  });

  it("sets searchKey so Turkish folding works in the database", async () => {
    const doc = await Food.findOne({ name: "Mercimek çorbası" }).lean();
    expect(doc?.searchKey).toBe("mercimek corbasi");
    expect(doc?.verified).toBe(true);
  });
});

describe("GET /nutrition/foods/search", () => {
  const search = async (headers: Record<string, string>, qs: string) =>
    t.app.inject({ method: "GET", url: `/api/v1/nutrition/foods/search?${qs}`, headers });

  it("requires auth", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/v1/nutrition/foods/search?q=pilav" });
    expect(res.statusCode).toBe(401);
  });

  it("ranks the exact match first", async () => {
    const { headers } = await asUser(t);
    const res = await search(headers, "q=pilav");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.foods[0].name).toBe("Pilav");
    expect(body.remote).toEqual([]);
  });

  it("folds Turkish casing and diacritics", async () => {
    const { headers } = await asUser(t);
    for (const q of ["MERCİMEK", "mercimek", "Mercimek Çorbası", "mercimek corbasi"]) {
      const body = (await search(headers, `q=${encodeURIComponent(q)}`)).json();
      expect(body.foods.map((f: { name: string }) => f.name), q).toContain("Mercimek çorbası");
    }
  });

  it("matches a raw vision label through aliases", async () => {
    const { headers } = await asUser(t);
    const body = (await search(headers, "q=mercimek_corbasi")).json();
    expect(body.foods[0].name).toBe("Mercimek çorbası");
  });

  it("honours the limit and caps it at 30", async () => {
    const { headers } = await asUser(t);
    expect((await search(headers, "q=e&limit=5")).json().foods).toHaveLength(5);
    expect((await search(headers, "q=e&limit=99")).statusCode).toBe(400);
  });

  it("returns popular foods for an empty query", async () => {
    const { headers } = await asUser(t);
    const body = (await search(headers, "q=")).json();
    expect(body.foods.length).toBeGreaterThan(0);
  });

  it("returns nothing for an unmatched query", async () => {
    const { headers } = await asUser(t);
    expect((await search(headers, "q=zzzqqq")).json().foods).toEqual([]);
  });

  it("hides another user's private food", async () => {
    const a = await asUser(t);
    const b = await asUser(t);
    await t.app.inject({
      method: "POST",
      url: "/api/v1/nutrition/foods",
      headers: a.headers,
      payload: { name: "Annemin keki", per100g: { kcal: 300, protein: 5, carbs: 40, fat: 14 } },
    });
    expect((await search(a.headers, "q=annemin")).json().foods).toHaveLength(1);
    expect((await search(b.headers, "q=annemin")).json().foods).toHaveLength(0);
  });

  it("adds Open Food Facts results and caches them when remote=1", async () => {
    offSearchReply = { body: { count: 1, products: [nutella] } };
    const { headers } = await asUser(t);
    const body = (await search(headers, "q=nutella&remote=1")).json();
    expect(body.remote).toHaveLength(1);
    expect(body.remote[0]).toMatchObject({
      name: "Nutella (Ferrero)",
      brand: "Ferrero",
      source: "off",
      barcode: "3017624010701",
      defaultServingG: 15,
      per100g: { kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9 },
    });
    expect(await Food.countDocuments({ source: "off" })).toBe(1);
    expect(t.http.calls[0].req.headers?.["User-Agent"]).toContain("FitFloow");
  });

  it("swallows an Open Food Facts outage and still returns local results", async () => {
    offSearchReply = { status: 503, body: "<html>Page temporarily unavailable</html>" };
    const { headers } = await asUser(t);
    const body = (await search(headers, "q=pilav&remote=1")).json();
    expect(body.foods.length).toBeGreaterThan(0);
    expect(body.remote).toEqual([]);
  });

  it("does not call Open Food Facts unless remote=1", async () => {
    const { headers } = await asUser(t);
    await search(headers, "q=pilav");
    expect(t.http.calls).toHaveLength(0);
  });
});

describe("GET /nutrition/foods/:id", () => {
  it("returns a catalogue food", async () => {
    const { headers } = await asUser(t);
    const food = await Food.findOne({ name: "Pilav" }).lean();
    const res = await t.app.inject({ method: "GET", url: `/api/v1/nutrition/foods/${food!._id}`, headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().food).toMatchObject({ name: "Pilav", source: "seed", verified: true });
  });

  it("404s for an unknown or malformed id", async () => {
    const { headers } = await asUser(t);
    expect((await t.app.inject({ method: "GET", url: "/api/v1/nutrition/foods/nope", headers })).statusCode).toBe(404);
    expect(
      (await t.app.inject({ method: "GET", url: "/api/v1/nutrition/foods/64b7f0c2a1b2c3d4e5f60718", headers })).statusCode
    ).toBe(404);
  });

  it("404s on someone else's private food", async () => {
    const a = await asUser(t);
    const b = await asUser(t);
    const created = await t.app.inject({
      method: "POST",
      url: "/api/v1/nutrition/foods",
      headers: a.headers,
      payload: { name: "Gizli tarif", per100g: { kcal: 200, protein: 10, carbs: 20, fat: 8 } },
    });
    const id = created.json().food.id;
    expect((await t.app.inject({ method: "GET", url: `/api/v1/nutrition/foods/${id}`, headers: a.headers })).statusCode).toBe(200);
    expect((await t.app.inject({ method: "GET", url: `/api/v1/nutrition/foods/${id}`, headers: b.headers })).statusCode).toBe(404);
  });
});

describe("POST /nutrition/foods", () => {
  it("creates a private food with defaults filled in", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/nutrition/foods",
      headers,
      payload: { name: "Protein topu", per100g: { kcal: 420, protein: 22, carbs: 40, fat: 18 }, defaultServingG: 40 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().food).toMatchObject({ name: "Protein topu", source: "user", verified: false, defaultServingG: 40, popularity: 0 });
  });

  it("rejects an invalid payload", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/nutrition/foods",
      headers,
      payload: { name: "", per100g: { kcal: 5000, protein: 1, carbs: 1, fat: 1 } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });
});

describe("GET /nutrition/foods/barcode/:code", () => {
  it("returns a locally cached barcode without calling upstream", async () => {
    const { headers } = await asUser(t);
    await Food.create({
      name: "Yerli bar",
      searchKey: "yerli bar",
      per100g: { kcal: 400, protein: 20, carbs: 40, fat: 15 },
      barcode: "8690000000001",
      source: "admin",
    });
    const res = await t.app.inject({ method: "GET", url: "/api/v1/nutrition/foods/barcode/8690000000001", headers });
    expect(res.json().food).toMatchObject({ name: "Yerli bar", barcode: "8690000000001" });
    expect(t.http.calls).toHaveLength(0);
  });

  it("falls back to Open Food Facts and caches the product", async () => {
    offProductReply = { body: { status: 1, product: nutella } };
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url: "/api/v1/nutrition/foods/barcode/3017624010701", headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().food).toMatchObject({ name: "Nutella (Ferrero)", source: "off", barcode: "3017624010701" });

    // second call is served locally
    const before = t.http.calls.length;
    const again = await t.app.inject({ method: "GET", url: "/api/v1/nutrition/foods/barcode/3017624010701", headers });
    expect(again.json().food.id).toBe(res.json().food.id);
    expect(t.http.calls).toHaveLength(before);
    expect(await Food.countDocuments({ barcode: "3017624010701" })).toBe(1);
  });

  it("returns null when the barcode is unknown everywhere", async () => {
    offProductReply = NO_PRODUCT;
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url: "/api/v1/nutrition/foods/barcode/1111111111111", headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().food).toBeNull();
  });
});

describe("GET /nutrition/recent", () => {
  it("lists the last distinct foods logged, most recent first", async () => {
    const { headers } = await asUser(t);
    const pilav = await Food.findOne({ name: "Pilav" }).lean();
    const yogurt = await Food.findOne({ name: "Yoğurt (tam yağlı)" }).lean();

    const log = async (foodId: string) =>
      t.app.inject({ method: "POST", url: "/api/v1/nutrition/entries", headers, payload: { meal: "lunch", foodId, grams: 100 } });

    t.clock.now = new Date("2026-09-10T08:00:00.000Z");
    await log(String(pilav!._id));
    t.clock.now = new Date("2026-09-10T09:00:00.000Z");
    await log(String(yogurt!._id));
    t.clock.now = new Date("2026-09-10T10:00:00.000Z");
    await log(String(pilav!._id));

    const res = await t.app.inject({ method: "GET", url: "/api/v1/nutrition/recent", headers });
    expect(res.json().foods.map((f: { name: string }) => f.name)).toEqual(["Pilav", "Yoğurt (tam yağlı)"]);
  });

  it("is empty for a fresh user", async () => {
    const { headers } = await asUser(t);
    expect((await t.app.inject({ method: "GET", url: "/api/v1/nutrition/recent", headers })).json().foods).toEqual([]);
  });
});
