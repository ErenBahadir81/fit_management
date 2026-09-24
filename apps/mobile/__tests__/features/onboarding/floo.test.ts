import { gestureDuration } from "../../../src/mascot/model";
import {
  POINT_HOLD_MS,
  WALK_MS,
  cueTimeline,
  goalCue,
  measureReaction,
  stepCue,
} from "../../../src/features/onboarding/floo";
import { emptyDraft, type OnboardingDraft } from "../../../src/features/onboarding/model";
import { assessmentFor, planFor, recommendedChoice, switchDirection } from "../../../src/features/onboarding/plan";

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

/** Floo's voice rules (docs/plan/09-mascot.md): short, at most two sentences, at most one emoji. */
function voiceOk(text: string) {
  const sentences = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const emoji = text.match(/\p{Extended_Pictographic}/gu) ?? [];
  return sentences.length <= 3 && emoji.length <= 1 && text.length <= 170;
}

describe("step cues", () => {
  const steps = ["hello", "account", "body", "measure", "training", "assessment", "goal", "done"] as const;

  test("every step has a line in Floo's voice, a mood and (bar the quiet ones) a gesture", () => {
    for (const s of steps) {
      const c = stepCue(s, draft());
      expect({ s, ok: voiceOk(c.say) }).toEqual({ s, ok: true });
      expect(c.mood).toBeTruthy();
    }
    expect(stepCue("hello", draft()).gesture).toBe("wave");
    expect(stepCue("done", draft()).gesture).toBe("cheer");
  });

  test("uses the name once it is known", () => {
    expect(stepCue("account", draft()).say).toContain("Eren");
    expect(stepCue("done", draft()).say).toContain("Eren");
    expect(stepCue("account", draft({ account: { displayName: "", username: "" } })).say).not.toContain("undefined");
  });

  test("points at the ring on the measurement step and the card on the assessment step", () => {
    expect(stepCue("measure", draft()).point).toBe("ring");
    expect(stepCue("assessment", draft()).point).toBe("card");
    expect(stepCue("goal", draft()).point).toBe("slider");
  });

  test("the measurement step mentions the hip only to women", () => {
    expect(stepCue("measure", draft()).say).not.toMatch(/kalça/i);
    expect(stepCue("measure", draft({ profile: { gender: "female", birthDate: "1994-04-12", heightCm: 165 } })).say).toMatch(/kalça/i);
  });

  test("the assessment line is core's own interpretation", () => {
    const d = draft();
    expect(stepCue("assessment", d).say).toBe(assessmentFor(d)!.summaryTr);
  });

  test("the goal line is the recommendation's reason", () => {
    const d = draft();
    expect(stepCue("goal", d).say).toBe(assessmentFor(d)!.recommendation.reasonTr);
  });
});

describe("instant measurement feedback", () => {
  const partial = (m: Partial<OnboardingDraft["measurement"]>) => draft({ measurement: { weightKg: null, neckCm: null, waistCm: null, hipCm: null, ...m } });

  test("a plausible value is acknowledged with the number and how many are left", () => {
    const r = measureReaction("weightKg", partial({ weightKg: 92 }))!;
    expect(r.say).toContain("92");
    expect(r.say).toMatch(/2 ölçü/);
    expect(r.gesture).toBe("thumbsUp");
  });

  test("the last one reveals the body fat and points at the ring", () => {
    const r = measureReaction("waistCm", draft())!;
    expect(r.say).toMatch(/%\d/);
    expect(r.point).toBe("ring");
    expect(r.mood).toBe("proud");
  });

  test("an implausible value gets a shrug, not a scolding", () => {
    const r = measureReaction("neckCm", partial({ weightKg: 92, neckCm: 400 }))!;
    expect(r.gesture).toBe("shrug");
    expect(r.mood).toBe("worried");
    expect(r.say).not.toMatch(/yanlış|hata/i);
  });

  test("nothing to say about an empty field", () => {
    expect(measureReaction("neckCm", partial({ weightKg: 92 }))).toBeNull();
  });
});

describe("goal cue", () => {
  test("switching away from the recommendation is acknowledged with the plan's numbers", () => {
    const d = draft();
    const a = assessmentFor(d)!;
    const bulk = switchDirection(recommendedChoice(a), "bulk", a);
    const plan = planFor(d, bulk, "optimal", "2026-09-24")!;
    const c = goalCue(bulk, a, plan);
    expect(c.say).toContain(String(plan.estimatedWeeks));
    expect(c.gesture).toBe("flex");
  });

  test("back on the recommendation, Floo repeats why", () => {
    const d = draft();
    const a = assessmentFor(d)!;
    const rec = recommendedChoice(a);
    expect(goalCue(rec, a, planFor(d, rec, "optimal", "2026-09-24")).say).toBe(a.recommendation.reasonTr);
  });
});

describe("cue timeline", () => {
  test("walk, then the gesture, then the point, then let go", () => {
    const t = cueTimeline({ walk: 1, gesture: "wave", point: "ring" }, false);
    const at = (k: string) => t.find((e) => e.kind === k)?.at;
    expect(at("walkStart")).toBe(0);
    expect(at("walkEnd")).toBe(WALK_MS);
    expect(at("gesture")).toBeGreaterThanOrEqual(WALK_MS);
    expect(at("point")).toBe(at("gesture")! + gestureDuration("wave"));
    expect(at("unpoint")).toBe(at("point")! + POINT_HOLD_MS);
    expect(t.map((e) => e.at)).toEqual([...t.map((e) => e.at)].sort((x, y) => x - y));
  });

  test("no walk: the gesture starts at once", () => {
    const t = cueTimeline({ walk: 0, gesture: "thumbsUp", point: null }, false);
    expect(t).toEqual([{ at: 0, kind: "gesture" }]);
  });

  test("reduced motion: no walk, no gesture, no reach — the mood cross-fade is all", () => {
    expect(cueTimeline({ walk: 1, gesture: "wave", point: "ring" }, true)).toEqual([]);
  });
});
