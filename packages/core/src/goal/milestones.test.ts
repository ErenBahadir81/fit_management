/**
 * C4 — the plan in words a person understands. `estimatedWeeks` and `targetDate` never said
 * *when you get where*; milestones and `summaryTr` do.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_GOAL_SETTINGS } from "../schemas/settings";
import { computeGoalPlan } from "./plan";
import { etaLabelTr } from "./milestones";

const S = DEFAULT_GOAL_SETTINGS;
const eren = {
  sex: "male" as const,
  weightKg: 103,
  bodyFatPct: 10,
  heightCm: 186,
  age: null,
  activityLevel: "moderate" as const,
  targetBodyFatPct: 7,
  profile: "optimal" as const,
  startDate: "2026-09-06",
  settings: S,
};

describe("etaLabelTr", () => {
  it("reads like a person talking", () => {
    expect(etaLabelTr(0)).toBe("bu hafta");
    expect(etaLabelTr(1)).toBe("1 hafta sonra");
    expect(etaLabelTr(2)).toBe("2 hafta sonra");
    expect(etaLabelTr(10)).toBe("10 hafta sonra");
  });
  it("switches to months once weeks stop being readable", () => {
    expect(etaLabelTr(13)).toBe("3 ay sonra");
    expect(etaLabelTr(26)).toBe("6 ay sonra");
    expect(etaLabelTr(52)).toBe("12 ay sonra");
  });
  it("never says a negative or fractional number of weeks", () => {
    expect(etaLabelTr(-3)).toBe("bu hafta");
    expect(etaLabelTr(1.4)).toBe("1 hafta sonra");
    expect(etaLabelTr(Number.NaN)).toBe("bu hafta");
  });
});

describe("GoalPlan.milestones", () => {
  it("marks the quarter points of the journey, in order, on real roadmap dates", () => {
    const p = computeGoalPlan(eren);
    expect(p.milestones).toHaveLength(4);
    expect(p.milestones.map((m) => m.fraction)).toEqual([0.25, 0.5, 0.75, 1]);

    const dates = p.milestones.map((m) => m.dateKey);
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
    for (const m of p.milestones) {
      expect(p.roadmap.some((w) => w.endKey === m.dateKey)).toBe(true);
    }

    // Weight and body fat only ever go down, and the last one lands on the target.
    const weights = p.milestones.map((m) => m.weightKg);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
    const finalWeek = p.roadmap[p.roadmap.length - 1];
    const last = p.milestones[3];
    expect(last.dateKey).toBe(finalWeek.endKey);
    expect(last.weightKg).toBeCloseTo(finalWeek.endWeightKg, 1);
    expect(last.bodyFatPct).toBeCloseTo(7, 1);
  });

  it("labels each milestone by how far away it is", () => {
    const p = computeGoalPlan(eren);
    for (const m of p.milestones) expect(m.etaLabelTr).toMatch(/^(bu hafta|\d+ (hafta|ay) sonra)$/);
    expect(p.milestones[3].etaLabelTr).toBe(etaLabelTr(p.estimatedWeeks));
  });

  it("a plan shorter than four weeks gets fewer milestones, never a repeated date", () => {
    // ~0.9 kg to lose: three weeks of roadmap, so two quarter points land on the same week.
    const p = computeGoalPlan({ ...eren, weightKg: 80, bodyFatPct: 12, targetBodyFatPct: 11 });
    expect(p.estimatedWeeks).toBe(3);
    expect(p.milestones).toHaveLength(3);
    const dates = p.milestones.map((m) => m.dateKey);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toEqual(p.roadmap.map((w) => w.endKey));
    // The last one is still the finish line.
    expect(p.milestones[2]).toMatchObject({ fraction: 1, dateKey: p.roadmap[2].endKey, etaLabelTr: "3 hafta sonra" });
  });

  it("a one-week plan is a single milestone", () => {
    const p = computeGoalPlan({ ...eren, weightKg: 80, bodyFatPct: 12, targetBodyFatPct: 11.8 });
    expect(p.estimatedWeeks).toBe(1);
    expect(p.milestones).toHaveLength(1);
    expect(p.milestones[0]).toMatchObject({ fraction: 1, dateKey: p.roadmap[0].endKey, etaLabelTr: "1 hafta sonra" });
  });

  it("someone already at their target has no milestones to show", () => {
    const p = computeGoalPlan({ ...eren, targetBodyFatPct: 12 });
    expect(p.roadmap).toHaveLength(0);
    expect(p.milestones).toEqual([]);
  });

  it("a very long plan still gets four milestones, spoken in months", () => {
    const p = computeGoalPlan({ ...eren, weightKg: 120, bodyFatPct: 40, targetBodyFatPct: 6 });
    expect(p.warnings).toContain("LONG_HORIZON");
    expect(p.milestones).toHaveLength(4);
    expect(p.milestones[3].etaLabelTr).toMatch(/ay sonra$/);
    expect(new Set(p.milestones.map((m) => m.dateKey)).size).toBe(4);
  });

  it("is deterministic", () => {
    expect(computeGoalPlan(eren).milestones).toEqual(computeGoalPlan(eren).milestones);
  });
});

describe("GoalPlan.summaryTr", () => {
  it("says when you get where, in one plain sentence", () => {
    const p = computeGoalPlan(eren);
    expect(p.summaryTr).toMatch(/^\d{1,2} \p{Lu}\p{L}+'[dt][ae] ~\d+ kg ve %[\d,]+ yağ oranındasın — \d+ hafta, günde [\d.]+ kcal\.$/u);
    expect(p.summaryTr).toContain(`${p.estimatedWeeks} hafta`);
    // The weight quoted is where the roadmap actually ends, not the theoretical target weight —
    // a lean dieter gives up some lean tissue too, so the two are not the same number.
    expect(p.summaryTr).toContain(`~${Math.round(p.roadmap[p.roadmap.length - 1].endWeightKg)} kg`);
  });

  it("groups thousands the Turkish way", () => {
    const p = computeGoalPlan(eren);
    expect(p.initialDailyCalorieTarget).toBeGreaterThan(999);
    expect(p.summaryTr).toContain(`günde ${String(p.initialDailyCalorieTarget).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} kcal`);
  });

  it("uses the right Turkish locative for the month", () => {
    const jan = computeGoalPlan({ ...eren, startDate: "2026-01-04" });
    expect(jan.summaryTr).toMatch(/(Ocak|Şubat|Mart|Nisan)'[dt][ae]/);
    const may = computeGoalPlan({ ...eren, startDate: "2026-04-05" });
    expect(may.summaryTr).toMatch(/(Nisan'da|Mayıs'ta|Haziran'da|Temmuz'da)/);
  });

  it("tells someone already at their target that they are, instead of a date", () => {
    const p = computeGoalPlan({ ...eren, targetBodyFatPct: 12 });
    expect(p.summaryTr).toContain("zaten hedefindesin");
    expect(p.summaryTr).not.toMatch(/hafta,/);
    expect(p.summaryTr).toContain("kcal");
  });
});
