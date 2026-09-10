import { describe, expect, it } from "vitest";
import { templateWeeklyVolume } from "./templateVolume";

describe("templateWeeklyVolume", () => {
  it("sums targetSets × load per muscle over the whole cycle", () => {
    const days = [
      {
        exercises: [
          { targetSets: 5, muscles: [{ key: "chest", load: 1 }, { key: "frontDelt", load: 0.5 }] },
          { targetSets: 4, muscles: [{ key: "chest", load: 1 }] },
        ],
      },
      { exercises: [{ targetSets: 3, muscles: [{ key: "frontDelt", load: 0.5 }] }] },
    ];
    expect(templateWeeklyVolume(days)).toEqual({ chest: 9, frontDelt: 4 });
  });

  it("treats a missing load as a full set and tolerates empty days", () => {
    const days = [{ exercises: [{ targetSets: 3, muscles: [{ key: "abs" }] }] }, { exercises: [] }, {}];
    expect(templateWeeklyVolume(days)).toEqual({ abs: 3 });
  });

  it("accepts the legacy string[] muscle shape", () => {
    expect(templateWeeklyVolume([{ exercises: [{ targetSets: 2, muscles: ["lats", "traps"] }] }])).toEqual({ lats: 2, traps: 2 });
  });

  it("rounds fractional loads to two decimals and ignores garbage", () => {
    const days = [
      { exercises: [{ targetSets: 3, muscles: [{ key: "legs", load: 0.333 }] }, { targetSets: 2, muscles: [] }] },
      { exercises: [{ muscles: [{ key: "legs", load: 1 }] }] },
    ];
    expect(templateWeeklyVolume(days)).toEqual({ legs: 1 });
    expect(templateWeeklyVolume([])).toEqual({});
  });
});
