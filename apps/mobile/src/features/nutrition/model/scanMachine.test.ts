import type { Detection, ScanResultDTO } from "@fitfloow/core";
import {
  MIN_ANALYZE_MS,
  SCAN_STATUS_LABELS,
  STATUS_STEP_MS,
  canSave,
  initialScanState,
  itemsFromDetections,
  mapScanError,
  scanReducer,
  scanTotals,
  statusIndexAt,
  type ScanState,
} from "./scanMachine";

const per100g = { kcal: 165, protein: 31, carbs: 0, fat: 3.6 };
const food = (id: string, name: string) => ({
  id,
  name,
  nameEn: name,
  aliases: [],
  category: "protein",
  per100g,
  defaultServingG: 150,
  servings: [],
  source: "seed" as const,
  barcode: null,
  verified: true,
  popularity: 5,
  brand: null,
});
const detection = (over: Partial<Detection> = {}): Detection => ({
  label: "chicken",
  labelTr: "Tavuk göğsü",
  confidence: 0.84,
  food: food("f_tavuk", "Tavuk göğsü"),
  suggestedGrams: 150,
  ...over,
});
const result = (over: Partial<ScanResultDTO> = {}): ScanResultDTO => ({
  scanId: "scan_1",
  imageUrl: null,
  detections: [detection()],
  mock: false,
  latencyMs: 120,
  modelVersion: "test",
  ...over,
});

const analyzing = (): ScanState => scanReducer(scanReducer(initialScanState("lunch"), { type: "shutter" }), { type: "captured", uri: "file://a.jpg", at: 1000 });

