import type { Detection, FoodDTO, ScanResultDTO } from "@fitfloow/core";
import {
  HANDFUL_G,
  UNSURE_BELOW,
  canSave,
  initialScanState,
  itemsFromDetections,
  mapScanError,
  portionPresets,
  scanReducer,
  scanTotals,
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

const analyzing = (): ScanState => scanReducer(scanReducer(initialScanState("lunch"), { type: "shutter" }), { type: "captured", uri: "file://a.jpg" });
const alternative = (id: string, name: string, confidence: number, over: Partial<FoodDTO> = {}) => ({ label: id, labelTr: name, confidence, food: { ...food(id, name), ...over }, suggestedGrams: 200 });

describe("scan state machine", () => {
  test("shutter → capturing → analyzing keeps the photo", () => {
    const s = analyzing();
    expect(s.phase).toBe("analyzing");
    expect(s.photoUri).toBe("file://a.jpg");
    expect(s.items).toEqual([]);
  });

  test("an API answer shows the results the moment it lands — no minimum theatre", () => {
    let s = analyzing();
    s = scanReducer(s, { type: "result", result: result({ mock: true }) });
    expect(s.phase).toBe("results");
    expect(s.mock).toBe(true);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ name: "Tavuk göğsü", grams: 150, confidence: 0.84, foodId: "f_tavuk", defaultServingG: 150, unsure: false, alternatives: [] });
  });

  test("no detections → the friendly 'not food' state, not an error", () => {
    let s = analyzing();
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
    expect(s.phase).toBe("error");
    expect(s.error?.kind).toBe("visionUnavailable");
    expect(s.error?.message).toMatch(/ara/i);
  });

  test("searching a food by hand rescues the error state into the results sheet", () => {
    let s = analyzing();
    s = scanReducer(s, { type: "failed", error: mapScanError({ status: 503 }) });
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
    s = scanReducer(s, { type: "result", result: result() });
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
    s = scanReducer(s, { type: "result", result: result({ detections: [] }) });
    expect(scanReducer(s, { type: "save" }).phase).toBe("results"); // nothing to save

    s = scanReducer(s, { type: "addItem", item: { name: "Muz", confidence: null, grams: 120, per100g: { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3 }, foodId: "f_muz" } });
    expect(canSave(s)).toBe(true);
    s = scanReducer(s, { type: "save" });
    expect(s.phase).toBe("saving");
    expect(scanReducer(s, { type: "saved" }).phase).toBe("done");
  });

  test("a failed save returns to the results sheet with a message (edits kept)", () => {
    let s = analyzing();
    s = scanReducer(s, { type: "result", result: result() });
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
    s = scanReducer(s, { type: "result", result: result() });
    s = scanReducer(s, { type: "setMeal", meal: "dinner" });
    s = scanReducer(s, { type: "retake" });
    expect(s).toMatchObject({ phase: "camera", photoUri: null, items: [], meal: "dinner", error: null });
  });

  test("a swiped-away results sheet goes back to the camera; the same event is ignored while saving or done", () => {
    let s = scanReducer(analyzing(), { type: "result", result: result() });
    s = scanReducer(s, { type: "setMeal", meal: "dinner" });
    expect(scanReducer(s, { type: "resultsDismissed" })).toMatchObject({ phase: "camera", items: [], photoUri: null, meal: "dinner" });
    const saving = scanReducer(s, { type: "save" });
    expect(scanReducer(saving, { type: "resultsDismissed" })).toBe(saving);
    const done = scanReducer(saving, { type: "saved" });
    expect(scanReducer(done, { type: "resultsDismissed" })).toBe(done);
  });

  test("late events after the results are ignored (no flicker back to the theatre)", () => {
    let s = analyzing();
    s = scanReducer(s, { type: "result", result: result() });
    const same = scanReducer(s, { type: "result", result: result({ scanId: "scan_2" }) });
    expect(same.scanId).toBe("scan_1");
    expect(scanReducer(s, { type: "failed", error: mapScanError({ status: 500 }) }).phase).toBe("results");
  });

  test("a low-confidence item asks “Bunu mu demek istedin?” with its alternatives; a confident one does not", () => {
    const items = itemsFromDetections([
      detection({ confidence: 0.84, alternatives: [alternative("f_kofte", "Köfte", 0.1)] }),
      detection({ label: "salad", labelTr: "Çoban salata", confidence: 0.41, food: food("f_salata", "Çoban salata"), alternatives: [alternative("f_cacik", "Cacık", 0.3), alternative("f_mercimek", "Mercimek", 0.1)] }),
      detection({ confidence: 0.3, alternatives: [] }),
    ]);
    expect(UNSURE_BELOW).toBe(0.5);
    expect(items.map((i) => i.unsure)).toEqual([false, true, false]); // nothing to offer → no question
    expect(items[1].alternatives.map((a) => [a.name, a.grams, a.foodId])).toEqual([
      ["Cacık", 200, "f_cacik"],
      ["Mercimek", 200, "f_mercimek"],
    ]);
  });

  test("an alternative that is the item's own food is never offered", () => {
    const [item] = itemsFromDetections([detection({ confidence: 0.3, alternatives: [alternative("f_tavuk", "Tavuk", 0.2)] })]);
    expect(item.alternatives).toEqual([]);
    expect(item.unsure).toBe(false);
  });

  test("picking an alternative swaps the food, grams and portions; the old guess stays one tap away", () => {
    let s = analyzing();
    s = scanReducer(s, {
      type: "result",
      result: result({ detections: [detection({ labelTr: "Çoban salata", confidence: 0.41, food: food("f_salata", "Çoban salata"), alternatives: [alternative("f_cacik", "Cacık", 0.3, { per100g: { kcal: 47, protein: 2.6, carbs: 3.5, fat: 2.3 }, servings: [{ label: "1 kase", grams: 200 }] })] })] }),
    });
    const key = s.items[0].key;
    s = scanReducer(s, { type: "pickAlternative", key, index: 0 });
    expect(s.items[0]).toMatchObject({ key, name: "Cacık", foodId: "f_cacik", grams: 200, confidence: 0.3, unsure: false, servings: [{ label: "1 kase", grams: 200 }] });
    expect(scanTotals(s.items).kcal).toBe(94);
    expect(s.items[0].alternatives.map((a) => a.name)).toEqual(["Çoban salata"]);
    // An index that does not exist changes nothing.
    expect(scanReducer(s, { type: "pickAlternative", key, index: 5 }).items[0].name).toBe("Cacık");
  });

  test("“Evet, bu” keeps the guess and stops asking", () => {
    let s = analyzing();
    s = scanReducer(s, { type: "result", result: result({ detections: [detection({ confidence: 0.3, alternatives: [alternative("f_kofte", "Köfte", 0.2)] })] }) });
    expect(s.items[0].unsure).toBe(true);
    s = scanReducer(s, { type: "confirmItem", key: s.items[0].key });
    expect(s.items[0]).toMatchObject({ unsure: false, name: "Tavuk göğsü" });
  });

  test("portion presets: a serving, half of it, 100 g, the food's own servings, each gram amount once", () => {
    const presets = portionPresets({ defaultServingG: 150, servings: [{ label: "1 porsiyon", grams: 150 }, { label: "1 dilim", grams: 30 }], category: "protein" });
    expect(presets.map((p) => [p.label, p.grams])).toEqual([
      ["1 porsiyon", 150],
      ["½ porsiyon", 75],
      ["100 g", 100],
      ["1 dilim", 30],
    ]);
  });

  test("portion presets: a handful for nuts and fruit, at most five chips", () => {
    const nuts = portionPresets({ defaultServingG: 40, servings: [], category: "Kuruyemiş" });
    expect(nuts.map((p) => p.label)).toEqual(["1 porsiyon", "½ porsiyon", "100 g", "Avuç"]);
    expect(nuts.at(-1)?.grams).toBe(HANDFUL_G);
    const many = portionPresets({ defaultServingG: 200, servings: [1, 2, 3, 4, 5].map((n) => ({ label: `${n} adet`, grams: n * 55 })), category: "meyve" });
    expect(many).toHaveLength(5);
    expect(portionPresets({ defaultServingG: 100, servings: [], category: null }).map((p) => p.grams)).toEqual([100, 50]);
  });
});
