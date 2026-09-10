import { describe, expect, it } from "vitest";
import { computeGoalPlan } from "../goal/index";
import { DEFAULT_MASCOT_MESSAGES } from "../mascot/catalog";
import type { GoalDTO } from "../schemas/goal";
import { DEFAULT_GOAL_SETTINGS } from "../schemas/settings";
import { shiftKey } from "../time/index";
import { buildWeeklyReport, summarizeWeeklyReport, type WeeklyReportContext } from "./weekly";

const S = DEFAULT_GOAL_SETTINGS;
const WEEK = "2026-09-06"; // Sunday
const keys = Array.from({ length: 7 }, (_, i) => shiftKey(WEEK, i));

const plan = computeGoalPlan({
  sex: "male",
  weightKg: 100,
  bodyFatPct: 30,
  heightCm: 180,
  age: null,
  activityLevel: "moderate",
  targetBodyFatPct: 20,
  profile: "optimal",
  startDate: WEEK,
  settings: S,
});

const goal: GoalDTO = {
  id: "g1",
  status: "active",
  targetBodyFatPct: 20,
  profile: "optimal",
  start: { dateKey: WEEK, weightKg: 100, bodyFatPct: 30, leanMassKg: 70, fatMassKg: 30, bodyEntryId: null },
  plan,
  tdeeOverride: null,
  createdAt: "2026-09-06T06:00:00.000Z",
  updatedAt: "2026-09-06T06:00:00.000Z",
  completedAt: null,
};

const muscles = [
  { key: "chest", name: "Göğüs", weeklyTarget: { min: 10, max: 20 } },
  { key: "back", name: "Sırt", weeklyTarget: { min: 10, max: 22 } },
];

function ctx(over: Partial<WeeklyReportContext> = {}): WeeklyReportContext {
  return {
    weekKey: WEEK,
    todayKey: shiftKey(WEEK, 6),
    measurementDay: 0,
    goal: null,
    weighIns: [],
    bodyEntries: [],
    logs: [],
    dayIntake: [],
    plannedSessions: 4,
    muscles,
    settings: S,
    catalog: DEFAULT_MASCOT_MESSAGES,
    seed: "u1",
    generatedAt: "2026-09-12T09:00:00.000Z",
    displayName: "Eren",
    ...over,
  };
}

const strengthLog = (dateKey: string, sets = 4) => ({
  dateKey,
  isOffDay: false,
  kind: "strength",
  strength: [
    { muscles: [{ key: "chest", load: 1 }], sets: Array.from({ length: sets }, () => ({})) },
    { muscles: [{ key: "back", load: 0.5 }], sets: Array.from({ length: sets }, () => ({})) },
  ],
  run: null,
  swim: null,
});

describe("buildWeeklyReport — empty week", () => {
  const r = buildWeeklyReport(ctx());

  it("returns zeros and a sleepy mascot", () => {
    expect(r.weekKey).toBe(WEEK);
    expect(r.startKey).toBe(WEEK);
    expect(r.endKey).toBe("2026-09-12");
    expect(r.nutrition.daysLogged).toBe(0);
    expect(r.nutrition.days).toHaveLength(7);
    expect(r.nutrition.deficitBankedKcal).toBe(0);
    expect(r.training.sessions).toBe(0);
    expect(r.body.weighInDays).toBe(0);
    expect(r.goal).toBeNull();
    expect(r.goalDistance).toBeNull();
    expect(r.score).toBe(0);
    expect(r.mascot.key).toBe("report.empty");
    expect(r.mascot.mood).toBe("sleepy");
    expect(r.mascot.text.length).toBeGreaterThan(0);
  });

  it("marks the week as current and reports today's index", () => {
    expect(r.isCurrent).toBe(true);
    expect(r.dayIndexToday).toBe(6);
  });

  it("a future week is neither current nor elapsed", () => {
    const f = buildWeeklyReport(ctx({ todayKey: "2026-09-01" }));
    expect(f.isCurrent).toBe(false);
    expect(f.dayIndexToday).toBeNull();
    expect(f.score).toBe(0);
  });
});

