import { describe, expect, it } from "vitest";
import { FOOD101_LABELS, FOOD101_TR, TURKISH25_LABELS, searchKey } from "@fitfloow/core";
import { MOCK_LABELS } from "../src/modules/vision/client";
import { SEED_FOODS_FOOD101, SEED_FOODS_TR, buildSeedFoods } from "../src/modules/nutrition/seed/index";

/**
 * The seed tables are the accuracy bottleneck of the whole nutrition module: a wrong row here is a
 * wrong calorie number on every user's screen forever. These assertions are the audit.
 */

/** Alcohol carries 7 kcal/g and is not one of the stored macros, so Atwater cannot balance. */
const ALCOHOLIC = new Set(["Bira", "Şarap (kırmızı)", "Rakı"]);

const rows = [...SEED_FOODS_TR, ...SEED_FOODS_FOOD101];
const merged = buildSeedFoods();
const aliasIndex = new Map<string, string>();
for (const doc of merged) {
  aliasIndex.set(doc.searchKey, doc.name);
  for (const a of doc.aliases) aliasIndex.set(searchKey(a), doc.name);
}

describe("seed tables — size and shape", () => {
  it("ships ~300 Turkish staples and all 101 Food-101 classes", () => {
    expect(SEED_FOODS_TR.length).toBeGreaterThanOrEqual(300);
    expect(SEED_FOODS_FOOD101).toHaveLength(101);
  });

  it("gives every row a name, a category, macros and a serving", () => {
    for (const r of rows) {
      expect(r.name.trim().length, r.name).toBeGreaterThan(1);
      expect(r.nameEn.trim().length, r.name).toBeGreaterThan(1);
      expect(r.category.trim().length, r.name).toBeGreaterThan(1);
      expect(r.defaultServingG, r.name).toBeGreaterThan(0);
      expect(r.defaultServingG, r.name).toBeLessThanOrEqual(2000);
      expect(r.servings.length, r.name).toBeGreaterThan(0);
      expect(r.servings[0].grams, r.name).toBe(r.defaultServingG);
      for (const s of r.servings) expect(s.label.trim().length, r.name).toBeGreaterThan(0);
    }
  });

  it("keeps every per-100 g value inside the DTO bounds", () => {
    for (const r of rows) {
      const p = r.per100g;
      expect(p.kcal, r.name).toBeGreaterThanOrEqual(0);
      expect(p.kcal, r.name).toBeLessThanOrEqual(900);
      for (const k of ["protein", "carbs", "fat"] as const) {
        expect(p[k], `${r.name}.${k}`).toBeGreaterThanOrEqual(0);
        expect(p[k], `${r.name}.${k}`).toBeLessThanOrEqual(100);
      }
      if (p.fiber !== undefined) {
        expect(p.fiber, r.name).toBeGreaterThanOrEqual(0);
        expect(p.fiber, r.name).toBeLessThanOrEqual(100);
      }
    }
  });

  it("balances kcal against the Atwater factors (4/4/9) for every non-alcoholic row", () => {
    for (const r of rows) {
      if (ALCOHOLIC.has(r.name)) continue;
      const p = r.per100g;
      const atwater = 4 * p.protein + 4 * p.carbs + 9 * p.fat;
      const tolerance = Math.max(25, 0.25 * p.kcal);
      expect(Math.abs(atwater - p.kcal), `${r.name}: ${p.kcal} kcal vs ${atwater.toFixed(1)} Atwater`).toBeLessThanOrEqual(tolerance);
    }
  });

  it("has no duplicate names inside either table", () => {
    for (const table of [SEED_FOODS_TR, SEED_FOODS_FOOD101]) {
      const keys = table.map((r) => searchKey(r.name));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("seed tables — label coverage", () => {
  it("matches the core Food-101 label list exactly, in order", () => {
    expect(SEED_FOODS_FOOD101.map((r) => r.label)).toEqual([...FOOD101_LABELS]);
  });

  it("uses the same Turkish names as core's FOOD101_TR", () => {
    for (const r of SEED_FOODS_FOOD101) expect(r.name, r.label).toBe(FOOD101_TR[r.label!]);
  });

  it("carries the raw model label as the first alias of every Food-101 row", () => {
    for (const r of SEED_FOODS_FOOD101) expect(r.aliases[0], r.label).toBe(r.label);
  });

  it("resolves every Food-101 label to exactly one merged food", () => {
    for (const label of FOOD101_LABELS) expect(aliasIndex.get(searchKey(label)), label).toBeTruthy();
  });

  it("resolves every TurkishFoods-25 label", () => {
    for (const label of TURKISH25_LABELS) expect(aliasIndex.get(searchKey(label)), label).toBeTruthy();
  });

  it("resolves every label the mock vision client can emit", () => {
    for (const label of MOCK_LABELS) expect(aliasIndex.get(searchKey(label)), label).toBeTruthy();
  });

  it("maps the Turkish labels to the Turkish dishes, not the Food-101 look-alikes", () => {
    expect(aliasIndex.get("lahmacun")).toBe("Lahmacun");
    expect(aliasIndex.get("mercimek corbasi")).toBe("Mercimek çorbası");
    expect(aliasIndex.get("kuru fasulye")).toBe("Kuru fasulye");
    expect(aliasIndex.get("baklava")).toBe("Baklava");
    expect(aliasIndex.get("kofte")).toBe("Köfte (ızgara)");
  });
});

describe("buildSeedFoods", () => {
  it("marks everything as verified seed data owned by nobody", () => {
    for (const d of merged) {
      expect(d.source).toBe("seed");
      expect(d.verified).toBe(true);
      expect(d.ownerUserId).toBeNull();
      expect(d.barcode).toBeNull();
      expect(d.searchKey).toBe(searchKey(d.name));
    }
  });

  it("folds a duplicated dish into a single food instead of inserting it twice", () => {
    // "Baklava" is in both tables — the Turkish row wins and absorbs the Food-101 aliases.
    expect(merged.filter((d) => d.name === "Baklava")).toHaveLength(1);
    expect(merged.length).toBeLessThan(rows.length);
    expect(merged.length).toBe(new Set(rows.map((r) => searchKey(r.name))).size);
  });

  it("never lets two foods claim the same alias", () => {
    const owners = new Map<string, string>();
    for (const d of merged) {
      for (const a of [...d.aliases, d.name]) {
        const key = searchKey(a);
        const prev = owners.get(key);
        expect(prev === undefined || prev === d.name, `${key}: ${prev} vs ${d.name}`).toBe(true);
        owners.set(key, d.name);
      }
    }
  });

  it("tags Food-101 rows with a traceable externalId", () => {
    const pizza = merged.find((d) => d.name === "Pizza");
    expect(pizza?.externalId).toBe("food101:pizza");
  });
});
