import { describe, expect, it } from "vitest";
import { computeGoalPlan } from "../goal/plan";
import { goalDirectionOf, zGoal, zGoalInput, zGoalPlan, zGoalUpdate, zGoalView } from "./goal";
import { DEFAULT_GOAL_SETTINGS, zGoalSettings } from "./settings";

describe("zGoalInput (T7)", () => {
  it("legacy { targetBodyFatPct } still parses and is a cut", () => {
    const v = zGoalInput.parse({ targetBodyFatPct: 15 });
    expect(v.direction).toBeUndefined();
    expect(v.profile).toBe("optimal");
    expect(goalDirectionOf(v)).toBe("cut");
  });

  it("{ targetLeanGainKg } alone is a bulk", () => {
    const v = zGoalInput.parse({ targetLeanGainKg: 3 });
    expect(goalDirectionOf(v)).toBe("bulk");
  });

  it("explicit directions win", () => {
    expect(goalDirectionOf(zGoalInput.parse({ direction: "recomp", targetBodyFatPct: 15 }))).toBe("recomp");
    expect(goalDirectionOf(zGoalInput.parse({ direction: "bulk", targetLeanGainKg: 2, trainingLevel: "beginner" }))).toBe("bulk");
    // both targets without a direction → cut (the body-fat target decides)
    expect(goalDirectionOf({ targetBodyFatPct: 15, targetLeanGainKg: 2 })).toBe("cut");
    expect(goalDirectionOf({})).toBe("cut");
    expect(goalDirectionOf({ direction: null, targetLeanGainKg: 2, targetBodyFatPct: null })).toBe("bulk");
  });

  it("rejects a bulk without targetLeanGainKg", () => {
    const r = zGoalInput.safeParse({ direction: "bulk" });
    expect(r.success).toBe(false);
    expect(r.error!.issues.some((i) => i.path.join(".") === "targetLeanGainKg")).toBe(true);
    expect(zGoalInput.safeParse({ direction: "bulk", targetBodyFatPct: 15 }).success).toBe(false);
  });

  it("rejects cut / recomp without targetBodyFatPct", () => {
    for (const direction of ["cut", "recomp"] as const) {
      const r = zGoalInput.safeParse({ direction, targetLeanGainKg: 2 });
      expect(r.success).toBe(false);
      expect(r.error!.issues.some((i) => i.path.join(".") === "targetBodyFatPct")).toBe(true);
    }
    expect(zGoalInput.safeParse({}).success).toBe(false);
  });

  it("needs a direction when both targets are given", () => {
    expect(zGoalInput.safeParse({ targetBodyFatPct: 15, targetLeanGainKg: 2 }).success).toBe(false);
    expect(zGoalInput.safeParse({ direction: "recomp", targetBodyFatPct: 15, targetLeanGainKg: 2 }).success).toBe(true);
  });

  it("range checks", () => {
    expect(zGoalInput.safeParse({ targetLeanGainKg: 0.1 }).success).toBe(false);
    expect(zGoalInput.safeParse({ targetLeanGainKg: 30 }).success).toBe(false);
    expect(zGoalInput.safeParse({ targetBodyFatPct: 1 }).success).toBe(false);
    expect(zGoalInput.safeParse({ direction: "sideways", targetBodyFatPct: 15 }).success).toBe(false);
    expect(zGoalInput.safeParse({ targetBodyFatPct: 15, trainingLevel: "pro" }).success).toBe(false);
  });
});

describe("zGoalUpdate (T7)", () => {
  it("accepts any subset, including an empty patch, and adds no defaults", () => {
    expect(zGoalUpdate.parse({})).toEqual({});
    expect(zGoalUpdate.parse({ trainingLevel: "advanced" })).toEqual({ trainingLevel: "advanced" });
    expect(zGoalUpdate.parse({ direction: "bulk" })).toEqual({ direction: "bulk" }); // merged goal is validated by the service
    expect(zGoalUpdate.parse({ targetLeanGainKg: 4 })).toEqual({ targetLeanGainKg: 4 });
  });

  it("still range-checks the fields it gets", () => {
    expect(zGoalUpdate.safeParse({ targetLeanGainKg: 100 }).success).toBe(false);
    expect(zGoalUpdate.safeParse({ direction: "x" }).success).toBe(false);
  });
});

