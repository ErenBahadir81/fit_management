/**
 * The shape of the onboarding draft and the few facts derived straight from it.
 *
 * Kept apart from `model.ts` (the step machine) and `plan.ts` (the goal maths) so both can build on
 * it without importing each other.
 */
import {
  navyBodyFat,
  trainingLevelForExperience,
  type ActivityLevel,
  type Gender,
  type GoalDirection,
  type GoalProfile,
  type TrainingExperience,
  type TrainingLevel,
} from "@fitfloow/core";

export type OnboardingStep = "welcome" | "hello" | "account" | "body" | "measure" | "training" | "assessment" | "goal" | "done";

/**
 * The height the stepper shows on the first frame. It is a real answer, not a placeholder: the
 * control displays it, so the draft must agree with it rather than sit on `null` and quietly
 * disable the Continue button with nothing on screen to explain why.
 */
export const DEFAULT_HEIGHT_CM = 175;

/** A goal the user can accept: which way, and the one number that direction is measured in. */
export interface GoalChoice {
  direction: GoalDirection;
  /** Cut / recomp. */
  targetBodyFatPct: number | null;
  /** Bulk: lean kg to gain. */
  targetLeanGainKg: number | null;
}

export const DRAFT_VERSION = 2;

export interface OnboardingDraft {
  /** Bumped whenever the shape changes; `draft.ts` migrates older versions forward. */
  version: typeof DRAFT_VERSION;
  step: OnboardingStep;
  /** The password is deliberately absent — it lives in component state and never touches disk. */
  account: { displayName: string; username: string };
  profile: { gender: Gender | null; birthDate: string | null; heightCm: number | null };
  measurement: { weightKg: number | null; neckCm: number | null; waistCm: number | null; hipCm: number | null };
  training: { activityLevel: ActivityLevel | null; daysPerWeek: number | null; experience: TrainingExperience | null };
  /**
   * What the user did with Floo's recommendation. `direction: null` = untouched (the screen shows
   * the recommendation and accepting sends it); `skipped` = "no goal for now", sent as `null`.
   */
  goal: {
    direction: GoalDirection | null;
    targetBodyFatPct: number | null;
    targetLeanGainKg: number | null;
    profile: GoalProfile;
    skipped: boolean;
  };
}

export function emptyDraft(): OnboardingDraft {
  return {
    version: DRAFT_VERSION,
    step: "welcome",
    account: { displayName: "", username: "" },
    profile: { gender: null, birthDate: null, heightCm: DEFAULT_HEIGHT_CM },
    measurement: { weightKg: null, neckCm: null, waistCm: null, hipCm: null },
    training: { activityLevel: null, daysPerWeek: null, experience: null },
    goal: { direction: null, targetBodyFatPct: null, targetLeanGainKg: null, profile: "optimal", skipped: false },
  };
}

/** The Navy estimate, the moment every input it needs is present. */
export function bodyFatFor(d: OnboardingDraft): number | null {
  const { gender, heightCm } = d.profile;
  const { neckCm, waistCm, hipCm } = d.measurement;
  if (!gender || heightCm === null || neckCm === null || waistCm === null) return null;
  if (gender === "female" && hipCm === null) return null;
  if (waistCm <= neckCm) return null;
  const bf = navyBodyFat({ gender, heightCm, neckCm, waistCm, hipCm });
  return Number.isFinite(bf) ? bf : null;
}

export function trainingLevelOf(d: OnboardingDraft): TrainingLevel | null {
  return d.training.experience ? trainingLevelForExperience(d.training.experience) : null;
}
