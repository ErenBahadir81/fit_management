/**
 * The scan flow as a pure state machine: camera → capturing → analyzing → results → saving → done.
 *
 * Analyzing lasts exactly as long as the request: no minimum duration, no scripted status steps.
 * The screen shows the photo with a quiet "looking" state while the API works and the results as
 * soon as they land.
 *
 * Nothing here touches React, the camera or the network: the screen dispatches events and renders
 * the state, which makes every rule (out-of-order answers, empty detections, vision outage, the
 * "Bunu mu demek istedin?" swap) testable without a device.
 */
import { entryTotals, sumTotals, type Detection, type FoodDTO, type Meal, type Per100g, type ScanResultDTO, type Totals } from "@fitfloow/core";

/** Below this the model is unsure: the card asks "Bunu mu demek istedin?" with the alternatives. */
export const UNSURE_BELOW = 0.5;

export type ScanPhase = "camera" | "capturing" | "analyzing" | "results" | "saving" | "done" | "error";

export type ScanErrorKind = "visionUnavailable" | "network" | "tooLarge" | "unknown";
export interface ScanError {
  kind: ScanErrorKind;
  message: string;
}

/** Everything the portion presets need to know about a food. */
export interface PortionInfo {
  defaultServingG: number;
  servings: FoodDTO["servings"];
  category: string | null;
}

/** Another reading of the same photo, ready to swap in with one tap. */
export interface ScanAlternative extends PortionInfo {
  name: string;
  confidence: number;
  grams: number;
  per100g: Per100g;
  foodId: string;
}

export interface ScanItem extends PortionInfo {
  /** Stable key for lists and grams edits. */
  key: string;
  name: string;
  /** 0..1, null for items the user added by hand. */
  confidence: number | null;
  grams: number;
  per100g: Per100g;
  foodId: string | null;
  /** Other candidates for this item, most likely first (empty for hand-added items). */
  alternatives: ScanAlternative[];
  /** The card asks "Bunu mu demek istedin?" until the user picks or confirms. */
  unsure: boolean;
}

export interface ScanState {
  phase: ScanPhase;
  photoUri: string | null;
  scanId: string | null;
  mock: boolean;
  /** True when the model recognised no food at all (a table, a cat, a blurry photo). */
  notFood: boolean;
  items: ScanItem[];
  meal: Meal;
  error: ScanError | null;
}

export type ScanEvent =
  | { type: "shutter" }
  | { type: "captured"; uri: string }
  | { type: "result"; result: ScanResultDTO }
  | { type: "failed"; error: ScanError }
  | { type: "setGrams"; key: string; grams: number }
  | { type: "removeItem"; key: string }
  | { type: "addItem"; item: Omit<ScanItem, "key" | "alternatives" | "unsure" | keyof PortionInfo> & Partial<PortionInfo>; key?: string }
  /** "Bunu mu demek istedin?" → this one: swap the item's food for alternative `index`. */
  | { type: "pickAlternative"; key: string; index: number }
  /** "Evet, bu" → keep the model's guess and stop asking. */
  | { type: "confirmItem"; key: string }
  | { type: "setMeal"; meal: Meal }
  | { type: "save" }
  | { type: "saved" }
  | { type: "saveFailed"; message: string }
  | { type: "retake" }
  /** The results sheet was swiped away: "not this photo", back to the camera. Ignored in any other phase. */
  | { type: "resultsDismissed" }
  | { type: "dismissError" };

export function initialScanState(meal: Meal): ScanState {
  return { phase: "camera", photoUri: null, scanId: null, mock: false, notFood: false, items: [], meal, error: null };
}

let keySeq = 0;
function nextKey(prefix: string): string {
  return `${prefix}_${++keySeq}`;
}

const portionOf = (food: FoodDTO): PortionInfo => ({ defaultServingG: food.defaultServingG, servings: food.servings, category: food.category || null });
const gramsOf = (suggested: number, food: FoodDTO) => Math.round(suggested > 0 ? suggested : food.defaultServingG);

