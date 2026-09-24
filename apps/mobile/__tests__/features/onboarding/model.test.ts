import { navyBodyFat } from "@fitfloow/core";
import {
  STAGE_COUNT,
  STEP_ORDER,
  bodyFatFor,
  canGoBackTo,
  emptyDraft,
  fieldErrors,
  firstIncompleteStep,
  measurementFields,
  measuredCount,
  nextStep,
  onboardingPayload,
  prevStep,
  resumeStep,
  stageOf,
  stepReady,
  type OnboardingDraft,
} from "../../../src/features/onboarding/model";

function filled(over: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {
    ...emptyDraft(),
    account: { displayName: "Eren Bahadır", username: "eren" },
    profile: { gender: "male", birthDate: "1994-04-12", heightCm: 180 },
    measurement: { weightKg: 92, neckCm: 40, waistCm: 96, hipCm: null },
    training: { activityLevel: "moderate", daysPerWeek: 3, experience: "under1" },
    goal: { direction: "cut", targetBodyFatPct: 15, targetLeanGainKg: null, profile: "optimal", skipped: false },
    ...over,
  };
}

describe("step machine", () => {
  test("a welcome door, the seven-stage session, and the finish", () => {
    expect(STEP_ORDER).toEqual(["welcome", "hello", "account", "body", "measure", "training", "assessment", "goal", "done"]);
    expect(STAGE_COUNT).toBe(7);
  });

  test("the progress bar counts seven stages; hello and account share the first", () => {
    expect(stageOf("welcome")).toBe(0);
    expect(stageOf("hello")).toBe(1);
    expect(stageOf("account")).toBe(1);
    expect(stageOf("body")).toBe(2);
    expect(stageOf("measure")).toBe(3);
    expect(stageOf("training")).toBe(4);
    expect(stageOf("assessment")).toBe(5);
    expect(stageOf("goal")).toBe(6);
    expect(stageOf("done")).toBe(7);
  });

  test("next and previous stop at the ends", () => {
    expect(nextStep("welcome")).toBe("hello");
    expect(nextStep("goal")).toBe("done");
    expect(nextStep("done")).toBe("done");
    expect(prevStep("hello")).toBe("welcome");
    expect(prevStep("welcome")).toBeNull();
  });
});

