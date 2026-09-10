import type { Per100g } from "@fitfloow/core";
import type { AppContext } from "../../context";
import type { ExternalFood } from "./off";

/**
 * USDA FoodData Central importer (admin only).
 *
 * Research §3.2: nutrient ids 1008 kcal / 1003 protein / 1005 carbs / 1004 fat, all per 100 g;
 * `foodPortions[].gramWeight` is the best free source for default serving grams. `DEMO_KEY` shares a
 * global quota and is usually exhausted, so a real key belongs in `USDA_API_KEY` when one exists —
 * failures degrade to an empty import rather than an error.
 */
export const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";
export const USDA_DEFAULT_KEY = "DEMO_KEY";
const TIMEOUT_MS = 8000;

export const NUTRIENT_IDS = { kcal: 1008, protein: 1003, carbs: 1005, fat: 1004, fiber: 1079 } as const;

export interface UsdaNutrient {
  nutrientId?: number;
  value?: number;
  amount?: number;
  nutrient?: { id?: number };
}

export interface UsdaFood {
  fdcId?: number;
  description?: string;
  dataType?: string;
  foodCategory?: string | { description?: string };
  foodNutrients?: UsdaNutrient[];
  foodPortions?: Array<{ modifier?: string; gramWeight?: number; portionDescription?: string }>;
  servingSize?: number;
  servingSizeUnit?: string;
}

function nutrientId(n: UsdaNutrient): number {
  return Number(n.nutrientId ?? n.nutrient?.id ?? 0);
}
function nutrientValue(n: UsdaNutrient): number {
  const v = Number(n.value ?? n.amount ?? 0);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

/** USDA FDC food → ExternalFood; null when energy is missing or out of range. */
export function normalizeUsdaFood(f: UsdaFood): ExternalFood | null {
  const name = (f.description ?? "").trim();
  const fdcId = Number(f.fdcId ?? 0);
  if (name === "" || !fdcId) return null;
  const by = new Map<number, number>();
  for (const n of f.foodNutrients ?? []) by.set(nutrientId(n), nutrientValue(n));
  const kcal = by.get(NUTRIENT_IDS.kcal) ?? 0;
  if (kcal <= 0 || kcal > 900) return null;
  const per100g: Per100g = {
    kcal: Math.round(kcal),
    protein: Math.min(100, by.get(NUTRIENT_IDS.protein) ?? 0),
    carbs: Math.min(100, by.get(NUTRIENT_IDS.carbs) ?? 0),
    fat: Math.min(100, by.get(NUTRIENT_IDS.fat) ?? 0),
  };
  const fiber = by.get(NUTRIENT_IDS.fiber) ?? 0;
  if (fiber > 0) per100g.fiber = Math.min(100, fiber);

  const servings = (f.foodPortions ?? [])
    .map((p) => ({ label: (p.modifier || p.portionDescription || "1 porsiyon").trim(), grams: Math.round(Number(p.gramWeight ?? 0)) }))
    .filter((s) => s.grams > 0 && s.grams <= 2000)
    .slice(0, 4);
  const fallback = f.servingSizeUnit === "g" ? Math.round(Number(f.servingSize ?? 0)) : 0;
  const defaultServingG = servings[0]?.grams ?? (fallback > 0 && fallback <= 2000 ? fallback : 100);
  const category = typeof f.foodCategory === "string" ? f.foodCategory : (f.foodCategory?.description ?? "diğer");

  return {
    name,
    nameEn: name,
    brand: null,
    category: category || "diğer",
    per100g,
    defaultServingG,
    servings,
    barcode: null,
    externalId: `usda:${fdcId}`,
    source: "usda",
    aliases: [],
  };
}

/** USDA FDC search (SR Legacy first). Never throws: upstream problems degrade to an empty list. */
export async function usdaSearch(ctx: AppContext, query: string, limit = 10): Promise<ExternalFood[]> {
  const q = query.trim();
  if (q === "") return [];
  const size = Math.min(Math.max(limit, 1), 50);
  const key = process.env.USDA_API_KEY?.trim() || USDA_DEFAULT_KEY;
  const url =
    `${USDA_BASE}/foods/search?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(q)}` +
    `&pageSize=${size}&dataType=${encodeURIComponent("SR Legacy,Foundation")}`;
  try {
    const res = await ctx.http.request(url, { headers: { Accept: "application/json" }, timeoutMs: TIMEOUT_MS });
    if (!res.ok) return [];
    const body = await res.json<{ foods?: UsdaFood[] }>();
    const out: ExternalFood[] = [];
    const seen = new Set<string>();
    for (const f of body?.foods ?? []) {
      const n = normalizeUsdaFood(f);
      if (!n || seen.has(n.externalId)) continue;
      seen.add(n.externalId);
      out.push(n);
      if (out.length >= size) break;
    }
    return out;
  } catch {
    return [];
  }
}
