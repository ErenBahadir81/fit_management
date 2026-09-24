import { describe, expect, it } from "vitest";
import { MAX_DETECTION_ALTERNATIVES, zDetection, zScanResult, type FoodDTO } from "./index";

const food = (id: string, name: string): FoodDTO => ({
  id,
  name,
  nameEn: null,
  aliases: [],
  category: "yemek",
  per100g: { kcal: 200, protein: 10, carbs: 20, fat: 8 },
  defaultServingG: 150,
  servings: [],
  source: "seed",
  barcode: null,
  verified: true,
  popularity: 0,
});

const detection = { label: "lahmacun", labelTr: "Lahmacun", confidence: 0.42, food: food("f1", "Lahmacun"), suggestedGrams: 180 };
const alt = (id: string, confidence: number) => ({ label: id, labelTr: id, confidence, food: food(id, id), suggestedGrams: 100 });

describe("zDetection.alternatives (T6)", () => {
  it("is optional, so scans from before T6 still parse", () => {
    const parsed = zDetection.parse(detection);
    expect(parsed.alternatives).toBeUndefined();
    expect(zScanResult.parse({ scanId: "s", imageUrl: null, detections: [detection], mock: true, latencyMs: 1, modelVersion: "m" }).detections[0].alternatives).toBeUndefined();
  });

  it("carries up to three catalogue-mapped candidates", () => {
    const parsed = zDetection.parse({ ...detection, alternatives: [alt("pide", 0.31), alt("pizza", 0.2), alt("kebap", 0.05)] });
    expect(parsed.alternatives?.map((a) => a.label)).toEqual(["pide", "pizza", "kebap"]);
    expect(MAX_DETECTION_ALTERNATIVES).toBe(3);
  });

  it("rejects a fourth alternative and an alternative without a food", () => {
    expect(() => zDetection.parse({ ...detection, alternatives: [alt("a", 0.3), alt("b", 0.2), alt("c", 0.1), alt("d", 0.05)] })).toThrow();
    expect(() => zDetection.parse({ ...detection, alternatives: [{ ...alt("a", 0.3), food: null }] })).toThrow();
    expect(() => zDetection.parse({ ...detection, alternatives: [alt("a", 1.3)] })).toThrow();
  });
});
