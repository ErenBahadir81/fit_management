import { clearDraft, hasDraft, loadDraft, migrateDraft, saveDraft, ONBOARDING_DRAFT_KEY } from "../../../src/features/onboarding/draft";
import { emptyDraft, type OnboardingDraft } from "../../../src/features/onboarding/model";
import { storage } from "../../../src/lib/storage";

function filled(over: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {
    ...emptyDraft(),
    step: "training",
    account: { displayName: "Eren Bahadır", username: "eren" },
    profile: { gender: "male", birthDate: "1994-04-12", heightCm: 180 },
    measurement: { weightKg: 92, neckCm: 40, waistCm: 96, hipCm: null },
    training: { activityLevel: "moderate", daysPerWeek: 3, experience: "under1" },
    ...over,
  };
}

/** A draft exactly as the six-step flow (v1) wrote it. */
function v1(over: Record<string, unknown> = {}) {
  return {
    version: 1,
    step: "goal",
    account: { displayName: "Eren", username: "eren" },
    profile: { gender: "male", birthDate: "1994-04-12", heightCm: 180, activityLevel: "active" },
    measurement: { weightKg: 92, neckCm: 40, waistCm: 96, hipCm: null },
    goal: { intent: "lose", targetBodyFatPct: 16, profile: "aggressive" },
    ...over,
  };
}

describe("draft persistence", () => {
  beforeEach(() => clearDraft());

  test("keeps the same storage key", () => {
    expect(ONBOARDING_DRAFT_KEY).toBe("onboarding.draft.v1");
  });

  test("a crash mid-flow does not cost the answers already given", () => {
    const d = filled({ step: "goal" });
    saveDraft(d);
    expect(loadDraft()).toEqual(d);
    expect(hasDraft()).toBe(true);
  });

  test("nothing stored reads as nothing, not as a broken draft", () => {
    expect(loadDraft()).toBeNull();
  });

  test("garbage or an unknown version is discarded rather than half-restored", () => {
    storage.set(ONBOARDING_DRAFT_KEY, JSON.stringify({ ...filled(), version: 0 }));
    expect(loadDraft()).toBeNull();
    storage.set(ONBOARDING_DRAFT_KEY, JSON.stringify({ ...filled(), version: 99 }));
    expect(loadDraft()).toBeNull();
    storage.set(ONBOARDING_DRAFT_KEY, "{not json");
    expect(loadDraft()).toBeNull();
  });

  test("a field added since the write reads as its default, not undefined", () => {
    const { training: _t, ...rest } = filled();
    storage.set(ONBOARDING_DRAFT_KEY, JSON.stringify(rest));
    expect(loadDraft()?.training).toEqual(emptyDraft().training);
  });

  test("an unknown step name falls back to the start instead of a blank screen", () => {
    storage.set(ONBOARDING_DRAFT_KEY, JSON.stringify({ ...filled(), step: "about" }));
    expect(loadDraft()?.step).toBe("welcome");
  });

  test("the password is never written to disk", () => {
    saveDraft({ ...filled(), password: "cokgizli1" } as OnboardingDraft & { password?: string });
    const raw = storage.getString(ONBOARDING_DRAFT_KEY) as string;
    expect(raw).not.toMatch(/password|sifre|şifre|cokgizli/i);
  });

  test("clearing removes it", () => {
    saveDraft(filled());
    clearDraft();
    expect(loadDraft()).toBeNull();
    expect(hasDraft()).toBe(false);
  });
});

describe("migration from the six-step flow (v1)", () => {
  beforeEach(() => clearDraft());

  test("keeps every answer, moves activity to the training step and fat loss to a cut", () => {
    expect(migrateDraft(v1())).toEqual({
      ...emptyDraft(),
      step: "goal",
      account: { displayName: "Eren", username: "eren" },
      profile: { gender: "male", birthDate: "1994-04-12", heightCm: 180 },
      measurement: { weightKg: 92, neckCm: 40, waistCm: 96, hipCm: null },
      training: { activityLevel: "active", daysPerWeek: null, experience: null },
      goal: { direction: "cut", targetBodyFatPct: 16, targetLeanGainKg: null, profile: "aggressive", skipped: false },
    });
  });

  test("maps the old steps onto the new ones", () => {
    expect(migrateDraft(v1({ step: "welcome" }))?.step).toBe("welcome");
    expect(migrateDraft(v1({ step: "account" }))?.step).toBe("account");
    expect(migrateDraft(v1({ step: "about" }))?.step).toBe("body");
    expect(migrateDraft(v1({ step: "measure" }))?.step).toBe("measure");
    expect(migrateDraft(v1({ step: "done" }))?.step).toBe("done");
  });

  test("'gain' becomes a bulk Floo will size, 'maintain' becomes no goal, nothing chosen stays open", () => {
    expect(migrateDraft(v1({ goal: { intent: "gain", targetBodyFatPct: null, profile: "optimal" } }))?.goal).toEqual({
      direction: "bulk",
      targetBodyFatPct: null,
      targetLeanGainKg: null,
      profile: "optimal",
      skipped: false,
    });
    expect(migrateDraft(v1({ goal: { intent: "maintain", targetBodyFatPct: null, profile: "optimal" } }))?.goal.skipped).toBe(true);
    expect(migrateDraft(v1({ goal: { intent: null, targetBodyFatPct: null, profile: "optimal" } }))?.goal).toEqual(emptyDraft().goal);
  });

  test("a stored v1 draft loads as v2 and is rewritten as v2", () => {
    storage.set(ONBOARDING_DRAFT_KEY, JSON.stringify(v1()));
    const d = loadDraft();
    expect(d?.version).toBe(2);
    expect(d?.training.activityLevel).toBe("active");
    expect(JSON.parse(storage.getString(ONBOARDING_DRAFT_KEY) as string).version).toBe(2);
  });
});
