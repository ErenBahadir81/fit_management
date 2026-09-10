/**
 * Nutrition fixtures for demo mode (F3) — **additive only**: this file never edits `fakeFetch.ts`
 * or `fixtures.ts`, it seeds extra foods into the running fake state and adds the two nutrition
 * routes the base fake stubs out (barcode lookup, scenario-driven scan).
 *
 * Use it either as a whole client (`createNutritionFakeApi()` — tests, previews) or as a seed on
 * top of the app-wide fake (`installNutritionFixtures(client.fake)` — `EXPO_PUBLIC_API_FAKE=1`).
 */
import { createApiClient, memoryTokenStore, type ApiClient, type FetchLike, type TokenStore } from "@fitfloow/api-client";
import type { Detection, FoodDTO, ScanResultDTO } from "@fitfloow/core";
import { emitUnauthorized } from "../api";
import { createFakeFetch, FAKE_BASE_URL, type FakeFetchOptions, type FakeState } from "./fakeFetch";

type Serving = FoodDTO["servings"][number];

function food(
  id: string,
  name: string,
  nameEn: string,
  category: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  defaultServingG: number,
  servings: Serving[] = [],
  extra: Partial<FoodDTO> = {}
): FoodDTO {
  return {
    id,
    name,
    nameEn,
    aliases: [nameEn.toLowerCase(), name.toLowerCase()],
    category,
    per100g: { kcal, protein, carbs, fat },
    defaultServingG,
    servings,
    source: "seed",
    barcode: null,
    verified: true,
    popularity: 8,
    brand: null,
    ...extra,
  };
}

/**
 * ~24 more Turkish staples on top of the base fixture's 12, including packaged goods with real-shaped
 * EAN-13 codes so the barcode flow has something to find.
 */
export const NUTRITION_FOODS: FoodDTO[] = [
  food("f_menemen", "Menemen", "Menemen", "kahvaltı", 118, 6.2, 5.5, 8.4, 250, [{ label: "1 porsiyon", grams: 250 }]),
  food("f_simit", "Simit", "Simit", "tahıl", 315, 9.5, 55, 6, 100, [{ label: "1 adet", grams: 100 }]),
  food("f_zeytin", "Siyah zeytin", "Black olives", "kahvaltı", 145, 1, 6, 13, 20, [{ label: "5 tane", grams: 20 }]),
  food("f_bal", "Bal", "Honey", "kahvaltı", 304, 0.3, 82, 0, 20, [{ label: "1 tatlı kaşığı", grams: 10 }]),
  food("f_lahmacun", "Lahmacun", "Lahmacun", "hamur işi", 218, 9.8, 30, 6.5, 130, [{ label: "1 adet", grams: 130 }]),
  food("f_pide", "Kıymalı pide", "Minced meat pide", "hamur işi", 255, 11, 32, 9, 200, [{ label: "1 dilim", grams: 100 }]),
  food("f_iskender", "İskender kebap", "Iskender kebab", "et", 232, 14, 18, 12, 250, [{ label: "1 porsiyon", grams: 250 }]),
  food("f_adana", "Adana kebap", "Adana kebab", "et", 268, 17, 2, 21, 180, [{ label: "1 şiş", grams: 180 }]),
  food("f_tavukdoner", "Tavuk döner", "Chicken doner", "et", 195, 20, 3, 11, 150, [{ label: "1 porsiyon", grams: 150 }]),
  food("f_karniyarik", "Karnıyarık", "Stuffed eggplant", "sebze yemeği", 128, 5, 9, 8, 220, [{ label: "1 adet", grams: 220 }]),
  food("f_kurufasulye", "Kuru fasulye", "White bean stew", "bakliyat", 118, 7, 16, 2.8, 250, [{ label: "1 kase", grams: 250 }]),
  food("f_nohut", "Nohut yemeği", "Chickpea stew", "bakliyat", 132, 6.5, 18, 3.6, 250, [{ label: "1 kase", grams: 250 }]),
  food("f_yaprak", "Zeytinyağlı yaprak sarma", "Stuffed vine leaves", "meze", 168, 3, 22, 7.5, 120, [{ label: "5 adet", grams: 100 }]),
  food("f_cacik", "Cacık", "Cacik", "meze", 47, 2.6, 3.5, 2.3, 200, [{ label: "1 kase", grams: 200 }]),
  food("f_makarna", "Makarna (haşlanmış)", "Pasta", "tahıl", 158, 5.8, 31, 0.9, 200, [{ label: "1 porsiyon", grams: 200 }]),
  food("f_patates", "Fırın patates", "Baked potato", "sebze", 93, 2.5, 21, 0.1, 200, [{ label: "1 porsiyon", grams: 200 }]),
  food("f_somon", "Somon (fırın)", "Baked salmon", "protein", 208, 20, 0, 13, 150, [{ label: "1 fileto", grams: 150 }]),
  food("f_hindi", "Hindi göğsü", "Turkey breast", "protein", 135, 29, 0, 1.7, 150, [{ label: "1 porsiyon", grams: 150 }]),
  food("f_lor", "Lor peyniri", "Curd cheese", "süt", 98, 12, 3.5, 4, 60, [{ label: "1 porsiyon", grams: 60 }]),
  food("f_elma", "Elma", "Apple", "meyve", 52, 0.3, 14, 0.2, 150, [{ label: "1 adet", grams: 150 }]),
  food("f_ceviz", "Ceviz", "Walnut", "kuruyemiş", 654, 15, 14, 65, 30, [{ label: "1 avuç", grams: 30 }]),
  // Packaged goods: these carry a barcode so the reader has something to resolve.
  food("f_ayran", "Ayran", "Ayran", "içecek", 38, 1.7, 2.9, 2, 250, [{ label: "1 bardak", grams: 200 }], { barcode: "8690504010012", brand: "Sütaş", source: "off" }),
  food("f_protein_bar", "Protein bar (çikolatalı)", "Protein bar", "atıştırmalık", 372, 32, 34, 11, 60, [{ label: "1 bar", grams: 60 }], { barcode: "8681234567890", brand: "FitBar", source: "off" }),
  food("f_yulaf", "Yulaf ezmesi", "Rolled oats", "tahıl", 379, 13, 67, 6.5, 40, [{ label: "1 kepçe", grams: 40 }], { barcode: "8690632010015", brand: "Torku", source: "off" }),
];