/** A detection becomes an editable item; detections the API could not map to a food are dropped. */
export function itemsFromDetections(detections: readonly Detection[]): ScanItem[] {
  const out: ScanItem[] = [];
  for (const d of detections) {
    if (!d.food) continue;
    const alternatives: ScanAlternative[] = (d.alternatives ?? [])
      .filter((a) => a.food.id !== d.food?.id)
      .map((a) => ({ name: a.labelTr || a.food.name, confidence: a.confidence, grams: gramsOf(a.suggestedGrams, a.food), per100g: a.food.per100g, foodId: a.food.id, ...portionOf(a.food) }));
    out.push({
      key: nextKey("det"),
      name: d.labelTr || d.food.name,
      confidence: d.confidence,
      grams: gramsOf(d.suggestedGrams, d.food),
      per100g: d.food.per100g,
      foodId: d.food.id,
      ...portionOf(d.food),
      alternatives,
      unsure: d.confidence < UNSURE_BELOW && alternatives.length > 0,
    });
  }
  return out;
}

/** Sum of the kept detections at their current grams — the sheet's live footer. */
export function scanTotals(items: readonly ScanItem[]): Totals {
  return sumTotals(items.map((i) => entryTotals(i.grams, i.per100g)));
}

export interface PortionPreset {
  key: string;
  label: string;
  grams: number;
}

/** A handful is a portion people actually think in for these; 30 g is the usual reference. */
const HANDFUL_CATEGORIES = new Set(["kuruyemiş", "meyve", "kuru meyve", "atıştırmalık", "kahvaltı"]);
export const HANDFUL_G = 30;
const MAX_PRESETS = 5;

/**
 * One-tap portions for a food, in the order people reach for them: its default serving, half of
 * it, 100 g, the food's own servings ("1 dilim", "1 avuç"…) and a handful where that is natural.
 * Each gram amount appears once.
 */
export function portionPresets(food: PortionInfo): PortionPreset[] {
  const serving = Math.round(food.defaultServingG);
  const candidates: PortionPreset[] = [
    { key: "serving", label: "1 porsiyon", grams: serving },
    { key: "half", label: "½ porsiyon", grams: Math.round(serving / 2) },
    { key: "100g", label: "100 g", grams: 100 },
    ...food.servings.map((s, i) => ({ key: `s${i}`, label: s.label, grams: Math.round(s.grams) })),
  ];
  if (food.category && HANDFUL_CATEGORIES.has(food.category.toLocaleLowerCase("tr-TR"))) candidates.push({ key: "handful", label: "Avuç", grams: HANDFUL_G });
  const seen = new Set<number>();
  const out: PortionPreset[] = [];
  for (const p of candidates) {
    if (p.grams < 1 || seen.has(p.grams)) continue;
    seen.add(p.grams);
    out.push(p);
    if (out.length >= MAX_PRESETS) break;
  }
  return out;
}

/** ApiClientError-shaped input → the state the UI explains to the user. Never throws. */
export function mapScanError(e: unknown): ScanError {
  const err = e as { status?: number; code?: string; message?: string } | null;
  const code = err?.code ?? "";
  const status = err?.status ?? -1;
  if (status === 503 || code === "VISION_UNAVAILABLE") {
    return { kind: "visionUnavailable", message: "Tanıma servisi şu an meşgul. Yemeği aramadan ekleyebilirsin." };
  }
  if (status === 0) return { kind: "network", message: "Bağlantı yok gibi görünüyor. Tekrar dener misin?" };
  if (status === 413 || code === "PAYLOAD_TOO_LARGE") return { kind: "tooLarge", message: "Fotoğraf çok büyük. Daha küçük bir kare dene." };
  return { kind: "unknown", message: "Fotoğrafı okuyamadım. Tekrar deneyelim mi?" };
}

