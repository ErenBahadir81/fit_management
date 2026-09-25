/**
 * The onboarding draft on disk.
 *
 * Signing up is the longest uninterrupted stretch of typing in the app, so a crash, a phone call or
 * an accidental swipe must not cost the answers already given. Everything except the password is
 * written to MMKV on every change and read back on launch.
 *
 * The key stays `onboarding.draft.v1`; the shape inside carries its own `version`. Version 1 is
 * the six-step flow; `migrateDraft` carries its answers into the seven-stage session (v2) so an
 * update mid-onboarding costs nobody their measurements.
 */
import type { GoalProfile } from "@fitfloow/core";
import { STORAGE_KEYS, getJSON, removeKey, setJSON, storage } from "../../lib/storage";
import { DRAFT_VERSION, emptyDraft, type OnboardingDraft, type OnboardingStep } from "./draftShape";

export const ONBOARDING_DRAFT_KEY = STORAGE_KEYS.onboardingDraft;

const STEPS: readonly OnboardingStep[] = ["welcome", "hello", "account", "body", "measure", "training", "assessment", "goal", "done"];
const V1_STEP: Record<string, OnboardingStep> = { welcome: "welcome", account: "account", about: "body", measure: "measure", goal: "goal", done: "done" };

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose => (v && typeof v === "object" ? (v as Loose) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Version 1 → version 2. Returns null for anything that is not a v1 draft. */
function fromV1(raw: Loose): OnboardingDraft | null {
  if (raw.version !== 1) return null;
  const base = emptyDraft();
  const profile = obj(raw.profile);
  const goal = obj(raw.goal);
  const intent = goal.intent;
  const pace = (["conservative", "optimal", "aggressive"] as const).includes(goal.profile as GoalProfile) ? (goal.profile as GoalProfile) : base.goal.profile;
  return merge({
    ...raw,
    version: DRAFT_VERSION,
    step: V1_STEP[String(raw.step)] ?? "welcome",
    profile: { gender: profile.gender ?? null, birthDate: profile.birthDate ?? null, heightCm: profile.heightCm ?? base.profile.heightCm },
    training: { ...base.training, activityLevel: profile.activityLevel ?? null },
    goal:
      intent === "lose"
        ? { ...base.goal, direction: "cut", targetBodyFatPct: num(goal.targetBodyFatPct), profile: pace }
        : intent === "gain"
          ? { ...base.goal, direction: "bulk", profile: pace }
          : intent === "maintain"
            ? { ...base.goal, skipped: true, profile: pace }
            : base.goal,
  });
}

/** Merges over a fresh draft so a field added since the write is present rather than undefined. */
function merge(raw: Loose): OnboardingDraft {
  const base = emptyDraft();
  const step = STEPS.includes(raw.step as OnboardingStep) ? (raw.step as OnboardingStep) : "welcome";
  return {
    version: DRAFT_VERSION,
    step,
    account: { ...base.account, ...obj(raw.account) },
    profile: { ...base.profile, ...obj(raw.profile) },
    measurement: { ...base.measurement, ...obj(raw.measurement) },
    training: { ...base.training, ...obj(raw.training) },
    goal: { ...base.goal, ...obj(raw.goal) },
  } as OnboardingDraft;
}

/** Any stored draft → the current shape, or null when it is not one we understand. */
export function migrateDraft(raw: unknown): OnboardingDraft | null {
  const r = obj(raw);
  if (r.version === DRAFT_VERSION) return merge(r);
  return fromV1(r);
}

/** The stored draft, or null when there is nothing usable. Never throws, never half-restores. */
export function loadDraft(): OnboardingDraft | null {
  const raw = getJSON<Loose>(ONBOARDING_DRAFT_KEY);
  if (!raw) return null;
  const draft = migrateDraft(raw);
  if (draft && raw.version !== DRAFT_VERSION) saveDraft(draft);
  return draft;
}

/** Writes the draft, deliberately keeping only the fields the draft declares (so: no password). */
export function saveDraft(d: OnboardingDraft): void {
  setJSON(ONBOARDING_DRAFT_KEY, {
    version: DRAFT_VERSION,
    step: d.step,
    account: { displayName: d.account.displayName, username: d.account.username },
    profile: { gender: d.profile.gender, birthDate: d.profile.birthDate, heightCm: d.profile.heightCm },
    measurement: { weightKg: d.measurement.weightKg, neckCm: d.measurement.neckCm, waistCm: d.measurement.waistCm, hipCm: d.measurement.hipCm },
    training: { activityLevel: d.training.activityLevel, daysPerWeek: d.training.daysPerWeek, experience: d.training.experience },
    goal: {
      direction: d.goal.direction,
      targetBodyFatPct: d.goal.targetBodyFatPct,
      targetLeanGainKg: d.goal.targetLeanGainKg,
      profile: d.goal.profile,
      skipped: d.goal.skipped,
    },
  } satisfies OnboardingDraft);
}

export function clearDraft(): void {
  removeKey(ONBOARDING_DRAFT_KEY);
}

/** Test seam: whether anything is stored at all. */
export function hasDraft(): boolean {
  return storage.contains(ONBOARDING_DRAFT_KEY);
}
