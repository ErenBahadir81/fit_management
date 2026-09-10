/**
 * The scan flow as a pure state machine: camera → capturing → analyzing (with a floor on how fast
 * it may finish, so the "AI is thinking" theatre always completes) → results → saving → done.
 *
 * Nothing here touches React, the camera or the network: the screen dispatches events and renders
 * the state, which makes every timing rule (min duration, out-of-order answers, empty detections,
 * vision outage) testable without a device.
 */
import { entryTotals, sumTotals, type Detection, type Meal, type Per100g, type ScanResultDTO, type Totals } from "@fitfloow/core";

/** The overall analyze animation never finishes faster than this, however quick the API is. */
export const MIN_ANALYZE_MS = 1800;
/** Each status label is on screen for at least this long. */
export const STATUS_STEP_MS = 600;

export const SCAN_STATUS_LABELS = ["Görüntü analiz ediliyor…", "Yemekler tanınıyor…", "Besin değerleri hesaplanıyor…"] as const;

export type ScanPhase = "camera" | "capturing" | "analyzing" | "results" | "saving" | "done" | "error";

export type ScanErrorKind = "visionUnavailable" | "network" | "tooLarge" | "unknown";
export interface ScanError {
  kind: ScanErrorKind;
  message: string;
}

export interface ScanItem {
  /** Stable key for lists and grams edits. */
  key: string;
  name: string;
  /** 0..1, null for items the user added by hand. */
  confidence: number | null;
  grams: number;
  per100g: Per100g;
  foodId: string | null;
}

export interface ScanState {
  phase: ScanPhase;
  photoUri: string | null;
  /** ms timestamp the analyze started (for the min-duration floor and the status label). */
  startedAt: number | null;
  minElapsed: boolean;
  /** An API answer that arrived before the theatre finished. */
  pending: { kind: "ok"; result: ScanResultDTO } | { kind: "error"; error: ScanError } | null;
  scanId: string | null;
  mock: boolean;
  /** True when the model recognised no food at all (a table, a cat, a blurry photo). */
  notFood: boolean;
  items: ScanItem[];
  meal: Meal;
  statusIndex: number;
  error: ScanError | null;
}

export type ScanEvent =
  | { type: "shutter" }
  | { type: "captured"; uri: string; at: number }
  | { type: "minElapsed" }
  | { type: "tick"; at: number }
  | { type: "result"; result: ScanResultDTO }
  | { type: "failed"; error: ScanError }
  | { type: "setGrams"; key: string; grams: number }
  | { type: "removeItem"; key: string }
  | { type: "addItem"; item: Omit<ScanItem, "key">; key?: string }
  | { type: "setMeal"; meal: Meal }
  | { type: "save" }
  | { type: "saved" }
  | { type: "saveFailed"; message: string }
  | { type: "retake" }
  | { type: "dismissError" };

export function initialScanState(meal: Meal): ScanState {
  return {
    phase: "camera",
    photoUri: null,
    startedAt: null,
    minElapsed: false,
    pending: null,
    scanId: null,
    mock: false,
    notFood: false,
    items: [],
    meal,
    statusIndex: 0,
    error: null,
  };
}

let keySeq = 0;
function nextKey(prefix: string): string {
  return `${prefix}_${++keySeq}`;
}

/** A detection becomes an editable item; detections the API could not map to a food are dropped. */
export function itemsFromDetections(detections: readonly Detection[]): ScanItem[] {
  const out: ScanItem[] = [];
  for (const d of detections) {
    if (!d.food) continue;
    out.push({
      key: nextKey("det"),
      name: d.labelTr || d.food.name,
      confidence: d.confidence,
      grams: Math.round(d.suggestedGrams > 0 ? d.suggestedGrams : d.food.defaultServingG),
      per100g: d.food.per100g,
      foodId: d.food.id,
    });
  }
  return out;
}

/** Sum of the kept detections at their current grams — the sheet's live footer. */
export function scanTotals(items: readonly ScanItem[]): Totals {
  return sumTotals(items.map((i) => entryTotals(i.grams, i.per100g)));
}

/** The label the theatre shows at `now`; holds on the last one when the API is slow. */
export function statusIndexAt(startedAt: number | null, now: number): number {
  if (startedAt == null) return 0;
  const step = Math.floor(Math.max(0, now - startedAt) / STATUS_STEP_MS);
  return Math.min(step, SCAN_STATUS_LABELS.length - 1);
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

/** Resolve a finished analyze once both the API and the minimum theatre duration are done. */
function settle(state: ScanState, outcome: NonNullable<ScanState["pending"]>): ScanState {
  if (outcome.kind === "error") {
    return { ...state, phase: "error", pending: null, error: outcome.error };
  }
  const { result } = outcome;
  const items = itemsFromDetections(result.detections);
  return {
    ...state,
    phase: "results",
    pending: null,
    error: null,
    scanId: result.scanId,
    mock: result.mock,
    notFood: items.length === 0,
    items,
    photoUri: result.imageUrl ?? state.photoUri,
  };
}

export function scanReducer(state: ScanState, event: ScanEvent): ScanState {
  switch (event.type) {
    case "shutter":
      return state.phase === "camera" ? { ...state, phase: "capturing", error: null } : state;

    case "captured":
      if (state.phase === "results" || state.phase === "saving" || state.phase === "done") return state;
      return { ...state, phase: "analyzing", photoUri: event.uri, startedAt: event.at, minElapsed: false, pending: null, statusIndex: 0, error: null, notFood: false, items: [] };

    case "tick":
      if (state.phase !== "analyzing") return state;
      return { ...state, statusIndex: statusIndexAt(state.startedAt, event.at) };

    case "minElapsed": {
      if (state.phase !== "analyzing") return state;
      if (state.pending) return settle({ ...state, minElapsed: true }, state.pending);
      return { ...state, minElapsed: true };
    }

    case "result": {
      if (state.phase !== "analyzing") return state;
      const outcome = { kind: "ok" as const, result: event.result };
      return state.minElapsed ? settle(state, outcome) : { ...state, pending: outcome };
    }

    case "failed": {
      if (state.phase !== "analyzing") return state;
      const outcome = { kind: "error" as const, error: event.error };
      return state.minElapsed ? settle(state, outcome) : { ...state, pending: outcome };
    }

    case "setGrams": {
      const grams = Math.max(1, Math.round(event.grams));
      return { ...state, items: state.items.map((i) => (i.key === event.key ? { ...i, grams } : i)) };
    }

    case "removeItem": {
      const items = state.items.filter((i) => i.key !== event.key);
      return { ...state, items, notFood: state.notFood };
    }

    case "addItem": {
      // Adding by hand also rescues the error state: there is something to save again.
      const phase = state.phase === "error" ? "results" : state.phase;
      return { ...state, phase, error: state.phase === "error" ? null : state.error, notFood: false, items: [...state.items, { ...event.item, key: event.key ?? nextKey("add") }] };
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
