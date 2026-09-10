import type { Per100g } from "@fitfloow/core";
import type { AppContext } from "../../context";

/**
 * Open Food Facts client (barcode + best-effort search).
 *
 * Research (docs/research/food-recognition.md §3.1): OFF is rate limited to 15 req/min for product
 * reads and 10 req/min for search, its `/api/v2/search` endpoint was serving HTML during testing and
 * the search-a-licious index is two years stale. So: barcode is the supported flow, search is a
 * best-effort extra that must never fail a request, and every result is cached in `foods`.
 */
export const OFF_BASE = "https://world.openfoodfacts.org";
export const OFF_USER_AGENT = "FitFloow/2.0 (https://fitfloow.app)";
const TIMEOUT_MS = 5000;

export interface OffNutriments {
  "energy-kcal_100g"?: number;
  "energy-kj_100g"?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
}

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_tr?: string;
  generic_name?: string;
  brands?: string;
  categories?: string;
  serving_size?: string;
  nutriments?: OffNutriments;
}

/** Normalized upstream food, ready to be stored in `foods` (see foods.service `cacheExternalFood`). */
export interface ExternalFood {
  name: string;
  nameEn: string | null;
  brand: string | null;
  category: string;
  per100g: Per100g;
  defaultServingG: number;
  servings: Array<{ label: string; grams: number }>;
  barcode: string | null;
  externalId: string;
  source: "off" | "usda";
  aliases: string[];
}

const FIELDS = "code,product_name,product_name_tr,generic_name,brands,categories,serving_size,nutriments";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** "30 g" → 30, "1 portion (25g)" → 25, "330 ml" → 330. Returns null when unparsable. */
export function parseServingSize(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = /(\d+(?:[.,]\d+)?)\s*(g|gr|gram|ml)\b/i.exec(s);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= 2000 ? Math.round(n) : null;
}

/** OFF product → ExternalFood; null when the product has no usable per-100 g energy. */
export function normalizeOffProduct(p: OffProduct): ExternalFood | null {
  const name = (p.product_name_tr || p.product_name || p.generic_name || "").trim();
  const code = (p.code ?? "").trim();
  if (name === "" || code === "") return null;
  const n = p.nutriments ?? {};
  const kj = num(n["energy-kj_100g"]);
  const kcal = num(n["energy-kcal_100g"]) || (kj > 0 ? Math.round(kj / 4.184) : 0);
  if (kcal <= 0 || kcal > 900) return null;
  const per100g: Per100g = {
    kcal: Math.round(kcal),
    protein: Math.min(100, num(n.proteins_100g)),
    carbs: Math.min(100, num(n.carbohydrates_100g)),
    fat: Math.min(100, num(n.fat_100g)),
  };
  const fiber = num(n.fiber_100g);
  if (fiber > 0) per100g.fiber = Math.min(100, fiber);
  const serving = parseServingSize(p.serving_size);
  const brand = (p.brands ?? "").split(",")[0]?.trim() || null;
  return {
    name: brand ? `${name} (${brand})` : name,
    nameEn: name,
    brand,
    category: "paketli",
    per100g,
    defaultServingG: serving ?? 100,
    servings: serving ? [{ label: "1 porsiyon", grams: serving }] : [],
    barcode: code,
    externalId: `off:${code}`,
    source: "off",
    aliases: [code],
  };
}

async function offGet<T>(ctx: AppContext, url: string): Promise<T | null> {
  try {
    const res = await ctx.http.request(url, { headers: { "User-Agent": OFF_USER_AGENT, Accept: "application/json" }, timeoutMs: TIMEOUT_MS });
    if (!res.ok) return null;
    return await res.json<T>();
  } catch {
    return null;
  }
}

/** Best-effort OFF search. Never throws: upstream problems degrade to an empty list. */
export async function offSearch(ctx: AppContext, query: string, limit = 10): Promise<ExternalFood[]> {
  const q = query.trim();
  if (q === "") return [];
  const size = Math.min(Math.max(limit, 1), 20);
  const url =
    `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1` +
    `&page_size=${size}&fields=${FIELDS}`;
  const body = await offGet<{ products?: OffProduct[] }>(ctx, url);
  const products = Array.isArray(body?.products) ? body.products : [];
  const out: ExternalFood[] = [];
  const seen = new Set<string>();
  for (const p of products) {
    const f = normalizeOffProduct(p);
    if (!f || seen.has(f.externalId)) continue;
    seen.add(f.externalId);
    out.push(f);
    if (out.length >= size) break;
  }
  return out;
}

/** OFF v2 product lookup by barcode. Never throws. */
export async function offBarcode(ctx: AppContext, code: string): Promise<ExternalFood | null> {
  const c = code.trim();
  if (!/^\d{6,20}$/.test(c)) return null;
  const url = `${OFF_BASE}/api/v2/product/${encodeURIComponent(c)}.json?fields=${FIELDS}`;
  const body = await offGet<{ status?: number; product?: OffProduct }>(ctx, url);
  if (!body?.product) return null;
  const f = normalizeOffProduct({ code: c, ...body.product });
  return f;
}