function withResult(state: ScanState, result: ScanResultDTO): ScanState {
  const items = itemsFromDetections(result.detections);
  return {
    ...state,
    phase: "results",
    error: null,
    scanId: result.scanId,
    mock: result.mock,
    notFood: items.length === 0,
    items,
    // The local capture stays the preview: `imageUrl` is an API-relative, auth-gated path that no
    // <Image> can load on its own.
    photoUri: state.photoUri ?? result.imageUrl,
  };
}

/** Swap an item for one of its alternatives; the old guess becomes an alternative in its place. */
function pickAlternative(item: ScanItem, index: number): ScanItem {
  const alt = item.alternatives[index];
  if (!alt) return item;
  const previous: ScanAlternative | null =
    item.foodId && item.confidence != null
      ? { name: item.name, confidence: item.confidence, grams: item.grams, per100g: item.per100g, foodId: item.foodId, defaultServingG: item.defaultServingG, servings: item.servings, category: item.category }
      : null;
  const rest = item.alternatives.filter((_, i) => i !== index);
  return {
    ...item,
    name: alt.name,
    confidence: alt.confidence,
    grams: alt.grams,
    per100g: alt.per100g,
    foodId: alt.foodId,
    defaultServingG: alt.defaultServingG,
    servings: alt.servings,
    category: alt.category,
    alternatives: previous ? [previous, ...rest] : rest,
    unsure: false,
  };
}

export function scanReducer(state: ScanState, event: ScanEvent): ScanState {
  switch (event.type) {
    case "shutter":
      return state.phase === "camera" ? { ...state, phase: "capturing", error: null } : state;

    case "captured":
      if (state.phase === "results" || state.phase === "saving" || state.phase === "done") return state;
      return { ...state, phase: "analyzing", photoUri: event.uri, error: null, notFood: false, items: [] };

    case "result":
      return state.phase === "analyzing" ? withResult(state, event.result) : state;

    case "failed":
      return state.phase === "analyzing" ? { ...state, phase: "error", error: event.error } : state;

    case "setGrams": {
      const grams = Math.max(1, Math.round(event.grams));
      return { ...state, items: state.items.map((i) => (i.key === event.key ? { ...i, grams } : i)) };
    }

    case "removeItem":
      return { ...state, items: state.items.filter((i) => i.key !== event.key) };

    case "pickAlternative":
      return { ...state, items: state.items.map((i) => (i.key === event.key ? pickAlternative(i, event.index) : i)) };

    case "confirmItem":
      return { ...state, items: state.items.map((i) => (i.key === event.key ? { ...i, unsure: false } : i)) };

    case "addItem": {
      // Adding by hand also rescues the error state: there is something to save again.
      const phase = state.phase === "error" ? "results" : state.phase;
      const { item } = event;
      const added: ScanItem = {
        ...item,
        key: event.key ?? nextKey("add"),
        defaultServingG: item.defaultServingG ?? item.grams,
        servings: item.servings ?? [],
        category: item.category ?? null,
        alternatives: [],
        unsure: false,
      };
      return { ...state, phase, error: state.phase === "error" ? null : state.error, notFood: false, items: [...state.items, added] };
    }

    case "setMeal":
      return { ...state, meal: event.meal };

    case "save":
      return state.phase === "results" && state.items.length > 0 ? { ...state, phase: "saving", error: null } : state;

    case "saved":
      return state.phase === "saving" ? { ...state, phase: "done" } : state;

    case "saveFailed":
      return state.phase === "saving" ? { ...state, phase: "results", error: { kind: "unknown", message: event.message } } : state;

    case "retake":
      return { ...initialScanState(state.meal), phase: "camera" };

    case "resultsDismissed":
      return state.phase === "results" ? { ...initialScanState(state.meal), phase: "camera" } : state;

    case "dismissError":
      return state.error ? { ...state, error: null } : state;

    default:
      return state;
  }
}

/** True while the results sheet may be saved. */
export function canSave(state: ScanState): boolean {
  return state.phase === "results" && state.items.length > 0;
}
