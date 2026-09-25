import { DEFAULT_GOAL_SETTINGS, assessBody, navyBodyFat } from "@fitfloow/core";
import { emptyDraft, type OnboardingDraft } from "../../../src/features/onboarding/model";
import {
  assessmentFor,
  choiceTarget,
  goalBounds,
  planFor,
  plansByPace,
  recommendedChoice,
  resolvedGoal,
  setChoiceTarget,
  switchDirection,
} from "../../../src/features/onboarding/plan";

const TODAY = "2026-09-24";

function draft(over: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {
    ...emptyDraft(),
    account: { displayName: "Eren", username: "eren" },
    profile: { gender: "male", birthDate: "1994-04-12", heightCm: 180 },
    measurement: { weightKg: 92, neckCm: 40, waistCm: 96, hipCm: null },
    training: { activityLevel: "moderate", daysPerWeek: 3, experience: "under1" },
    ...over,
  };
}
const lean = () => draft({ measurement: { weightKg: 72, neckCm: 38, waistCm: 78, hipCm: null } });

describe("assessment", () => {
  test("is core's assessBody with the stated training level", () => {
    const bf = navyBodyFat({ gender: "male", heightCm: 180, neckCm: 40, waistCm: 96 });
    expect(assessmentFor(draft())).toEqual(assessBody({ sex: "male", weightKg: 92, heightCm: 180, bodyFatPct: bf!, trainingLevel: "beginner", settings: DEFAULT_GOAL_SETTINGS }));
  });

  test("is null until every input exists", () => {
    expect(assessmentFor(draft({ measurement: { weightKg: null, neckCm: 40, waistCm: 96, hipCm: null } }))).toBeNull();
    expect(assessmentFor(emptyDraft())).toBeNull();
  });
});

describe("recommendation → choice", () => {
  test("a high body fat is a cut to core's suggested target", () => {
    const a = assessmentFor(draft())!;
    expect(recommendedChoice(a)).toEqual({ direction: "cut", targetBodyFatPct: a.recommendation.targetBodyFatPct, targetLeanGainKg: null });
  });

  test("a lean lifter is a bulk with a lean-mass target", () => {
    const c = recommendedChoice(assessmentFor(lean())!);
    expect(c.direction).toBe("bulk");
    expect(c.targetLeanGainKg).toBeGreaterThan(0);
    expect(c.targetBodyFatPct).toBeNull();
  });

  test("resolvedGoal prefers what the user picked and falls back to the recommendation", () => {
    const d = draft();
    expect(resolvedGoal(d)).toEqual(recommendedChoice(assessmentFor(d)!));
    const picked = draft({ goal: { direction: "recomp", targetBodyFatPct: 19, targetLeanGainKg: null, profile: "optimal", skipped: false } });
    expect(resolvedGoal(picked)).toEqual({ direction: "recomp", targetBodyFatPct: 19, targetLeanGainKg: null });
  });
});

describe("bounds and targets", () => {
  test("cut and recomp: essential floor up to half a point under today", () => {
    const b = goalBounds("cut", assessmentFor(draft())!);
    expect(b.min).toBe(5);
    expect(b.max).toBeLessThan(assessmentFor(draft())!.bodyFatPct);
    expect(b.step).toBe(0.5);
    expect(goalBounds("recomp", assessmentFor(draft())!)).toEqual(b);
  });

  test("bulk: half a kilo up to what is left before the natural ceiling, capped", () => {
    const a = assessmentFor(lean())!;
    const b = goalBounds("bulk", a);
    expect(b.min).toBe(0.5);
    expect(b.max).toBeLessThanOrEqual(Math.min(12, a.leanToCeilingKg) + 1e-9);
    expect(b.step).toBe(0.5);
  });

  test("setting a target snaps to the grid and stays in bounds", () => {
    const a = assessmentFor(draft())!;
    const c = recommendedChoice(a);
    expect(choiceTarget(setChoiceTarget(c, 14.26, a))).toBe(14.5);
    expect(choiceTarget(setChoiceTarget(c, 1, a))).toBe(5);
    const bulk = switchDirection(c, "bulk", a);
    expect(choiceTarget(setChoiceTarget(bulk, 2.74, a))).toBe(2.5);
  });

  test("switching direction brings a sensible target for the new direction", () => {
    const a = assessmentFor(draft())!;
    const c = recommendedChoice(a);
    const bulk = switchDirection(c, "bulk", a);
    expect(bulk).toMatchObject({ direction: "bulk", targetBodyFatPct: null });
    expect(bulk.targetLeanGainKg).toBeGreaterThan(0);
    const recomp = switchDirection(c, "recomp", a);
    expect(recomp.direction).toBe("recomp");
    expect(recomp.targetBodyFatPct).toBeLessThan(a.bodyFatPct);
    expect(switchDirection(c, "cut", a)).toEqual(c);
  });
});

describe("live plan", () => {
  test("runs the real engine; the faster pace arrives sooner", () => {
    const d = draft();
    const c = resolvedGoal(d)!;
    const plans = plansByPace(d, c, TODAY);
    expect(plans.conservative!.estimatedWeeks).toBeGreaterThan(plans.aggressive!.estimatedWeeks);
    expect(plans.optimal!.direction).toBe("cut");
    expect(plans.optimal!.startKey).toBe(TODAY);
  });

  test("a bigger lean target takes longer", () => {
    const d = lean();
    const a = assessmentFor(d)!;
    const small = setChoiceTarget(switchDirection(recommendedChoice(a), "bulk", a), 1, a);
    const big = setChoiceTarget(small, 4, a);
    expect(planFor(d, big, "optimal", TODAY)!.estimatedWeeks).toBeGreaterThan(planFor(d, small, "optimal", TODAY)!.estimatedWeeks);
  });

  test("no plan while the inputs are incomplete", () => {
    expect(planFor(emptyDraft(), { direction: "cut", targetBodyFatPct: 15, targetLeanGainKg: null }, "optimal", TODAY)).toBeNull();
  });
});

describe("resolvedGoal with a direction but no number", () => {
  test("takes that direction's default target, so the step is never stuck", () => {
    const d = draft({ goal: { direction: "bulk", targetBodyFatPct: null, targetLeanGainKg: null, profile: "optimal", skipped: false } });
    const c = resolvedGoal(d)!;
    expect(c.direction).toBe("bulk");
    expect(c.targetLeanGainKg).toBeGreaterThan(0);
  });
});