describe("buildWeeklyReport — nutrition", () => {
  const tdee = plan.roadmap[0].dailyCalorieTarget + plan.roadmap[0].weeklyDeficitKcal / 7;

  it("banks the deficit only on logged days", () => {
    const r = buildWeeklyReport(
      ctx({
        goal,
        dayIntake: [
          { dateKey: keys[0], kcal: 2000, protein: 150, entries: 3 },
          { dateKey: keys[1], kcal: 2200, protein: 160, entries: 4 },
          { dateKey: keys[2], kcal: 0, protein: 0, entries: 0 },
        ],
      })
    );
    expect(r.nutrition.daysLogged).toBe(2);
    expect(r.nutrition.totalKcal).toBe(4200);
    expect(r.nutrition.avgKcal).toBe(2100);
    expect(r.nutrition.avgProtein).toBe(155);
    expect(r.nutrition.deficitBankedKcal).toBe(Math.round(tdee - 2000) + Math.round(tdee - 2200));
    expect(r.nutrition.days[2].logged).toBe(false);
    expect(r.nutrition.days[2].deficit).toBe(0);
    expect(r.nutrition.fatEquivalentKg).toBeCloseTo(r.nutrition.deficitBankedKcal / 7700, 3);
  });

  it("planned deficit scales with elapsed days in a live week and is full for a past week", () => {
    const live = buildWeeklyReport(ctx({ goal, todayKey: shiftKey(WEEK, 2) }));
    expect(live.nutrition.deficitPlannedKcal).toBe(Math.round((plan.roadmap[0].weeklyDeficitKcal * 3) / 7));
    const past = buildWeeklyReport(ctx({ goal, todayKey: shiftKey(WEEK, 30) }));
    expect(past.nutrition.deficitPlannedKcal).toBe(plan.roadmap[0].weeklyDeficitKcal);
    expect(past.isCurrent).toBe(false);
  });

  it("ignores intake logged after today in a live week", () => {
    const r = buildWeeklyReport(
      ctx({ goal, todayKey: shiftKey(WEEK, 1), dayIntake: keys.map((dateKey) => ({ dateKey, kcal: 2000, entries: 2 })) })
    );
    expect(r.nutrition.daysLogged).toBe(2);
  });

  it("exposes the plan targets for the week", () => {
    const r = buildWeeklyReport(ctx({ goal }));
    expect(r.goal).toMatchObject({ targetBodyFatPct: 20, weekIndexInPlan: 1, plannedDailyTarget: plan.roadmap[0].dailyCalorieTarget });
    expect(r.nutrition.targetKcal).toBe(plan.roadmap[0].dailyCalorieTarget);
    expect(r.nutrition.proteinTarget).toBe(plan.roadmap[0].macros.protein);
  });

  it("uses the roadmap week matching the report week", () => {
    const third = buildWeeklyReport(ctx({ goal, weekKey: shiftKey(WEEK, 14), todayKey: shiftKey(WEEK, 20) }));
    expect(third.goal?.weekIndexInPlan).toBe(3);
    expect(third.nutrition.targetKcal).toBe(plan.roadmap[2].dailyCalorieTarget);
  });

  it("has no goal block for a week entirely before the goal started", () => {
    const before = buildWeeklyReport(ctx({ goal, weekKey: shiftKey(WEEK, -7), todayKey: shiftKey(WEEK, -1) }));
    expect(before.goal).toBeNull();
    expect(before.goalDistance).toBeNull();
  });
});

describe("buildWeeklyReport — body", () => {
  it("summarises weigh-ins and the EWMA trend", () => {
    const weighIns = keys.map((dateKey, i) => ({ dateKey, weightKg: 100 - i * 0.1 }));
    const r = buildWeeklyReport(ctx({ goal, weighIns }));
    expect(r.body.weighInDays).toBe(7);
    expect(r.body.weightStart).toBe(100);
    expect(r.body.weightEnd).toBeCloseTo(99.4, 2);
    expect(r.body.weightDelta).toBeCloseTo(-0.6, 2);
    expect(r.body.ewmaStart).toBe(100);
    expect(r.body.ewmaDelta).toBeLessThan(0);
    expect(r.body.expectedDelta).toBeCloseTo(plan.roadmap[0].endWeightKg - 100, 2);
  });

  it("carries measurements and waist", () => {
    const r = buildWeeklyReport(
      ctx({
        bodyEntries: [
          { dateKey: keys[0], weightKg: 100, bodyFatPct: 30, waistCm: 96 },
          { dateKey: keys[5], weightKg: 99.2, bodyFatPct: 29.1, waistCm: 95 },
        ],
      })
    );
    expect(r.body.hasMeasurement).toBe(true);
    expect(r.body.bodyFatStart).toBe(30);
    expect(r.body.bodyFatEnd).toBe(29.1);
    expect(r.body.waistStart).toBe(96);
    expect(r.body.waistEnd).toBe(95);
  });
});