/** Seeds the extra foods into a running fake state. Idempotent — safe to call on every mount. */
export function installNutritionFixtures(state: FakeState | undefined | null): void {
  if (!state?.foods) return;
  const have = new Set(state.foods.map((f) => f.id));
  for (const f of NUTRITION_FOODS) if (!have.has(f.id)) state.foods.push(f);
}

/** Barcode → food across the seeded catalog (the base fake always answers `null`). */
export function findByBarcode(state: FakeState, code: string): FoodDTO | null {
  const clean = code.trim();
  return state.foods.find((f) => f.barcode && f.barcode === clean) ?? null;
}

export type ScanScenario = "plate" | "single" | "notFood";

function detection(state: FakeState, id: string, confidence: number, grams: number): Detection | null {
  const f = state.foods.find((x) => x.id === id);
  if (!f) return null;
  return { label: f.nameEn ?? f.name, labelTr: f.name, confidence, food: f, suggestedGrams: grams };
}

/** Deterministic scan answers for the demo: a full plate, one dish, or "this isn't food". */
export function fakeScanResult(state: FakeState, scenario: ScanScenario = "plate", seq = 1): ScanResultDTO {
  const picks: Array<[string, number, number]> =
    scenario === "single" ? [["f_iskender", 0.91, 250]] : scenario === "notFood" ? [] : [
      ["f_tavuk", 0.86, 150],
      ["f_pilav", 0.63, 150],
      ["f_cacik", 0.41, 200],
    ];
  const detections = picks.map(([id, c, g]) => detection(state, id, c, g)).filter((d): d is Detection => Boolean(d));
  return { scanId: `scan_fake_${seq}`, imageUrl: null, detections, mock: true, latencyMs: 380, modelVersion: "fake-vision-1" };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export interface NutritionFakeOptions extends FakeFetchOptions {
  signedIn?: boolean;
  tokens?: TokenStore;
  /** What the scan endpoint answers (default "plate"). */
  scanScenario?: ScanScenario;
  /** Make the scan endpoint fail like a vision outage. */
  scanFails?: "unavailable" | "server" | null;
}

/**
 * The base fake plus the nutrition routes it stubs: barcode lookup and a scenario-driven scan.
 * Everything else falls through untouched.
 */
export function createNutritionFakeFetch(opts: NutritionFakeOptions = {}): FetchLike & { state: FakeState } {
  const base = createFakeFetch(opts);
  installNutritionFixtures(base.state);
  let scans = 0;

  const wrapped = (async (input: string, init?: RequestInit): Promise<Response> => {
    const rel = input.startsWith(FAKE_BASE_URL) ? input.slice(FAKE_BASE_URL.length) : input;
    const path = rel.split("?")[0];
    const method = (init?.method ?? "GET").toUpperCase();

    if (method === "GET" && path.startsWith("/nutrition/foods/barcode/")) {
      const code = decodeURIComponent(path.slice("/nutrition/foods/barcode/".length));
      return json({ food: findByBarcode(base.state, code) });
    }
    if (method === "POST" && path === "/nutrition/scan") {
      if (opts.scanFails === "unavailable") return json({ error: { code: "VISION_UNAVAILABLE", message: "Tanıma servisi şu an kapalı", details: { fallback: "search" } } }, 503);
      if (opts.scanFails === "server") return json({ error: { code: "INTERNAL", message: "Beklenmeyen hata" } }, 500);
      return json(fakeScanResult(base.state, opts.scanScenario ?? "plate", ++scans));
    }
    return base(input, init);
  }) as FetchLike & { state: FakeState };

  wrapped.state = base.state;
  return wrapped;
}

/** A typed client over the nutrition-aware fake. `setApi(createNutritionFakeApi({ signedIn: true }))`. */
export function createNutritionFakeApi(opts: NutritionFakeOptions = {}): ApiClient & { fake: FakeState } {
  const fetch = createNutritionFakeFetch(opts);
  const tokens = opts.tokens ?? memoryTokenStore();
  if (opts.signedIn) {
    const access = `fake.access.${fetch.state.user.username}.seed`;
    const refresh = `fake.refresh.${fetch.state.user.username}.seed`;
    fetch.state.sessions.add(access);
    fetch.state.sessions.add(refresh);
    void tokens.setTokens({ accessToken: access, refreshToken: refresh });
  }
  const client = createApiClient({ baseUrl: FAKE_BASE_URL, tokens, fetch, onUnauthorized: emitUnauthorized });
  return Object.assign(client, { fake: fetch.state });
}
