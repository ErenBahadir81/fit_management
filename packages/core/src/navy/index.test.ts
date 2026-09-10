import { describe, expect, it } from "vitest";
import { bodyComposition, bodyFatCategory, navyBodyFat } from "./index";

describe("navy body fat", () => {
  it("male reference: 178 cm, neck 38, waist 84 → ~15.6 %", () => {
    expect(navyBodyFat({ gender: "male", heightCm: 178, neckCm: 38, waistCm: 84 })).toBeCloseTo(15.6, 0);
  });
  it("female reference: 165 cm, neck 33, waist 72, hip 96 → ~24-26 %", () => {
    const bf = navyBodyFat({ gender: "female", heightCm: 165, neckCm: 33, waistCm: 72, hipCm: 96 });
    expect(bf).not.toBeNull();
    expect(bf!).toBeGreaterThan(22);
    expect(bf!).toBeLessThan(28);
  });
  it("rejects invalid inputs", () => {
    expect(navyBodyFat({ gender: "male", heightCm: 178, neckCm: 40, waistCm: 40 })).toBeNull();
    expect(navyBodyFat({ gender: "male", heightCm: 0, neckCm: 40, waistCm: 80 })).toBeNull();
    expect(navyBodyFat({ gender: "female", heightCm: 165, neckCm: 33, waistCm: 72 })).toBeNull();
  });
  it("clamps to [2, 60]", () => {
    expect(navyBodyFat({ gender: "male", heightCm: 178, neckCm: 38, waistCm: 200 })).toBe(60);
  });
  it("composition", () => {
    expect(bodyComposition(103, 10)).toEqual({ fatMassKg: 10.3, leanMassKg: 92.7 });
  });
  it("categories", () => {
    expect(bodyFatCategory("male", 5)).toBe("essential");
    expect(bodyFatCategory("male", 12)).toBe("athletic");
    expect(bodyFatCategory("male", 30)).toBe("high");
    expect(bodyFatCategory("female", 22)).toBe("fit");
  });
});
