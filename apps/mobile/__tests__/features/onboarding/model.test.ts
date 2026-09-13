import { navyBodyFat } from "@fitfloow/core";
import {
  STEP_ORDER,
  bodyFatFor,
  emptyDraft,
  fieldErrors,
  nextStep,
  onboardingPayload,
  prevStep,
  canGoBackTo,
  resumeStep,
  stepReady,
  type OnboardingDraft,
} from "../../../src/features/onboarding/model";
import { clearDraft, loadDraft, saveDraft } from "../../../src/features/onboarding/draft";

function filled(over: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {
    ...emptyDraft(),
    account: { displayName: "Eren Bahadır", username: "eren" },
    profile: { gender: "male", birthDate: "1994-04-12", heightCm: 180, activityLevel: "moderate" },
    measurement: { weightKg: 92, neckCm: 40, waistCm: 96, hipCm: null },
    goal: { intent: "lose", targetBodyFatPct: 15, profile: "optimal" },
    ...over,
  };
}

describe("step machine", () => {
  test("six steps, welcome first, done last", () => {
    expect(STEP_ORDER).toEqual(["welcome", "account", "about", "measure", "goal", "done"]);
  });

  test("next and previous stop at the ends", () => {
    expect(nextStep("welcome")).toBe("account");
    expect(nextStep("done")).toBe("done");
    expect(prevStep("account")).toBe("welcome");
    expect(prevStep("welcome")).toBeNull();
  });

});

describe("field errors", () => {
  test("an empty draft cannot leave the account step, and each field says what is wrong", () => {
    const d = emptyDraft();
    expect(stepReady("account", d, "")).toBe(false);
    const e = fieldErrors("account", d, "");
    expect(e.displayName).toBeTruthy();
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

  test("about needs all four facts, and an implausible age or height is caught", () => {
    const d = filled({ profile: { gender: null, birthDate: null, heightCm: null, activityLevel: null } });
    const e = fieldErrors("about", d, "");
    expect(Object.keys(e).sort()).toEqual(["activityLevel", "birthDate", "gender", "heightCm"]);
    expect(fieldErrors("about", filled({ profile: { ...filled().profile, birthDate: "2024-01-01" } }), "").birthDate).toBeTruthy();
    expect(fieldErrors("about", filled({ profile: { ...filled().profile, heightCm: 60 } }), "").heightCm).toBeTruthy();
  });

  test("women need a hip measurement, men do not", () => {
    const women = filled({ profile: { ...filled().profile, gender: "female" }, measurement: { weightKg: 62, neckCm: 32, waistCm: 72, hipCm: null } });
    expect(fieldErrors("measure", women, "").hipCm).toBeTruthy();
    expect(stepReady("measure", women, "")).toBe(false);
    expect(stepReady("measure", { ...women, measurement: { ...women.measurement, hipCm: 96 } }, "")).toBe(true);
    expect(fieldErrors("measure", filled(), "").hipCm).toBeUndefined();
  });

  test("a waist that is not wider than the neck cannot produce a body-fat estimate", () => {
    const d = filled({ measurement: { weightKg: 92, neckCm: 40, waistCm: 38, hipCm: null } });
    expect(fieldErrors("measure", d, "").waistCm).toBeTruthy();
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
});

describe("payload", () => {
  test("is exactly the POST /onboarding body, with the goal only when the intent is fat loss", () => {
    const d = filled();
    expect(onboardingPayload(d, 3)).toEqual({
      profile: { gender: "male", birthDate: "1994-04-12", heightCm: 180, activityLevel: "moderate", measurementDay: 3 },
      measurement: { weightKg: 92, neckCm: 40, waistCm: 96 },
      goal: { targetBodyFatPct: 15, profile: "optimal" },
    });
    expect(onboardingPayload({ ...d, goal: { ...d.goal, intent: "maintain" } }, 3).goal).toBeNull();
    expect(onboardingPayload({ ...d, goal: { ...d.goal, intent: "gain" } }, 3).goal).toBeNull();
  });

  test("women's hip measurement is carried through", () => {
    const d = filled({ profile: { ...filled().profile, gender: "female" }, measurement: { weightKg: 62, neckCm: 32, waistCm: 72, hipCm: 96 } });
    expect(onboardingPayload(d, 0).measurement).toEqual({ weightKg: 62, neckCm: 32, waistCm: 72, hipCm: 96 });
  });
});

describe("draft persistence", () => {
  beforeEach(() => clearDraft());

  test("a crash mid-flow does not cost the answers already given", () => {
    const d = filled({ step: "goal" });
    saveDraft(d);
    expect(loadDraft()).toEqual(d);
  });

  test("nothing stored reads as nothing, not as a broken draft", () => {
    expect(loadDraft()).toBeNull();
  });

  test("a draft from an older shape is discarded rather than half-restored", () => {
    saveDraft(filled());
    const raw = JSON.parse(require("../../../src/lib/storage").storage.getString("onboarding.draft.v1") as string) as Record<string, unknown>;
    require("../../../src/lib/storage").storage.set("onboarding.draft.v1", JSON.stringify({ ...raw, version: 0 }));
    expect(loadDraft()).toBeNull();
  });

  test("the password is never written to disk", () => {
    saveDraft({ ...filled(), account: { displayName: "Eren", username: "eren" } } as OnboardingDraft & { password?: string });
    const raw = require("../../../src/lib/storage").storage.getString("onboarding.draft.v1") as string;
    expect(raw).not.toMatch(/password|sifre|şifre/i);
  });

  test("clearing removes it", () => {
    saveDraft(filled());
    clearDraft();
    expect(loadDraft()).toBeNull();
  });
});

describe("resuming", () => {
  const d = (step: OnboardingDraft["step"]) => ({ ...emptyDraft(), step });

  test("a draft made before the account existed can only resume at the account step", () => {
    expect(resumeStep(d("goal"), false)).toBe("account");
    expect(resumeStep(d("welcome"), false)).toBe("welcome");
  });

  test("once signed in, the account step is behind you", () => {
    expect(resumeStep(d("welcome"), true)).toBe("about");
    expect(resumeStep(d("account"), true)).toBe("about");
    expect(resumeStep(d("measure"), true)).toBe("measure");
    expect(canGoBackTo("about", true)).toBe(true);
    expect(canGoBackTo("account", true)).toBe(false);
    expect(canGoBackTo("done", true)).toBe(false);
  });
});