describe("scan state machine", () => {
  test("shutter → capturing → analyzing keeps the photo and resets the theatre", () => {
    const s = analyzing();
    expect(s.phase).toBe("analyzing");
    expect(s.photoUri).toBe("file://a.jpg");
    expect(s.startedAt).toBe(1000);
    expect(s.minElapsed).toBe(false);
    expect(s.statusIndex).toBe(0);
  });

  test("a fast API answer waits for the minimum theatre duration", () => {
    let s = analyzing();
    s = scanReducer(s, { type: "result", result: result() });
    expect(s.phase).toBe("analyzing"); // still thinking — the answer is parked
    expect(s.pending).not.toBeNull();

    s = scanReducer(s, { type: "minElapsed" });
    expect(s.phase).toBe("results");
    expect(s.pending).toBeNull();
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ name: "Tavuk göğsü", grams: 150, confidence: 0.84, foodId: "f_tavuk" });
  });

  test("a slow API answer resolves as soon as it lands (the theatre already finished)", () => {
    let s = analyzing();
    s = scanReducer(s, { type: "minElapsed" });
    expect(s.phase).toBe("analyzing");
    s = scanReducer(s, { type: "result", result: result({ mock: true }) });
    expect(s.phase).toBe("results");
    expect(s.mock).toBe(true);
  });

  test("the status label advances every 600 ms and holds on the last one", () => {
    expect(statusIndexAt(1000, 1000)).toBe(0);
    expect(statusIndexAt(1000, 1000 + STATUS_STEP_MS)).toBe(1);
    expect(statusIndexAt(1000, 1000 + 2 * STATUS_STEP_MS)).toBe(2);
    expect(statusIndexAt(1000, 1000 + 20 * STATUS_STEP_MS)).toBe(SCAN_STATUS_LABELS.length - 1);
    expect(SCAN_STATUS_LABELS.length * STATUS_STEP_MS).toBeLessThanOrEqual(MIN_ANALYZE_MS);

    let s = analyzing();
    s = scanReducer(s, { type: "tick", at: 1000 + STATUS_STEP_MS });
    expect(s.statusIndex).toBe(1);
    // ticks are ignored once the results are up
    s = scanReducer(scanReducer(s, { type: "minElapsed" }), { type: "result", result: result() });
    const after = scanReducer(s, { type: "tick", at: 99_999 });
    expect(after.statusIndex).toBe(s.statusIndex);
  });

  test("no detections → the friendly 'not food' state, not an error", () => {
    let s = analyzing();
    s = scanReducer(s, { type: "minElapsed" });
    s = scanReducer(s, { type: "result", result: result({ detections: [] }) });
    expect(s.phase).toBe("results");
    expect(s.notFood).toBe(true);
    expect(s.items).toHaveLength(0);
    expect(canSave(s)).toBe(false);
  });

  test("detections the API could not map to a food are dropped", () => {
    const items = itemsFromDetections([detection(), detection({ food: null, labelTr: "Bilinmeyen" })]);
    expect(items).toHaveLength(1);
  });

  test("a vision outage becomes an explained error state, never a crash", () => {
    let s = analyzing();
    s = scanReducer(s, { type: "failed", error: mapScanError({ status: 503, code: "VISION_UNAVAILABLE", message: "down" }) });
    expect(s.phase).toBe("analyzing"); // gated by the theatre as well
    s = scanReducer(s, { type: "minElapsed" });
    expect(s.phase).toBe("error");
    expect(s.error?.kind).toBe("visionUnavailable");
    expect(s.error?.message).toMatch(/ara/i);
  });

  test("searching a food by hand rescues the error state into the results sheet", () => {
    let s = analyzing();
    s = scanReducer(scanReducer(s, { type: "minElapsed" }), { type: "failed", error: mapScanError({ status: 503 }) });
    expect(s.phase).toBe("error");
    s = scanReducer(s, { type: "addItem", item: { name: "Mercimek çorbası", confidence: null, grams: 250, per100g: { kcal: 62, protein: 3.5, carbs: 9, fat: 1.4 }, foodId: "f_mercimek" } });
    expect(s.phase).toBe("results");
    expect(s.error).toBeNull();
    expect(canSave(s)).toBe(true);
  });

  test("error mapping covers offline, oversized and unknown failures", () => {
    expect(mapScanError({ status: 0 }).kind).toBe("network");
    expect(mapScanError({ status: 413 }).kind).toBe("tooLarge");
    expect(mapScanError({ status: 500 }).kind).toBe("unknown");
    expect(mapScanError(null).kind).toBe("unknown");
  });

  test("grams edits recompute the live totals; items can be removed and added", () => {
    let s = analyzing();
    s = scanReducer(scanReducer(s, { type: "minElapsed" }), { type: "result", result: result() });
    expect(scanTotals(s.items).kcal).toBe(248); // 150 g × 165/100

    s = scanReducer(s, { type: "setGrams", key: s.items[0].key, grams: 200 });
    expect(s.items[0].grams).toBe(200);
    expect(scanTotals(s.items).kcal).toBe(330);

    s = scanReducer(s, { type: "setGrams", key: s.items[0].key, grams: 0 });
    expect(s.items[0].grams).toBe(1); // never zero — the stepper floor

    s = scanReducer(s, { type: "addItem", item: { name: "Bulgur pilavı", confidence: null, grams: 150, per100g: { kcal: 120, protein: 3.5, carbs: 22, fat: 2 }, foodId: "f_bulgur" } });
    expect(s.items).toHaveLength(2);

    s = scanReducer(s, { type: "removeItem", key: s.items[0].key });
    expect(s.items).toHaveLength(1);
    expect(s.items[0].name).toBe("Bulgur pilavı");
  });

  test("save → saved is only reachable with at least one item", () => {
    let s = analyzing();
    s = scanReducer(scanReducer(s, { type: "minElapsed" }), { type: "result", result: result({ detections: [] }) });
    expect(scanReducer(s, { type: "save" }).phase).toBe("results"); // nothing to save

    s = scanReducer(s, { type: "addItem", item: { name: "Muz", confidence: null, grams: 120, per100g: { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3 }, foodId: "f_muz" } });
    expect(canSave(s)).toBe(true);
    s = scanReducer(s, { type: "save" });
    expect(s.phase).toBe("saving");
    expect(scanReducer(s, { type: "saved" }).phase).toBe("done");
  });

  test("a failed save returns to the results sheet with a message (edits kept)", () => {
    let s = analyzing();
    s = scanReducer(scanReducer(s, { type: "minElapsed" }), { type: "result", result: result() });
    s = scanReducer(s, { type: "setGrams", key: s.items[0].key, grams: 175 });
    s = scanReducer(s, { type: "save" });
    s = scanReducer(s, { type: "saveFailed", message: "Kaydedilemedi" });
    expect(s.phase).toBe("results");
    expect(s.items[0].grams).toBe(175);
    expect(s.error?.message).toBe("Kaydedilemedi");
    expect(scanReducer(s, { type: "dismissError" }).error).toBeNull();
  });

  test("retake clears everything but keeps the chosen meal", () => {
    let s = analyzing();
    s = scanReducer(scanReducer(s, { type: "minElapsed" }), { type: "result", result: result() });
    s = scanReducer(s, { type: "setMeal", meal: "dinner" });
    s = scanReducer(s, { type: "retake" });
    expect(s).toMatchObject({ phase: "camera", photoUri: null, items: [], meal: "dinner", error: null });
  });

  test("late events after the results are ignored (no flicker back to the theatre)", () => {
    let s = analyzing();
    s = scanReducer(scanReducer(s, { type: "minElapsed" }), { type: "result", result: result() });
    const same = scanReducer(s, { type: "result", result: result({ scanId: "scan_2" }) });
    expect(same.scanId).toBe("scan_1");
    expect(scanReducer(s, { type: "failed", error: mapScanError({ status: 500 }) }).phase).toBe("results");
  });
});