describe("field errors", () => {
  test("hello asks for a name only; a single letter is not a name", () => {
    expect(fieldErrors("hello", emptyDraft(), "").displayName).toBeTruthy();
    expect(fieldErrors("hello", { ...emptyDraft(), account: { displayName: "E", username: "" } }, "").displayName).toBeTruthy();
    expect(stepReady("hello", { ...emptyDraft(), account: { displayName: "Eren", username: "" } }, "")).toBe(true);
  });

  test("an empty draft cannot leave the account step, and each field says what is wrong", () => {
    const d = emptyDraft();
    expect(stepReady("account", d, "")).toBe(false);
    const e = fieldErrors("account", d, "");
    expect(e.username).toBeTruthy();
    expect(e.password).toBeTruthy();
  });

  test("username rules are the API's own: 3-32 chars, letters digits dot underscore", () => {
    const d = emptyDraft();
    const err = (username: string) => fieldErrors("account", { ...d, account: { displayName: "Eren", username } }, "aaaaaaaa").username;
    expect(err("er")).toBeTruthy();
    expect(err("eren bahadir")).toBeTruthy();
    expect(err("eren@x")).toBeTruthy();
    expect(err("eren_b.1")).toBeUndefined();
  });

  test("a password under eight characters is refused before the request is made", () => {
    const d = { ...emptyDraft(), account: { displayName: "Eren", username: "eren" } };
    expect(fieldErrors("account", d, "1234567").password).toBeTruthy();
    expect(fieldErrors("account", d, "12345678").password).toBeUndefined();
  });

  test("body needs sex, birth date and height, and an implausible age or height is caught", () => {
    const d = filled({ profile: { gender: null, birthDate: null, heightCm: null } });
    expect(Object.keys(fieldErrors("body", d, "")).sort()).toEqual(["birthDate", "gender", "heightCm"]);
    expect(fieldErrors("body", filled({ profile: { ...filled().profile, birthDate: "2024-01-01" } }), "").birthDate).toBeTruthy();
    expect(fieldErrors("body", filled({ profile: { ...filled().profile, heightCm: 60 } }), "").heightCm).toBeTruthy();
  });

  test("women need a hip measurement, men do not", () => {
    const women = filled({ profile: { ...filled().profile, gender: "female" }, measurement: { weightKg: 62, neckCm: 32, waistCm: 72, hipCm: null } });
    expect(fieldErrors("measure", women, "").hipCm).toBeTruthy();
    expect(stepReady("measure", women, "")).toBe(false);
    expect(stepReady("measure", { ...women, measurement: { ...women.measurement, hipCm: 96 } }, "")).toBe(true);
    expect(fieldErrors("measure", filled(), "").hipCm).toBeUndefined();
    expect(measurementFields("female")).toEqual(["weightKg", "neckCm", "waistCm", "hipCm"]);
    expect(measurementFields("male")).toEqual(["weightKg", "neckCm", "waistCm"]);
  });

  test("a waist that is not wider than the neck cannot produce a body-fat estimate", () => {
    const d = filled({ measurement: { weightKg: 92, neckCm: 40, waistCm: 38, hipCm: null } });
    expect(fieldErrors("measure", d, "").waistCm).toBeTruthy();
  });

  test("the ring counts only measurements that are in range", () => {
    expect(measuredCount(filled({ measurement: { weightKg: null, neckCm: null, waistCm: null, hipCm: null } }))).toBe(0);
    expect(measuredCount(filled({ measurement: { weightKg: 92, neckCm: 400, waistCm: null, hipCm: null } }))).toBe(1);
    expect(measuredCount(filled())).toBe(3);
  });

  test("training needs activity, weekly days and experience", () => {
    const d = filled({ training: { activityLevel: null, daysPerWeek: null, experience: null } });
    expect(Object.keys(fieldErrors("training", d, "")).sort()).toEqual(["activityLevel", "daysPerWeek", "experience"]);
    expect(stepReady("training", filled(), "")).toBe(true);
  });

  test("the goal step is ready with the recommended plan, a chosen plan, or an explicit skip", () => {
    const none = filled({ goal: { direction: null, targetBodyFatPct: null, targetLeanGainKg: null, profile: "optimal", skipped: false } });
    expect(stepReady("goal", none, "")).toBe(true); // Floo's recommendation is on screen, waiting to be accepted
    const tooLow = filled({ goal: { ...filled().goal, targetBodyFatPct: 2 } });
    expect(fieldErrors("goal", tooLow, "").target).toBeTruthy();
    const above = filled({ goal: { ...filled().goal, targetBodyFatPct: 40 } });
    expect(fieldErrors("goal", above, "").target).toBeTruthy();
    expect(stepReady("goal", { ...tooLow, goal: { ...tooLow.goal, skipped: true } }, "")).toBe(true);
  });

  test("a complete draft is ready at every step", () => {
    const d = filled();
    for (const s of STEP_ORDER) expect({ s, ready: stepReady(s, d, "sifre1234") }).toEqual({ s, ready: true });
  });
});

describe("body fat estimate", () => {
  test("appears the instant the last measurement lands, and matches the Navy formula", () => {
    const d = filled();
    expect(bodyFatFor(d)).toBe(navyBodyFat({ gender: "male", heightCm: 180, neckCm: 40, waistCm: 96 }));
    expect(bodyFatFor({ ...d, measurement: { ...d.measurement, waistCm: null } })).toBeNull();
    expect(bodyFatFor({ ...d, profile: { ...d.profile, heightCm: null } })).toBeNull();
  });

  test("women's estimate waits for the hip", () => {
    const d = filled({ profile: { ...filled().profile, gender: "female" }, measurement: { weightKg: 62, neckCm: 32, waistCm: 72, hipCm: null } });
    expect(bodyFatFor(d)).toBeNull();
    expect(bodyFatFor({ ...d, measurement: { ...d.measurement, hipCm: 96 } })).toBeGreaterThan(0);
  });
});

