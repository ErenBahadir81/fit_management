import { describe, expect, it } from "vitest";
import { clamp, ewma, hash32, mean, round, searchKey, slope, sum } from "./index";

describe("utils", () => {
  it("clamps", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
  it("rounds to digits", () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(3.14159, 1)).toBe(3.1);
    expect(round(2.5)).toBe(3);
  });
  it("hash32 is stable and spread", () => {
    expect(hash32("a")).toBe(hash32("a"));
    expect(hash32("a")).not.toBe(hash32("b"));
    expect(hash32("")).toBe(0x811c9dc5);
  });
  it("ewma seeds with first value and smooths", () => {
    expect(ewma([100, 110], 0.1)).toEqual([100, 101]);
    expect(ewma([], 0.5)).toEqual([]);
    expect(() => ewma([1], 0)).toThrow(RangeError);
  });
  it("slope of a line is its gradient", () => {
    expect(slope([1, 2, 3, 4])).toBeCloseTo(1);
    expect(slope([4, 3, 2, 1])).toBeCloseTo(-1);
    expect(slope([5])).toBe(0);
    expect(slope([2, 2, 2])).toBe(0);
  });
  it("sum/mean", () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([])).toBe(0);
  });
  it("searchKey folds Turkish characters", () => {
    expect(searchKey("İstanbul Köftesi")).toBe("istanbul koftesi");
    expect(searchKey("IŞIK ÇORBASI")).toBe("isik corbasi");
    expect(searchKey("Şeker-li Ğüzel")).toBe("seker li guzel");
  });
});
