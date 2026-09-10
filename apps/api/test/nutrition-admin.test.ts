import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { Food } from "../src/models/nutrition";
import { seedFoods } from "../src/modules/nutrition/seed/index";
import { normalizeUsdaFood } from "../src/modules/nutrition/usda";
import { normalizeOffProduct, parseServingSize } from "../src/modules/nutrition/off";
import { asAdmin, asUser, createTestApp, seedBasics, type TestApp } from "./harness";

const OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl";
const USDA_SEARCH = "https://api.nal.usda.gov/fdc/v1/foods/search";

type FakeReply = { status?: number; body: unknown };
let offReply: FakeReply = { body: { products: [] } };
let usdaReply: FakeReply = { body: { foods: [] } };

let t: TestApp;
let uploadDir: string;
beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), "fitfloow-admin-"));
  t = await createTestApp({ UPLOAD_DIR: uploadDir });
  t.http.on(OFF_SEARCH, () => offReply);
  t.http.on(USDA_SEARCH, () => usdaReply);
});
afterAll(async () => {
  await t.close();
  await rm(uploadDir, { recursive: true, force: true });
});
beforeEach(async () => {
  await t.reset();
  await seedBasics();
  await seedFoods();
  offReply = { body: { products: [] } };
  usdaReply = { body: { foods: [] } };
  t.http.calls.length = 0;
  t.clock.now = new Date("2026-09-10T09:00:00.000Z");
});

const url = (p: string) => `/api/v1${p}`;

