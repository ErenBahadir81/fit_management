import { describe, expect, it } from "vitest";
import { DEFAULT_DIET_TARGET, autoDietTarget, katchMcArdleBmr, macrosFromCalories, maintenanceTarget, pickRoadmapWeek } from "./targets";

describe("katchMcArdleBmr", () => {
  it("uses 370 + 21.6 × lean mass", () => {
    expect(katchMcArdleBmr(65)).toBe(1774);
    expect(katchMcArdleBmr(50)).toBe(1450);
  });
  it("returns 0 for invalid lean mass", () => {
    expect(katchMcArdleBmr(0)).toBe(0);
    expect(katchMcArdleBmr(-3)).toBe(0);
    expect(katchMcArdleBmr(Number.NaN)).toBe(0);
  });
});

describe("macrosFromCalories", () => {
  it("fills carbs with what protein and fat leave over", () => {
    expect(macrosFromCalories(2750, 130, 0.25)).toEqual({ calories: 2750, protein: 130, carbs: 387, fat: 76 });
  });
  it("never returns negative carbs", () => {
    expect(macrosFromCalories(800, 200, 0.35).carbs).toBe(0);
  });
});

describe("maintenanceTarget", () => {
  it("is Katch-McArdle × the activity multiplier", () => {
    expect(maintenanceTarget({ leanMassKg: 65, activityMultiplier: 1.55 })).toEqual({
      calories: 2750,
      protein: 130,
      carbs: 387,
      fat: 76,
    });
  });
  it("accepts protein and fat overrides", () => {
    const t = maintenanceTarget({ leanMassKg: 60, activityMultiplier: 1.2, proteinGPerKgLean: 2.5, fatPctOfCalories: 0.3 })!;
    expect(t.protein).toBe(150);
    expect(t.calories).toBe(1999); // (370 + 1296) × 1.2 = 1999.2
    expect(t.fat).toBe(67);
  });
  it("returns null when lean mass is unknown", () => {
    expect(maintenanceTarget({ leanMassKg: 0, activityMultiplier: 1.55 })).toBeNull();
  });
});

describe("autoDietTarget", () => {
  it("prefers the goal plan macros", () => {
    const t = autoDietTarget({ goalMacros: { calories: 2100, protein: 180, carbs: 190, fat: 58 } });
    expect(t).toEqual({ mode: "auto", calories: 2100, protein: 180, carbs: 190, fat: 58, derivedFrom: "goal" });
  });

  it("falls back to maintenance when there is no goal", () => {
    const t = autoDietTarget({ goalMacros: null, maintenance: { leanMassKg: 65, activityMultiplier: 1.55 } });
    expect(t).toMatchObject({ mode: "auto", calories: 2750, derivedFrom: "maintenance" });
  });

  it("falls back to the defaults when there is neither", () => {
    expect(autoDietTarget({})).toEqual(DEFAULT_DIET_TARGET);
    expect(DEFAULT_DIET_TARGET).toEqual({ mode: "auto", calories: 2000, protein: 150, carbs: 200, fat: 65, derivedFrom: "default" });
  });

  it("ignores a goal plan with no calories", () => {
    const t = autoDietTarget({ goalMacros: { calories: 0, protein: 0, carbs: 0, fat: 0 } });
    expect(t.derivedFrom).toBe("default");
  });

  it("rounds goal macros to whole numbers", () => {
    const t = autoDietTarget({ goalMacros: { calories: 2100.4, protein: 179.6, carbs: 190.2, fat: 58.5 } });
    expect(t).toMatchObject({ calories: 2100, protein: 180, carbs: 190, fat: 59 });
  });
});

describe("pickRoadmapWeek", () => {
  const roadmap = [
    { weekIndex: 1, startKey: "2026-09-06", endKey: "2026-09-12" },
    { weekIndex: 2, startKey: "2026-09-13", endKey: "2026-09-19" },
    { weekIndex: 3, startKey: "2026-09-20", endKey: "2026-09-26" },
  ];

  it("finds the week containing the date", () => {
    expect(pickRoadmapWeek(roadmap, "2026-09-15")?.weekIndex).toBe(2);
    expect(pickRoadmapWeek(roadmap, "2026-09-06")?.weekIndex).toBe(1);
    expect(pickRoadmapWeek(roadmap, "2026-09-26")?.weekIndex).toBe(3);
  });

  it("clamps before the plan to the first week and after it to the last", () => {
    expect(pickRoadmapWeek(roadmap, "2026-01-01")?.weekIndex).toBe(1);
    expect(pickRoadmapWeek(roadmap, "2027-01-01")?.weekIndex).toBe(3);
  });

  it("returns null for an empty roadmap", () => {
    expect(pickRoadmapWeek([], "2026-09-15")).toBeNull();
  });
});