describe("buildWeeklyReport — training", () => {
  it("counts sessions, sets, off days and per-muscle volume", () => {
    const r = buildWeeklyReport(
      ctx({
        logs: [
          strengthLog(keys[0]),
          strengthLog(keys[2]),
          { dateKey: keys[3], isOffDay: true, kind: "rest", strength: [], run: null, swim: null },
          { dateKey: keys[4], isOffDay: false, kind: "run", strength: [], run: { totalKm: 5.5 }, swim: null },
        ],
      })
    );
    expect(r.training.sessions).toBe(3);
    expect(r.training.offDays).toBe(1);
    expect(r.training.sets).toBe(16);
    expect(r.training.cardioKm).toBe(5.5);
    expect(r.training.volumeByMuscle).toEqual([
      { key: "chest", name: "Göğüs", done: 8, target: { min: 10, max: 20 }, status: "under" },
      { key: "back", name: "Sırt", done: 4, target: { min: 10, max: 22 }, status: "under" },
    ]);
  });

  it("flags over-volume and untrained muscles", () => {
    const r = buildWeeklyReport(ctx({ logs: [strengthLog(keys[0], 12), strengthLog(keys[2], 12)] }));
    expect(r.training.volumeByMuscle[0].status).toBe("over");
    const none = buildWeeklyReport(ctx());
    expect(none.training.volumeByMuscle[0].status).toBe("none");
  });

  it("ignores logs outside the week", () => {
    const r = buildWeeklyReport(ctx({ logs: [strengthLog(shiftKey(WEEK, -1)), strengthLog(shiftKey(WEEK, 7))] }));
    expect(r.training.sessions).toBe(0);
  });
});

describe("buildWeeklyReport — score, highlights and mascot", () => {
  const full = ctx({
    goal,
    dayIntake: keys.map((dateKey) => ({ dateKey, kcal: 2000, protein: 180, entries: 3 })),
    weighIns: keys.map((dateKey, i) => ({ dateKey, weightKg: 100 - i * 0.11 })),
    bodyEntries: [{ dateKey: keys[0], weightKg: 100, bodyFatPct: 30, waistCm: 96 }],
    logs: [strengthLog(keys[0]), strengthLog(keys[1]), strengthLog(keys[3]), strengthLog(keys[5])],
  });

  it("a strong week scores high and celebrates", () => {
    const r = buildWeeklyReport(full);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.mascot.key).toBe("report.perfectWeek");
    expect(r.highlights.length).toBeGreaterThan(2);
    expect(r.highlights[0]).toContain("antrenman");
    expect(r.highlights.some((h) => h.includes("kcal açık"))).toBe(true);
  });

  it("mascot follows the on-track verdict when the score is lower", () => {
    const weak = buildWeeklyReport(
      ctx({
        goal,
        dayIntake: [{ dateKey: keys[0], kcal: 3500, protein: 100, entries: 3 }],
        weighIns: keys.map((dateKey) => ({ dateKey, weightKg: 100 })),
        logs: [strengthLog(keys[0])],
      })
    );
    expect(weak.score).toBeLessThan(90);
    expect(["report.behind", "report.onTrack", "report.stalled", "report.ahead"]).toContain(weak.mascot.key);
    expect(weak.highlights.some((h) => h.includes("üstünde"))).toBe(true);
  });

  it("nudges the user to set a goal when there is none", () => {
    const r = buildWeeklyReport(ctx({ logs: [strengthLog(keys[0])] }));
    expect(r.mascot.key).toBe("goal.none");
  });

  it("is deterministic for the same seed", () => {
    expect(buildWeeklyReport(full)).toEqual(buildWeeklyReport(full));
  });
});

describe("summarizeWeeklyReport", () => {
  it("projects the fields the history chart needs", () => {
    const r = buildWeeklyReport(ctx({ goal, weighIns: keys.map((dateKey, i) => ({ dateKey, weightKg: 100 - i * 0.1 })) }));
    const s = summarizeWeeklyReport(r);
    expect(s).toMatchObject({ weekKey: WEEK, score: r.score, sessions: 0, daysLogged: 0 });
    expect(s.ewmaDelta).toBe(r.body.ewmaDelta);
    expect(s.onTrack).toBe(r.goalDistance?.onTrack);
  });
});
