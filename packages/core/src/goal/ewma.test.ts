import { describe, expect, it } from "vitest";
import { DEFAULT_GOAL_SETTINGS } from "../schemas/settings";
import { ewmaAt, ewmaChange, ewmaSlopePerWeek, ewmaTrend, latestTrendWeight } from "./ewma";

const E = DEFAULT_GOAL_SETTINGS.ewma;
const daily = (start: string, weights: number[]) =>
  weights.map((weightKg, i) => ({ dateKey: `2026-09-${String(Number(start.slice(-2)) + i).padStart(2, "0")}`, weightKg }));

describe("ewmaTrend", () => {
  it("returns an empty series for no points", () => {
    expect(ewmaTrend([], E)).toEqual([]);
  });

  it("seeds on the first point and stays flat for a constant weight", () => {
    const t = ewmaTrend(daily("01", [80, 80, 80, 80]), E);
    expect(t).toHaveLength(4);
    for (const p of t) expect(p.ewma).toBeCloseTo(80, 6);
    expect(t[0].ewma).toBe(80);
  });

  it("lags a step change by alpha (dense series → alpha 0.1)", () => {
    const weights = Array.from({ length: 40 }, (_, i) => (i === 0 ? 80 : 82));
    const t = ewmaTrend(
      weights.map((weightKg, i) => ({ dateKey: `2026-09-${String(1 + i).padStart(2, "0")}`.slice(0, 10), weightKg })).slice(0, 30),
      E
    );
    // 30 points over 29 days → 7.2/week → dense alpha 0.1
    expect(t[1].ewma).toBeCloseTo(80 + 0.1 * 2, 6);
    expect(t[2].ewma).toBeCloseTo(t[1].ewma + 0.1 * (82 - t[1].ewma), 6);
    expect(t[29].ewma).toBeGreaterThan(81.5);
    expect(t[29].ewma).toBeLessThan(82);
  });

  it("is time-aware: a 7-day gap moves the trend further than a 1-day gap", () => {
    const dense = ewmaTrend([{ dateKey: "2026-09-01", weightKg: 80 }, { dateKey: "2026-09-02", weightKg: 82 }], E);
    const sparse = ewmaTrend([{ dateKey: "2026-09-01", weightKg: 80 }, { dateKey: "2026-09-08", weightKg: 82 }], E);
    expect(sparse[1].ewma).toBeGreaterThan(dense[1].ewma);
    // both series are sparse → sparseAlpha 0.25 ; 7-day gap → 1 − 0.75^7
    expect(dense[1].ewma).toBeCloseTo(80 + 0.25 * 2, 6);
    expect(sparse[1].ewma).toBeCloseTo(80 + (1 - 0.75 ** 7) * 2, 6);
  });

  it("uses sparseAlpha when there are fewer than 5 weigh-ins per week", () => {
    const sparse = ewmaTrend(
      [
        { dateKey: "2026-09-01", weightKg: 80 },
        { dateKey: "2026-09-04", weightKg: 80 },
        { dateKey: "2026-09-08", weightKg: 82 },
      ],
      E
    );
    expect(sparse[2].ewma).toBeCloseTo(80 + (1 - 0.75 ** 4) * 2, 6);
  });

  it("rejects a spike beyond outlierRejectKg but keeps it in the raw series", () => {
    const t = ewmaTrend(
      [
        { dateKey: "2026-09-01", weightKg: 80 },
        { dateKey: "2026-09-02", weightKg: 80 },
        { dateKey: "2026-09-03", weightKg: 85 },
        { dateKey: "2026-09-04", weightKg: 80.2 },
      ],
      E
    );
    expect(t).toHaveLength(4);
    expect(t[2].outlier).toBe(true);
    expect(t[2].weightKg).toBe(85);
    expect(t[2].ewma).toBeCloseTo(80, 6); // trend untouched by the spike
    expect(t[3].outlier).toBe(false);
    expect(t[3].ewma).toBeGreaterThan(80);
    expect(t[3].ewma).toBeLessThan(80.2);
  });

  it("sorts and de-duplicates by dateKey (last value wins)", () => {
    const t = ewmaTrend(
      [
        { dateKey: "2026-09-03", weightKg: 81 },
        { dateKey: "2026-09-01", weightKg: 80 },
        { dateKey: "2026-09-03", weightKg: 82 },
      ],
      E
    );
    expect(t.map((p) => p.dateKey)).toEqual(["2026-09-01", "2026-09-03"]);
    expect(t[1].weightKg).toBe(82);
  });
});

describe("trend readers", () => {
  const t = ewmaTrend(daily("01", [80, 79.8, 79.6, 79.4, 79.2, 79, 78.8, 78.6]), E);

  it("ewmaAt returns the last value at or before a date", () => {
    expect(ewmaAt(t, "2026-09-01")).toBeCloseTo(80, 6);
    expect(ewmaAt(t, "2026-09-05")).toBeCloseTo(t[4].ewma, 6);
    expect(ewmaAt(t, "2026-09-30")).toBeCloseTo(t[7].ewma, 6);
    expect(ewmaAt(t, "2026-08-31")).toBeNull();
    expect(ewmaAt([], "2026-09-01")).toBeNull();
  });

  it("ewmaChange is end − start", () => {
    expect(ewmaChange(t, "2026-09-01", "2026-09-08")).toBeCloseTo(t[7].ewma - t[0].ewma, 6);
    expect(ewmaChange(t, "2026-08-01", "2026-09-08")).toBeNull();
  });

  it("latestTrendWeight returns the last trend value", () => {
    expect(latestTrendWeight(t)).toBeCloseTo(t[7].ewma, 6);
    expect(latestTrendWeight([])).toBeNull();
  });

  it("ewmaSlopePerWeek is negative while losing weight", () => {
    const s = ewmaSlopePerWeek(t, "2026-09-08", 28);
    expect(s).not.toBeNull();
    expect(s!).toBeLessThan(0);
    expect(s!).toBeGreaterThan(-2);
    expect(ewmaSlopePerWeek(t.slice(0, 1), "2026-09-08", 28)).toBeNull();
  });
});