describe("payload", () => {
  test("is exactly the POST /onboarding body, with the goal, its training level and the training answers", () => {
    expect(onboardingPayload(filled(), 3)).toEqual({
      profile: { gender: "male", birthDate: "1994-04-12", heightCm: 180, activityLevel: "moderate", measurementDay: 3 },
      measurement: { weightKg: 92, neckCm: 40, waistCm: 96 },
      goal: { direction: "cut", targetBodyFatPct: 15, trainingLevel: "beginner", profile: "optimal" },
      training: { daysPerWeek: 3, experience: "under1" },
    });
  });

  test("a bulk sends a lean-mass target, never a body-fat one", () => {
    const d = filled({ goal: { direction: "bulk", targetBodyFatPct: 15, targetLeanGainKg: 3.5, profile: "conservative", skipped: false } });
    expect(onboardingPayload(d, 0).goal).toEqual({ direction: "bulk", targetLeanGainKg: 3.5, trainingLevel: "beginner", profile: "conservative" });
  });

  test("a recomp sends its body-fat target and the experience maps to the engine's level", () => {
    const d = filled({
      training: { activityLevel: "active", daysPerWeek: 5, experience: "overThree" },
      goal: { direction: "recomp", targetBodyFatPct: 17, targetLeanGainKg: null, profile: "optimal", skipped: false },
    });
    expect(onboardingPayload(d, 0).goal).toEqual({ direction: "recomp", targetBodyFatPct: 17, trainingLevel: "advanced", profile: "optimal" });
  });

  test("an untouched goal step sends Floo's recommendation, the one the screen showed", () => {
    const d = filled({ goal: { direction: null, targetBodyFatPct: null, targetLeanGainKg: null, profile: "optimal", skipped: false } });
    const goal = onboardingPayload(d, 0).goal;
    expect(goal?.direction).toBeDefined();
    expect(goal?.profile).toBe("optimal");
  });

  test("skipping sends no goal at all", () => {
    expect(onboardingPayload(filled({ goal: { ...filled().goal, skipped: true } }), 3).goal).toBeNull();
  });

  test("women's hip measurement is carried through", () => {
    const d = filled({ profile: { ...filled().profile, gender: "female" }, measurement: { weightKg: 62, neckCm: 32, waistCm: 72, hipCm: 96 } });
    expect(onboardingPayload(d, 0).measurement).toEqual({ weightKg: 62, neckCm: 32, waistCm: 72, hipCm: 96 });
  });
});

describe("resuming", () => {
  const d = (step: OnboardingDraft["step"], over: Partial<OnboardingDraft> = {}) => ({ ...filled(over), step });

  test("a draft made before the account existed resumes at hello or the account step", () => {
    expect(resumeStep(d("goal"), false)).toBe("account");
    expect(resumeStep(d("welcome"), false)).toBe("welcome");
    expect(resumeStep(d("hello"), false)).toBe("hello");
    expect(resumeStep(d("goal", { account: { displayName: "", username: "" } }), false)).toBe("hello");
  });

  test("once signed in, hello and the account step are behind you", () => {
    expect(resumeStep(d("welcome"), true)).toBe("body");
    expect(resumeStep(d("account"), true)).toBe("body");
    expect(resumeStep(d("measure"), true)).toBe("measure");
    expect(canGoBackTo("body", true)).toBe(true);
    expect(canGoBackTo("account", true)).toBe(false);
    expect(canGoBackTo("hello", true)).toBe(false);
    expect(canGoBackTo("done", true)).toBe(false);
  });

  test("a saved step past an unanswered question resumes at that question", () => {
    const gap = d("goal", { training: { activityLevel: "moderate", daysPerWeek: null, experience: null } });
    expect(firstIncompleteStep(gap, "")).toBe("training");
    expect(resumeStep(gap, true)).toBe("training");
  });
});