describe("upstream normalizers", () => {
  it("parses OFF serving sizes", () => {
    expect(parseServingSize("30 g")).toBe(30);
    expect(parseServingSize("1 portion (25 g)")).toBe(25);
    expect(parseServingSize("330ml")).toBe(330);
    expect(parseServingSize("a handful")).toBeNull();
    expect(parseServingSize(undefined)).toBeNull();
  });

  it("derives kcal from kJ when OFF omits energy-kcal", () => {
    const f = normalizeOffProduct({
      code: "123456789",
      product_name: "Test",
      nutriments: { "energy-kj_100g": 2227.9, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
    });
    expect(f?.per100g.kcal).toBe(532); // 2227.9 kJ / 4.184
  });

  it("drops OFF products without a name, a code or usable energy", () => {
    expect(normalizeOffProduct({ code: "1", nutriments: { "energy-kcal_100g": 100 } })).toBeNull();
    expect(normalizeOffProduct({ product_name: "X", nutriments: { "energy-kcal_100g": 100 } })).toBeNull();
    expect(normalizeOffProduct({ code: "1", product_name: "X", nutriments: {} })).toBeNull();
    expect(normalizeOffProduct({ code: "1", product_name: "X", nutriments: { "energy-kcal_100g": 5000 } })).toBeNull();
  });

  it("reads USDA nutrient ids in both the search and the bulk shape", () => {
    const search = normalizeUsdaFood({
      fdcId: 168957,
      description: "Pizza rolls, frozen, unprepared",
      foodNutrients: [
        { nutrientId: 1008, value: 328 },
        { nutrientId: 1003, value: 8.73 },
        { nutrientId: 1005, value: 50.7 },
        { nutrientId: 1004, value: 9.98 },
      ],
      foodPortions: [{ modifier: "serving", gramWeight: 34 }],
    });
    expect(search).toMatchObject({
      name: "Pizza rolls, frozen, unprepared",
      externalId: "usda:168957",
      source: "usda",
      defaultServingG: 34,
      per100g: { kcal: 328, protein: 8.73, carbs: 50.7, fat: 9.98 },
    });

    const bulk = normalizeUsdaFood({
      fdcId: 1,
      description: "Bulk shape",
      foodNutrients: [{ nutrient: { id: 1008 }, amount: 200 }, { nutrient: { id: 1003 }, amount: 10 }],
    });
    expect(bulk?.per100g).toMatchObject({ kcal: 200, protein: 10 });
    expect(bulk?.defaultServingG).toBe(100);
  });

  it("drops USDA rows without energy", () => {
    expect(normalizeUsdaFood({ fdcId: 2, description: "No energy", foodNutrients: [{ nutrientId: 1003, value: 5 }] })).toBeNull();
  });
});

describe("admin foods", () => {
  it("requires an admin", async () => {
    const user = await asUser(t);
    expect((await t.app.inject({ method: "GET", url: url("/admin/foods"), headers: user.headers })).statusCode).toBe(403);
    expect((await t.app.inject({ method: "GET", url: url("/admin/foods") })).statusCode).toBe(401);
  });

  it("lists foods with a total and filters by query and source", async () => {
    const { headers } = await asAdmin(t);
    const all = await t.app.inject({ method: "GET", url: url("/admin/foods?limit=5"), headers });
    expect(all.statusCode).toBe(200);
    expect(all.json().foods).toHaveLength(5);
    expect(all.json().total).toBeGreaterThan(390);

    const q = await t.app.inject({ method: "GET", url: url("/admin/foods?q=mercimek"), headers });
    expect(q.json().foods.map((f: { name: string }) => f.name)).toContain("Mercimek çorbası");

    const bySource = await t.app.inject({ method: "GET", url: url("/admin/foods?source=off"), headers });
    expect(bySource.json()).toEqual({ foods: [], total: 0 });
  });

  it("creates, updates and deletes a food", async () => {
    const { headers } = await asAdmin(t);
    const created = await t.app.inject({
      method: "POST",
      url: url("/admin/foods"),
      headers,
      payload: {
        name: "Yeni yemek",
        aliases: ["yeni_yemek"],
        category: "yemek",
        per100g: { kcal: 150, protein: 10, carbs: 12, fat: 6 },
        defaultServingG: 200,
        servings: [{ label: "1 porsiyon", grams: 200 }],
      },
    });
    expect(created.statusCode).toBe(201);
    const food = created.json().food;
    expect(food).toMatchObject({ name: "Yeni yemek", source: "admin", verified: false, defaultServingG: 200 });

    const patched = await t.app.inject({
      method: "PATCH",
      url: url(`/admin/foods/${food.id}`),
      headers,
      payload: { name: "Güncellenmiş yemek", verified: true },
    });
    expect(patched.json().food).toMatchObject({ name: "Güncellenmiş yemek", verified: true });
    expect((await Food.findById(food.id).lean())?.searchKey).toBe("guncellenmis yemek");

    const removed = await t.app.inject({ method: "DELETE", url: url(`/admin/foods/${food.id}`), headers });
    expect(removed.statusCode).toBe(204);
    expect(await Food.findById(food.id).lean()).toBeNull();
  });

  it("404s on an unknown id", async () => {
    const { headers } = await asAdmin(t);
    expect((await t.app.inject({ method: "PATCH", url: url("/admin/foods/nope"), headers, payload: { verified: true } })).statusCode).toBe(404);
    expect((await t.app.inject({ method: "DELETE", url: url("/admin/foods/64b7f0c2a1b2c3d4e5f60718"), headers })).statusCode).toBe(404);
  });

  it("rejects an invalid create payload", async () => {
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({ method: "POST", url: url("/admin/foods"), headers, payload: { name: "X" } });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /admin/foods/import", () => {
  it("imports from Open Food Facts and caches the rows", async () => {
    offReply = {
      body: {
        products: [
          {
            code: "8690000000123",
            product_name: "Ülker Çikolatalı Gofret",
            brands: "Ülker",
            serving_size: "35 g",
            nutriments: { "energy-kcal_100g": 510, proteins_100g: 6, carbohydrates_100g: 60, fat_100g: 27 },
          },
        ],
      },
    };
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({ method: "POST", url: url("/admin/foods/import"), headers, payload: { query: "gofret", source: "off", limit: 5 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().foods).toHaveLength(1);
    expect(res.json().foods[0]).toMatchObject({ name: "Ülker Çikolatalı Gofret (Ülker)", source: "off", barcode: "8690000000123" });
    expect(await Food.countDocuments({ source: "off" })).toBe(1);

    // importing again updates rather than duplicates
    await t.app.inject({ method: "POST", url: url("/admin/foods/import"), headers, payload: { query: "gofret", source: "off" } });
    expect(await Food.countDocuments({ source: "off" })).toBe(1);
  });

  it("imports from USDA FoodData Central", async () => {
    usdaReply = {
      body: {
        foods: [
          {
            fdcId: 171705,
            description: "Lentils, mature seeds, cooked, boiled, without salt",
            foodNutrients: [
              { nutrientId: 1008, value: 116 },
              { nutrientId: 1003, value: 9.02 },
              { nutrientId: 1005, value: 20.13 },
              { nutrientId: 1004, value: 0.38 },
            ],
            foodPortions: [{ modifier: "cup", gramWeight: 198 }],
          },
        ],
      },
    };
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({ method: "POST", url: url("/admin/foods/import"), headers, payload: { query: "lentils", source: "usda" } });
    expect(res.json().foods[0]).toMatchObject({ name: "Lentils, mature seeds, cooked, boiled, without salt", source: "usda", defaultServingG: 198 });
    expect(t.http.calls.at(-1)?.url).toContain("api_key=");
    expect(t.http.calls.at(-1)?.url).toContain("dataType=SR%20Legacy%2CFoundation");
  });

  it("degrades to an empty import when the upstream is down", async () => {
    usdaReply = { status: 429, body: { error: { code: "OVER_RATE_LIMIT" } } };
    const { headers } = await asAdmin(t);
    const res = await t.app.inject({ method: "POST", url: url("/admin/foods/import"), headers, payload: { query: "lentils", source: "usda" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().foods).toEqual([]);
  });

  it("validates the body", async () => {
    const { headers } = await asAdmin(t);
    expect((await t.app.inject({ method: "POST", url: url("/admin/foods/import"), headers, payload: { query: "a", source: "off" } })).statusCode).toBe(400);
    expect((await t.app.inject({ method: "POST", url: url("/admin/foods/import"), headers, payload: { query: "test", source: "kaggle" } })).statusCode).toBe(400);
  });

  it("is admin-only", async () => {
    const user = await asUser(t);
    const res = await t.app.inject({ method: "POST", url: url("/admin/foods/import"), headers: user.headers, payload: { query: "test", source: "off" } });
    expect(res.statusCode).toBe(403);
  });
});

describe("GET /admin/scans", () => {
  async function scanAs(headers: Record<string, string>) {
    const bytes = await sharp({ create: { width: 200, height: 150, channels: 3, background: { r: 200, g: 80, b: 40 } } }).jpeg().toBuffer();
    const boundary = "----fitfloowadmin";
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="m.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return t.app.inject({
      method: "POST",
      url: url("/nutrition/scan"),
      headers: { ...headers, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload,
    });
  }

  it("lists recent scans with usernames, hydrated foods and image urls", async () => {
    const admin = await asAdmin(t);
    const user = await asUser(t, { username: "eren" });
    const scan = (await scanAs(user.headers)).json();

    const res = await t.app.inject({ method: "GET", url: url("/admin/scans?limit=10"), headers: admin.headers });
    expect(res.statusCode).toBe(200);
    const row = res.json().scans[0];
    expect(row).toMatchObject({ id: scan.scanId, username: "eren", mock: true, userId: String(user.user._id) });
    expect(row.imageUrl).toBe(`/api/v1/uploads/scans/${user.user._id}/${scan.scanId}.jpg`);
    expect(row.detections).toHaveLength(scan.detections.length);
    expect(row.detections[0].food.name).toBe(scan.detections[0].food.name);
    expect(row.detections[0].labelTr).toBe(scan.detections[0].labelTr);
    expect(typeof row.createdAt).toBe("string");
  });

  it("is empty when nobody has scanned", async () => {
    const admin = await asAdmin(t);
    expect((await t.app.inject({ method: "GET", url: url("/admin/scans"), headers: admin.headers })).json()).toEqual({ scans: [] });
  });

  it("is admin-only", async () => {
    const user = await asUser(t);
    expect((await t.app.inject({ method: "GET", url: url("/admin/scans"), headers: user.headers })).statusCode).toBe(403);
  });
});
