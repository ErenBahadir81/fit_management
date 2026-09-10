import { computeGoalPlan, DEFAULT_GOAL_SETTINGS, shiftKey, type BodyTrends, type GoalDTO } from "@fitfloow/core";
import { defaultTarget, instantPlan, planChartRows, roadmapRows, snapTarget, targetBounds, PROFILE_OPTIONS, WARNING_TR, TARGET_STEP } from "../../../src/features/goals/goalMath";
import { createFakeApi } from "../../../src/lib/fake";

const TODAY = "2026-09-10";

describe("target bounds + snapping (slider)", () => {
  test("min is the essential-fat floor per sex, max sits one step below the current bf", () => {
    expect(targetBounds("male", 18)).toEqual({ min: 5, max: 17.5 });
    expect(targetBounds("female", 27.3)).toEqual({ min: 12, max: 26.5 });
    expect(targetBounds("female", 27.5)).toEqual({ min: 12, max: 27 });
  });

  test("when the user is already at/below the floor the range collapses (max = min)", () => {
    expect(targetBounds("male", 5.2)).toEqual({ min: 5, max: 5 });
    expect(targetBounds("male", 4)).toEqual({ min: 5, max: 5 });
  });

  test("snapTarget rounds to 0.5 and clamps to the bounds", () => {
    const b = { min: 5, max: 17.5 };
    expect(TARGET_STEP).toBe(0.5);
    expect(snapTarget(12.3, b)).toBe(12.5);
    expect(snapTarget(12.24, b)).toBe(12);
    expect(snapTarget(12.75, b)).toBe(13);
    expect(snapTarget(3, b)).toBe(5);
    expect(snapTarget(40, b)).toBe(17.5);
    expect(snapTarget(Number.NaN, b)).toBe(5);
  });

  test("defaultTarget proposes ~5 points below the current bf, never past the floor", () => {
    expect(defaultTarget("male", 18)).toBe(13);
    expect(defaultTarget("male", 18.3)).toBe(13.5);
    expect(defaultTarget("male", 7)).toBe(5);
    expect(defaultTarget("female", 20)).toBe(15);
  });

  test("profiles and warnings have Turkish copy", () => {
    expect(PROFILE_OPTIONS.map((p) => p.value)).toEqual(["conservative", "optimal", "aggressive"]);
    for (const p of PROFILE_OPTIONS) expect(p.hint.length).toBeGreaterThan(10);
    expect(WARNING_TR.FLOOR_LIMITED.tone).toBe("warning");
    expect(WARNING_TR.TARGET_TOO_LOW.tone).toBe("danger");
  });
});

describe("instantPlan (client-side preview)", () => {
  const input = { sex: "male" as const, weightKg: 81, bodyFatPct: 18, heightCm: 180, birthDate: "1996-04-12", activityLevel: "moderate" as const, targetBodyFatPct: 13, profile: "optimal" as const, todayKey: TODAY };

  test("is the core engine with default settings and the user's age", () => {
    const plan = instantPlan(input);
    const core = computeGoalPlan({ sex: "male", weightKg: 81, bodyFatPct: 18, heightCm: 180, age: 30, activityLevel: "moderate", targetBodyFatPct: 13, profile: "optimal", startDate: TODAY, settings: DEFAULT_GOAL_SETTINGS });
    expect(plan).toEqual(core);
    expect(plan.fatToLoseKg).toBeGreaterThan(3);
    expect(plan.roadmap.length).toBeGreaterThan(4);
    expect(plan.targetDate).toBe(shiftKey(TODAY, 7 * plan.estimatedWeeks));
  });

  test("a target above the current bf yields the warning and an empty roadmap", () => {
    const plan = instantPlan({ ...input, targetBodyFatPct: 20 });
    expect(plan.warnings).toContain("TARGET_ABOVE_CURRENT");
    expect(plan.roadmap).toHaveLength(0);
  });
});

describe("roadmap rows + plan chart rows", () => {
  let goal: GoalDTO;
  let trends: BodyTrends;
  beforeAll(async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true, today: () => TODAY });
    goal = (await api.goals.current()).goal!;
    trends = await api.body.trends(180);
  });

  test("marks the current week, and past weeks carry the actual trend delta vs expected", () => {
    const rows = roadmapRows(goal, trends, TODAY);
    expect(rows).toHaveLength(goal.plan.roadmap.length);
    const current = rows.filter((r) => r.state === "current");
    expect(current).toHaveLength(1);
    expect(current[0].week.weekIndex).toBe(5); // started 28 days ago → 5th plan week
    const past = rows.filter((r) => r.state === "past");
    expect(past).toHaveLength(4);
    for (const r of past) {
      expect(r.actualEndKg).not.toBeNull();
      expect(r.deltaVsExpectedKg).not.toBeNull();
    }
    const future = rows.filter((r) => r.state === "future");
    expect(future.every((r) => r.actualEndKg === null)).toBe(true);
  });

  test("chart rows run day by day from the plan start to the target date with expected + actual", () => {
    const rows = planChartRows(goal, trends, TODAY);
    expect(rows[0].dateKey).toBe(goal.plan.startKey);
    expect(rows[0].expected).toBeCloseTo(goal.plan.roadmap[0].startWeightKg, 1);
    expect(rows[rows.length - 1].dateKey).toBe(goal.plan.targetDate);
    const withActual = rows.filter((r) => r.actual !== null);
    expect(withActual.length).toBeGreaterThan(10);
    expect(withActual.every((r) => r.dateKey <= TODAY)).toBe(true);
    // expected line is monotonic non-increasing
    for (let i = 1; i < rows.length; i++) expect(rows[i].expected).toBeLessThanOrEqual(rows[i - 1].expected + 1e-9);
  });
});
