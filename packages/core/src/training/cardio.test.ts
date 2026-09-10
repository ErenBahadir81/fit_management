import { describe, expect, it } from "vitest";
import { bestPace, buildCardioEntry, cardioTotals, nextCardioTarget } from "./cardio";

const target = (targetKm: number, targetMin: number) => ({ targetKm, targetMin, label: "Koşu" });

describe("bestPace / cardioTotals", () => {
  it("takes the fastest usable segment", () => {
    expect(bestPace([{ km: 5, min: 30 }, { km: 2, min: 10 }])).toBe(5);
  });
  it("ignores segments without distance or time", () => {
    expect(bestPace([{ km: 0, min: 20 }, { km: 3, min: 0 }])).toBeNull();
    expect(bestPace([])).toBeNull();
  });
  it("sums totals with 2-decimal rounding", () => {
    expect(cardioTotals([{ km: 2.55, min: 14.4 }, { km: 2.5, min: 15 }])).toEqual({ totalKm: 5.05, totalMin: 29.4 });
  });
});

describe("buildCardioEntry", () => {
  it("is null when nothing was actually done", () => {
    expect(buildCardioEntry([], 5, 30)).toBeNull();
    expect(buildCardioEntry([{ km: 0, min: 0 }], 5, 30)).toBeNull();
  });
  it("keeps the day's targets alongside the totals", () => {
    expect(buildCardioEntry([{ km: 5, min: 27 }], 5, 30)).toEqual({
      segments: [{ km: 5, min: 27 }],
      totalKm: 5,
      totalMin: 27,
      targetKm: 5,
      targetMin: 30,
    });
  });
  it("clamps insane values and drops empty segments", () => {
    const e = buildCardioEntry([{ km: 400, min: 5000 }, { km: 0, min: 0 }], 0, 0)!;
    expect(e.segments).toEqual([{ km: 200, min: 1440 }]);
  });
});

describe("nextCardioTarget", () => {
  it("pulls the target down to the achieved pace", () => {
    expect(nextCardioTarget(target(5, 30), { segments: [{ km: 5, min: 27 }] })).toMatchObject({ targetKm: 5, targetMin: 27 });
  });
  it("never makes the target worse after a slow session", () => {
    expect(nextCardioTarget(target(5, 30), { segments: [{ km: 5, min: 36 }] })).toMatchObject({ targetMin: 30 });
  });
  it("uses the best segment pace, not the average", () => {
    expect(nextCardioTarget(target(5, 30), { segments: [{ km: 1, min: 5 }, { km: 4, min: 26 }] })).toMatchObject({ targetMin: 25 });
  });
  it("refuses to go below the 3 min/km floor", () => {
    expect(nextCardioTarget(target(5, 30), { segments: [{ km: 5, min: 10 }] })).toMatchObject({ targetMin: 15 });
  });
  it("returns the target untouched when there is nothing to learn from", () => {
    const t = target(5, 30);
    expect(nextCardioTarget(t, null)).toBe(t);
    expect(nextCardioTarget(t, { segments: [] })).toBe(t);
    expect(nextCardioTarget(null, { segments: [{ km: 5, min: 20 }] })).toBeNull();
    expect(nextCardioTarget(target(0, 30), { segments: [{ km: 5, min: 20 }] })).toMatchObject({ targetMin: 30 });
  });
});
