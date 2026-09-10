import { describe, expect, it } from "vitest";
import { adherence, avgTotals, emptyTotals, entryTotals, remaining, sumTotals } from "./totals";

const chickenBreast = { kcal: 165, protein: 31, carbs: 0, fat: 3.6 };
const rice = { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 };

describe("entryTotals", () => {
  it("scales per-100 g values by grams", () => {
    expect(entryTotals(200, chickenBreast)).toEqual({ kcal: 330, protein: 62, carbs: 0, fat: 7.2 });
  });

  it("rounds kcal to integers and macros to one decimal", () => {
    expect(entryTotals(150, rice)).toEqual({ kcal: 195, protein: 4.1, carbs: 42, fat: 0.5 });
  });

  it("is exact at 100 g", () => {
    expect(entryTotals(100, chickenBreast)).toEqual({ kcal: 165, protein: 31, carbs: 0, fat: 3.6 });
  });

  it("returns zeros for non-positive or non-finite grams", () => {
    expect(entryTotals(0, chickenBreast)).toEqual(emptyTotals());
    expect(entryTotals(-5, chickenBreast)).toEqual(emptyTotals());
    expect(entryTotals(Number.NaN, chickenBreast)).toEqual(emptyTotals());
  });

  it("treats missing macro fields as zero", () => {
    expect(entryTotals(100, { kcal: 100 } as never)).toEqual({ kcal: 100, protein: 0, carbs: 0, fat: 0 });
  });
});

describe("sumTotals", () => {
  it("sums a list and rounds once at the end", () => {
    const a = entryTotals(150, rice); // 195 / 4.1 / 42 / 0.5
    const b = entryTotals(200, chickenBreast); // 330 / 62 / 0 / 7.2
    expect(sumTotals([a, b])).toEqual({ kcal: 525, protein: 66.1, carbs: 42, fat: 7.7 });
  });

  it("returns zeros for an empty list", () => {
    expect(sumTotals([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it("does not accumulate floating point noise", () => {
    const one = { kcal: 0.1, protein: 0.1, carbs: 0.1, fat: 0.1 };
    expect(sumTotals(Array.from({ length: 3 }, () => one))).toEqual({ kcal: 0, protein: 0.3, carbs: 0.3, fat: 0.3 });
  });
});

describe("avgTotals", () => {
  it("averages over the given divisor", () => {
    expect(avgTotals([{ kcal: 2000, protein: 100, carbs: 200, fat: 60 }, { kcal: 1000, protein: 50, carbs: 100, fat: 40 }], 2)).toEqual({
      kcal: 1500,
      protein: 75,
      carbs: 150,
      fat: 50,
    });
  });
  it("returns zeros when the divisor is 0", () => {
    expect(avgTotals([{ kcal: 100, protein: 1, carbs: 1, fat: 1 }], 0)).toEqual(emptyTotals());
  });
});

describe("remaining", () => {
  it("subtracts eaten from target", () => {
    const target = { calories: 2200, protein: 165, carbs: 220, fat: 70 };
    expect(remaining(target, { kcal: 525, protein: 66.1, carbs: 42, fat: 7.7 })).toEqual({
      kcal: 1675,
      protein: 98.9,
      carbs: 178,
      fat: 62.3,
    });
  });

  it("goes negative past the target", () => {
    const target = { calories: 500, protein: 10, carbs: 10, fat: 10 };
    expect(remaining(target, { kcal: 800, protein: 20, carbs: 30, fat: 25 })).toEqual({
      kcal: -300,
      protein: -10,
      carbs: -20,
      fat: -15,
    });
  });
});

describe("adherence", () => {
  const day = (kcal: number, logged = true) => ({ totals: { ...emptyTotals(), kcal }, logged });

  it("counts logged days within ±10 % of the target", () => {
    const days = [day(2000), day(2150), day(1850), day(2500), day(0, false)];
    // 2000 ✓, 2150 ✓ (< 2200), 1850 ✗ (< 1800? no → 1800 is the floor, 1850 ✓), 2500 ✗
    expect(adherence(days, 2000)).toBeCloseTo(3 / 4, 5);
  });

  it("is 0 when nothing is logged", () => {
    expect(adherence([day(0, false), day(0, false)], 2000)).toBe(0);
  });

  it("is 0 for a non-positive target", () => {
    expect(adherence([day(2000)], 0)).toBe(0);
  });

  it("honours a custom tolerance", () => {
    expect(adherence([day(2400)], 2000, 0.25)).toBe(1);
    expect(adherence([day(2400)], 2000, 0.1)).toBe(0);
  });

  it("includes the exact boundary", () => {
    expect(adherence([day(2200), day(1800)], 2000)).toBe(1);
  });
});
