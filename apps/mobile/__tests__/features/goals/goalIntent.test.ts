import { computeGoalPlan, DEFAULT_GOAL_SETTINGS, shiftKey } from "@fitfloow/core";
import {
  INTENT_OPTIONS,
  PACE_OPTIONS,
  dateLocativeTr,
  etaBetweenTr,
  gainCalories,
  intentForGoal,
  maintenanceEnergy,
  milestonesOf,
  summaryOf,
} from "../../../src/features/goals/goalIntent";

/** A plan as it looked before C4 shipped `milestones` / `summaryTr` — the local fallback path. */
const preC4 = (over: Partial<typeof plan> = {}) => ({ ...plan, milestones: [], summaryTr: "", ...over });

const START = "2026-01-05";
const plan = computeGoalPlan({
  sex: "male",
  weightKg: 92,
  bodyFatPct: 24,
  heightCm: 180,
  age: 32,
  activityLevel: "moderate",
  targetBodyFatPct: 15,
  profile: "optimal",
  startDate: START,
  settings: DEFAULT_GOAL_SETTINGS,
  tdeeOverride: null,
});

describe("intent vocabulary", () => {
  test("three intents, each with a plain-Turkish promise", () => {
    expect(INTENT_OPTIONS.map((o) => o.value)).toEqual(["lose", "maintain", "gain"]);
    for (const o of INTENT_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(2);
      expect(o.body.length).toBeGreaterThan(10);
      expect(o.label).not.toMatch(/!/);
      expect(o.body).not.toMatch(/!/);
    }
  });

  test("pace is described by what it costs, not by a jargon word", () => {
    expect(PACE_OPTIONS.map((p) => p.value)).toEqual(["conservative", "optimal", "aggressive"]);
    for (const p of PACE_OPTIONS) expect(p.body.length).toBeGreaterThan(10);
  });

  test("an active fat-loss goal reads back as the 'lose' intent", () => {
    expect(intentForGoal({ targetBodyFatPct: 15 }, 24)).toBe("lose");
    expect(intentForGoal(null, 24)).toBe("maintain");
  });
});

describe("dateLocativeTr", () => {
  test("Turkish vowel harmony and consonant assimilation on every month", () => {
    const expected: Record<string, string> = {
      "2026-01-17": "17 Ocak'ta",
      "2026-02-03": "3 Şubat'ta",
      "2026-03-09": "9 Mart'ta",
      "2026-04-01": "1 Nisan'da",
      "2026-05-20": "20 Mayıs'ta",
      "2026-06-11": "11 Haziran'da",
      "2026-07-04": "4 Temmuz'da",
      "2026-08-30": "30 Ağustos'ta",
      "2026-09-14": "14 Eylül'de",
      "2026-10-02": "2 Ekim'de",
      "2026-11-25": "25 Kasım'da",
      "2026-12-31": "31 Aralık'ta",
    };
    for (const [key, want] of Object.entries(expected)) expect(dateLocativeTr(key)).toBe(want);
  });
});

describe("etaBetweenTr", () => {
  test("counts days up close and weeks further out", () => {
    expect(etaBetweenTr(START, START)).toBe("bugün");
    expect(etaBetweenTr(START, shiftKey(START, 1))).toBe("yarın");
    expect(etaBetweenTr(START, shiftKey(START, 4))).toBe("4 gün sonra");
    expect(etaBetweenTr(START, shiftKey(START, 28))).toBe("4 hafta sonra");
    expect(etaBetweenTr(START, shiftKey(START, 30))).toBe("4 hafta sonra");
  });
  test("a date already behind us is not 'sonra'", () => {
    expect(etaBetweenTr(START, shiftKey(START, -3))).toBe("geçti");
  });
});

describe("milestones", () => {
  test("the API's own milestones (C4) are used as-is", () => {
    expect(milestonesOf(plan)).toBe(plan.milestones);
    expect(plan.milestones.length).toBeGreaterThan(0);
  });

  test("a plan cached before C4 still gets a spine, in order, ending at the target", () => {
    const ms = milestonesOf(preC4());
    expect(ms.length).toBeGreaterThan(0);
    for (let i = 1; i < ms.length; i++) expect(ms[i].dateKey > ms[i - 1].dateKey).toBe(true);
    expect(ms[ms.length - 1].weightKg).toBeLessThanOrEqual(plan.targetWeightKg + 0.5);
    for (const m of ms) {
      expect(m.weightKg).toBeLessThanOrEqual(92);
      expect(m.etaLabelTr).toMatch(/bugün|yarın|gün sonra|hafta sonra|geçti/);
    }
  });

  test("an empty roadmap yields no milestones instead of throwing", () => {
    expect(milestonesOf(preC4({ roadmap: [] }))).toEqual([]);
  });
});

describe("summaryOf", () => {
  test("the API's own sentence (C4) is used as-is", () => {
    expect(summaryOf(plan)).toBe(plan.summaryTr);
    expect(plan.summaryTr).toContain("kcal");
  });

  test("a plan cached before C4 still reads as one sentence: date, body, duration, calories", () => {
    const s = summaryOf(preC4());
    const last = plan.roadmap[plan.roadmap.length - 1];
    expect(s).toContain(dateLocativeTr(last.endKey));
    expect(s).toContain("kg");
    expect(s).toContain("%");
    expect(s).toContain("hafta");
    expect(s).toContain("kcal");
    expect(s).not.toMatch(/!/);
  });

  test("a plan that goes nowhere says so rather than printing a broken sentence", () => {
    expect(summaryOf(preC4({ roadmap: [], estimatedWeeks: 0 }))).toBe("Bu hedef için bir plan çıkmadı.");
  });
});

describe("energy without a goal", () => {
  const body = { sex: "male" as const, weightKg: 92, bodyFatPct: 24, heightCm: 180, birthDate: "1994-01-05", activityLevel: "moderate" as const, todayKey: START };

  test("maintenance matches the engine's own BMR and TDEE for the same body", () => {
    const e = maintenanceEnergy(body);
    expect(Math.round(e.bmr)).toBe(Math.round(plan.bmr));
    expect(Math.round(e.maintenance)).toBe(Math.round(plan.tdeeFormula));
    expect(e.activityMultiplier).toBeCloseTo(1.55, 2);
    expect(e.leanMassKg).toBeCloseTo(69.9, 1);
  });

  test("lean gain is a small surplus over maintenance, rounded to something a person can hold", () => {
    const e = maintenanceEnergy(body);
    const gain = gainCalories(e.maintenance);
    expect(gain).toBeGreaterThan(e.maintenance);
    expect(gain - e.maintenance).toBeLessThan(400);
    expect(gain % 10).toBe(0);
  });
});
