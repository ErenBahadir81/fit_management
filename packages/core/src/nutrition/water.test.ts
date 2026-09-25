import { describe, expect, it } from "vitest";
import { WATER_DEFAULT_GOAL_ML, waterGoalMl, waterProgress } from "./water";

describe("waterGoalMl", () => {
  it("falls back to 2.5 L without a weight", () => {
    expect(waterGoalMl(null)).toBe(WATER_DEFAULT_GOAL_ML);
    expect(waterGoalMl(Number.NaN)).toBe(WATER_DEFAULT_GOAL_ML);
  });
  it("uses ~35 ml/kg rounded to whole glasses", () => {
    expect(waterGoalMl(80)).toBe(2750);
    expect(waterGoalMl(70)).toBe(2500);
  });
  it("stays inside 1.5 to 4 L", () => {
    expect(waterGoalMl(30)).toBe(1500);
    expect(waterGoalMl(200)).toBe(4000);
  });
});

describe("waterProgress", () => {
  it("clamps to 0..1", () => {
    expect(waterProgress(1250, 2500)).toBe(0.5);
    expect(waterProgress(5000, 2500)).toBe(1);
    expect(waterProgress(100, 0)).toBe(0);
  });
});
