import { readFileSync } from "node:fs";
import { searchKey, type Per100g } from "@fitfloow/core";
import { Food } from "../../../models/nutrition";

/** A row of the curated seed tables. `label` is present only on the Food-101 table. */
export interface SeedFoodRow {
  label?: string;
  name: string;
  nameEn: string;
  category: string;
  per100g: Per100g;
  defaultServingG: number;
  servings: Array<{ label: string; grams: number }>;
  aliases: string[];
}

export interface SeedFoodDoc {
  name: string;
  nameEn: string;
  searchKey: string;
  aliases: string[];
  category: string;
  per100g: Per100g;
  defaultServingG: number;
  servings: Array<{ label: string; grams: number }>;
  source: "seed";
  barcode: null;
  externalId: string | null;
  verified: true;
  popularity: number;
  ownerUserId: null;
  brand: null;
}

function load(file: string): SeedFoodRow[] {
  return JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8")) as SeedFoodRow[];
}

/** ~300 Turkish staples (TÜBER / TürKomp / USDA equivalents), curated by hand. */
export const SEED_FOODS_TR: SeedFoodRow[] = load("./foods.tr.json");
/** The 101 Food-101 classes the vision model emits, with Turkish names and USDA-derived macros. */
export const SEED_FOODS_FOOD101: SeedFoodRow[] = load("./foods.food101.json");

/**
 * Merge both tables into insertable documents.
 *
 * Turkish staples come first and therefore *own* any alias they share with a Food-101 row
 * (`baklava` is the only real collision today). A Food-101 row whose name already exists is folded
 * into the existing food instead of being inserted twice, so every vision label resolves to exactly
 * one food and search never shows the same dish twice.
 */
export function buildSeedFoods(): SeedFoodDoc[] {
  const rows = [...SEED_FOODS_TR, ...SEED_FOODS_FOOD101];
  const allKeys = new Set(rows.map((r) => searchKey(r.name)));
  const byKey = new Map<string, SeedFoodDoc>();
  const claimed = new Set<string>();
  const out: SeedFoodDoc[] = [];

  for (const row of rows) {
    const key = searchKey(row.name);
    const externalId = row.label ? `food101:${row.label}` : null;
    const existing = byKey.get(key);
    if (existing) {
      for (const alias of row.aliases) {
        const norm = searchKey(alias);
        if (norm === "" || norm === key || claimed.has(norm) || allKeys.has(norm)) continue;
        claimed.add(norm);
        existing.aliases.push(alias);
      }
      if (existing.externalId === null) existing.externalId = externalId;
      continue;
    }

    const aliases: string[] = [];
    for (const alias of row.aliases) {
      const norm = searchKey(alias);
      // Skip empties, self-references, aliases another food already claimed, and aliases that are
      // another food's own name (that food should win the exact match).
      if (norm === "" || norm === key || claimed.has(norm) || allKeys.has(norm)) continue;
      claimed.add(norm);
      aliases.push(alias);
    }

    const doc: SeedFoodDoc = {
      name: row.name,
      nameEn: row.nameEn,
      searchKey: key,
      aliases,
      category: row.category,
      per100g: row.per100g,
      defaultServingG: row.defaultServingG,
      servings: row.servings,
      source: "seed",
      barcode: null,
      externalId,
      verified: true,
      popularity: 0,
      ownerUserId: null,
      brand: null,
    };
    byKey.set(key, doc);
    out.push(doc);
  }
  return out;
}

/**
 * Idempotent: inserts the curated food tables only when the collection holds no `source: "seed"`
 * documents yet, and never touches user/admin/OFF foods. Returns the number of rows inserted
 * (0 when the catalogue is already there) — the shape `src/seed/index.ts` (B1) reports.
 */
export async function seedFoods(): Promise<number> {
  const existing = await Food.countDocuments({ source: "seed" });
  if (existing > 0) return 0;
  const docs = buildSeedFoods();
  await Food.insertMany(docs, { ordered: false });
  return docs.length;
}
