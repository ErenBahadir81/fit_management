import { describe, expect, it } from "vitest";
import { DEFAULT_GOAL_SETTINGS } from "../schemas/settings";
import { shiftKey } from "../time/index";
import { recalibrateTdee } from "./recalibrate";

const S = DEFAULT_GOAL_SETTINGS;
const S14 = { ...S, recalibration: { ...S.recalibration, windowDays: 14, dampingBeta: 0.5 } };

/** Linear decline so the EWMA trend slope equals the real slope once it has settled. */
function decliningWeighIns(fromKey: string, days: number, start: number, perDay: number) {
  return Array.from({ length: days }, (_, i) => ({ dateKey: shiftKey(fromKey, i), weightKg: start - perDay * i }));
}
const intakeDays = (fromKey: string, days: number, kcal: number) =>
  Array.from({ length: days }, (_, i) => ({ dateKey: shiftKey(fromKey, i), kcal, entries: 3 }));

describe("recalibrateTdee", () => {
  const todayKey = "2026-09-01";
  const startKey = "2026-07-20";

  it("measures TDEE from intake and trend change (2000 kcal, −0.5 kg over 14 d → 2275)", () => {
    const r = recalibrateTdee({
      startKey,
      tdeeFormula: 2500,
      tdeePrev: 2500,
      weighIns: decliningWeighIns("2026-07-01", 63, 85, 0.5 / 14),
      dayIntake: intakeDays("2026-07-20", 44, 2000),
      todayKey,
      settings: S14,
    });
    expect(r.applied).toBe(true);
    expect(r.daysUsed).toBe(14);
    expect(r.avgIntake).toBeCloseTo(2000, 6);
    expect(r.weightDeltaKg).toBeCloseTo(-0.5, 2);
    expect(r.tdeeObserved).toBeCloseTo(2275, -1);
    // β 0.5 blend against the previous estimate
    expect(r.tdeeUsed).toBeCloseTo(2387.5, -1);
    expect(r.reason).toBeNull();
  });

  it("uses the default damping (β 0.3) and clamps the weekly change to ±150 kcal", () => {
    const r = recalibrateTdee({
      startKey,
      tdeeFormula: 2500,
      tdeePrev: 2500,
      weighIns: decliningWeighIns("2026-07-01", 63, 85, 0.5 / 14),
      dayIntake: intakeDays("2026-07-20", 44, 1500),
      todayKey,
      settings: { ...S, recalibration: { ...S.recalibration, windowDays: 14 } },
    });
    // observed ≈ 1775 → 2500 + 0.3 × (1775 − 2500) = 2282.5, clamped to 2500 − 150
    expect(r.tdeeObserved).toBeCloseTo(1775, -1);
    expect(r.tdeeUsed).toBe(2350);
  });

  it("clamps an implausible observation to the sanity bounds around the formula TDEE", () => {
    const r = recalibrateTdee({
      startKey,
      tdeeFormula: 2500,
      tdeePrev: 2500,
      // huge intake with no weight change → absurdly high observed TDEE
      weighIns: decliningWeighIns("2026-07-01", 63, 85, 0),
      dayIntake: intakeDays("2026-07-20", 44, 6000),
      todayKey,
      settings: S14,
    });
    expect(r.tdeeObserved).toBe(2500 * 1.45);
    expect(r.tdeeUsed).toBe(2500 + 150); // still limited to +150/week
  });

  it("refuses when the settled window is shorter than minDays", () => {
    const r = recalibrateTdee({
      startKey: "2026-08-25",
      tdeeFormula: 2500,
      tdeePrev: 2500,
      weighIns: decliningWeighIns("2026-08-25", 8, 85, 0.03),
      dayIntake: intakeDays("2026-08-25", 8, 2000),
      todayKey,
      settings: S,
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toContain("gün");
    expect(r.tdeeUsed).toBe(2500);
    expect(r.tdeeObserved).toBeNull();
  });

  it("refuses when too few days have intake logged", () => {
    const r = recalibrateTdee({
      startKey,
      tdeeFormula: 2500,
      tdeePrev: 2500,
      weighIns: decliningWeighIns("2026-07-01", 63, 85, 0.03),
      dayIntake: intakeDays("2026-08-19", 6, 2000),
      todayKey,
      settings: S14,
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toContain("beslenme");
  });

  it("refuses when there is no weight trend in the window", () => {
    const r = recalibrateTdee({
      startKey,
      tdeeFormula: 2500,
      tdeePrev: 2500,
      weighIns: [],
      dayIntake: intakeDays("2026-07-20", 44, 2000),
      todayKey,
      settings: S14,
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toContain("tartı");
  });

  it("ignores days before the settling period", () => {
    // start 5 days ago → settlingDays 10 has not passed yet
    const r = recalibrateTdee({
      startKey: shiftKey(todayKey, -5),
      tdeeFormula: 2500,
      tdeePrev: 2500,
      weighIns: decliningWeighIns("2026-07-01", 63, 85, 0.03),
      dayIntake: intakeDays("2026-07-20", 44, 2000),
      todayKey,
      settings: S14,
    });
    expect(r.applied).toBe(false);
  });
});
