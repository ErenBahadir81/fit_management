import { describe, expect, it } from "vitest";
import { formatLoad, loadDiffers, parseLoadInput, snapLoad, toMusclePayload } from "./muscleLoad";

describe("muscle load helpers", () => {
  it("snaps to the 0.05 grid inside 0–1", () => {
    expect(snapLoad(0.33)).toBe(0.35);
    expect(snapLoad(0.324)).toBe(0.3);
    expect(snapLoad(0.975)).toBe(1);
    expect(snapLoad(1.4)).toBe(1);
    expect(snapLoad(-0.2)).toBe(0);
    expect(snapLoad(0.1 + 0.2)).toBe(0.3); // no float noise
    expect(snapLoad(Number.NaN)).toBe(0);
  });

  it("reads what people type, with a comma or a dot", () => {
    expect(parseLoadInput("0,35")).toBe(0.35);
    expect(parseLoadInput(" .5 ")).toBe(0.5);
    expect(parseLoadInput("1")).toBe(1);
    expect(parseLoadInput("0,")).toBe(0);
    expect(parseLoadInput("")).toBeNull();
    expect(parseLoadInput("abc")).toBeNull();
    expect(parseLoadInput("1,5")).toBeNull(); // out of range is not a load
    expect(parseLoadInput("-0,1")).toBeNull();
  });

  it("writes loads the Turkish way with at most two decimals", () => {
    expect(formatLoad(0.95)).toBe("0,95");
    expect(formatLoad(0.5)).toBe("0,5");
    expect(formatLoad(1)).toBe("1");
    expect(formatLoad(0.05)).toBe("0,05");
  });

  it("builds the API payload in muscle order, without zero pairs or float noise", () => {
    const order = ["chest", "frontDelt", "triceps", "legs"];
    expect(toMusclePayload({ triceps: 0.1 + 0.2, chest: 0.95, frontDelt: 0, legs: 1, zzz: 0.5 }, order)).toEqual([
      { key: "chest", load: 0.95 },
      { key: "triceps", load: 0.3 },
      { key: "legs", load: 1 },
      { key: "zzz", load: 0.5 },
    ]);
  });

  it("tells whether a value moved off the literature value", () => {
    expect(loadDiffers(0.95, 0.95)).toBe(false);
    expect(loadDiffers(0.1 + 0.2, 0.3)).toBe(false);
    expect(loadDiffers(0.9, 0.95)).toBe(true);
    expect(loadDiffers(undefined, 0.3)).toBe(true);
  });
});