describe("zGoalPlan / zGoal — legacy data", () => {
  const plan = computeGoalPlan({
    sex: "male",
    weightKg: 100,
    bodyFatPct: 30,
    heightCm: 180,
    activityLevel: "moderate",
    targetBodyFatPct: 20,
    startDate: "2026-01-05",
    settings: DEFAULT_GOAL_SETTINGS,
  });

  function legacyPlan() {
    const { direction, targetLeanMassKg, leanGainKg, fatGainKg, ffmiStart, ffmiEnd, trainingLevel, ...rest } = plan;
    void [direction, targetLeanMassKg, leanGainKg, fatGainKg, ffmiStart, ffmiEnd, trainingLevel];
    return {
      ...rest,
      roadmap: rest.roadmap.map(({ startLeanMassKg, endLeanMassKg, ...w }) => (void [startLeanMassKg, endLeanMassKg], w)),
    };
  }

  it("a plan stored before T7 parses with direction 'cut'", () => {
    const parsed = zGoalPlan.parse(legacyPlan());
    expect(parsed.direction).toBe("cut");
    expect(parsed.leanGainKg).toBeUndefined();
    expect(parsed.roadmap[0].startLeanMassKg).toBeUndefined();
    expect(parsed.estimatedWeeks).toBe(plan.estimatedWeeks);
  });

  it("a current plan round-trips unchanged", () => {
    expect(zGoalPlan.parse(plan)).toEqual(plan);
  });

  it("a goal stored before T7 gets cut / null / [] defaults", () => {
    const g = zGoal.parse({
      id: "g1",
      status: "active",
      targetBodyFatPct: 20,
      profile: "optimal",
      start: { dateKey: "2026-01-05", weightKg: 100, bodyFatPct: 30, leanMassKg: 70, fatMassKg: 30, bodyEntryId: null },
      plan: legacyPlan(),
      tdeeOverride: null,
      createdAt: "2026-01-05T08:00:00.000Z",
      updatedAt: "2026-01-05T08:00:00.000Z",
      completedAt: null,
    });
    expect(g.direction).toBe("cut");
    expect(g.targetLeanGainKg).toBeNull();
    expect(g.trainingLevel).toBeNull();
    expect(g.adjustments).toEqual([]);
  });

  it("a view without feedback/adjustment defaults both to null", () => {
    const v = zGoalView.parse({ goal: null, progress: null });
    expect(v.feedback).toBeNull();
    expect(v.adjustment).toBeNull();
  });
});

describe("zGoalSettings — legacy settings", () => {
  it("fills muscle and adaptive from the defaults when missing", () => {
    const { muscle, adaptive, ...legacy } = DEFAULT_GOAL_SETTINGS;
    void [muscle, adaptive];
    const parsed = zGoalSettings.parse(legacy);
    expect(parsed.muscle).toEqual(DEFAULT_GOAL_SETTINGS.muscle);
    expect(parsed.adaptive).toEqual(DEFAULT_GOAL_SETTINGS.adaptive);
    expect(parsed).toEqual(DEFAULT_GOAL_SETTINGS);
  });

  it("the defaults themselves parse unchanged", () => {
    expect(zGoalSettings.parse(DEFAULT_GOAL_SETTINGS)).toEqual(DEFAULT_GOAL_SETTINGS);
  });

  it("rejects out-of-range muscle constants", () => {
    const bad = { ...DEFAULT_GOAL_SETTINGS, muscle: { ...DEFAULT_GOAL_SETTINGS.muscle, femaleRateFactor: 2 } };
    expect(zGoalSettings.safeParse(bad).success).toBe(false);
    const badAdaptive = { ...DEFAULT_GOAL_SETTINGS, adaptive: { ...DEFAULT_GOAL_SETTINGS.adaptive, cooldownDays: 1 } };
    expect(zGoalSettings.safeParse(badAdaptive).success).toBe(false);
  });
});
