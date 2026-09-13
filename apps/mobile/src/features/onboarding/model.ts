/**
 * The first-run flow as data.
 *
 * Every rule about what a step needs, what is wrong with it, and what finally gets sent lives here
 * and nowhere else, so the screens stay thin and the whole flow is testable without rendering it.
 */
import { ageFromBirthDate, isDateKey, navyBodyFat, type ActivityLevel, type Gender, type GoalProfile, type OnboardingInput, type Weekday } from "@fitfloow/core";
import { todayKey } from "../../lib/dates";
import type { GoalIntent } from "../goals/goalIntent";

export type OnboardingStep = "welcome" | "account" | "about" | "measure" | "goal" | "done";

export const STEP_ORDER: readonly OnboardingStep[] = ["welcome", "account", "about", "measure", "goal", "done"];

/**
 * The height the stepper shows on the first frame. It is a real answer, not a placeholder: the
 * control displays it, so the draft must agree with it rather than sit on `null` and quietly
 * disable the Continue button with nothing on screen to explain why.
 */
export const DEFAULT_HEIGHT_CM = 175;

export interface OnboardingDraft {
  /** Bumped whenever the shape changes; an older draft is dropped instead of half-restored. */
  version: 1;
  step: OnboardingStep;
  /** The password is deliberately absent — it lives in component state and never touches disk. */
  account: { displayName: string; username: string };
  profile: { gender: Gender | null; birthDate: string | null; heightCm: number | null; activityLevel: ActivityLevel | null };
  measurement: { weightKg: number | null; neckCm: number | null; waistCm: number | null; hipCm: number | null };
  goal: { intent: GoalIntent | null; targetBodyFatPct: number | null; profile: GoalProfile };
}

export function emptyDraft(): OnboardingDraft {
  return {
    version: 1,
    step: "welcome",
    account: { displayName: "", username: "" },
    profile: { gender: null, birthDate: null, heightCm: DEFAULT_HEIGHT_CM, activityLevel: null },
    measurement: { weightKg: null, neckCm: null, waistCm: null, hipCm: null },
    goal: { intent: null, targetBodyFatPct: null, profile: "optimal" },
  };
}

export function nextStep(step: OnboardingStep): OnboardingStep {
  const i = STEP_ORDER.indexOf(step);
  return STEP_ORDER[Math.min(i + 1, STEP_ORDER.length - 1)];
}

export function prevStep(step: OnboardingStep): OnboardingStep | null {
  const i = STEP_ORDER.indexOf(step);
  return i <= 0 ? null : STEP_ORDER[i - 1];
}

/* ------------------------------------------------------------- validation */

export type FieldErrors = Partial<Record<"displayName" | "username" | "password" | "gender" | "birthDate" | "heightCm" | "activityLevel" | "weightKg" | "neckCm" | "waistCm" | "hipCm" | "intent" | "targetBodyFatPct", string>>;

const USERNAME_RE = /^[a-z0-9_.]{3,32}$/i;
/** C3: the API refuses anything shorter. Catch it here so nobody types a password twice. */
export const MIN_PASSWORD = 8;

function range(value: number | null, lo: number, hi: number, message: string): string | undefined {
  if (value === null || !Number.isFinite(value)) return message;
  return value < lo || value > hi ? message : undefined;
}

/** What is still wrong on this step. An empty object means the step is done. */
export function fieldErrors(step: OnboardingStep, d: OnboardingDraft, password: string): FieldErrors {
  const e: FieldErrors = {};
  if (step === "account") {
    if (d.account.displayName.trim().length < 2) e.displayName = "Sana nasıl sesleneyim?";
    const u = d.account.username.trim();
    if (!u) e.username = "Bir kullanıcı adı seç.";
    else if (!USERNAME_RE.test(u)) e.username = "3-32 karakter; harf, rakam, nokta ve alt çizgi.";
    if (password.length < MIN_PASSWORD) e.password = `En az ${MIN_PASSWORD} karakter.`;
  }
  if (step === "about") {
    if (!d.profile.gender) e.gender = "Navy formülü cinsiyete göre değişiyor.";
    if (!d.profile.birthDate || !isDateKey(d.profile.birthDate)) e.birthDate = "Doğum tarihini seç.";
    else {
      const age = ageFromBirthDate(d.profile.birthDate, todayKey());
      if (age < 13 || age > 100) e.birthDate = "13-100 yaş arası bir tarih seç.";
    }
    e.heightCm = range(d.profile.heightCm, 100, 250, "Boyunu 100-250 cm arasında gir.");
    if (!e.heightCm) delete e.heightCm;
    if (!d.profile.activityLevel) e.activityLevel = "Günün ne kadar hareketli geçiyor?";
  }
  if (step === "measure") {
    const m = d.measurement;
    const put = (k: keyof FieldErrors, v: string | undefined) => {
      if (v) e[k] = v;
    };
    put("weightKg", range(m.weightKg, 30, 300, "Kilonu 30-300 kg arasında gir."));
    put("neckCm", range(m.neckCm, 20, 80, "Boyun ölçünü 20-80 cm arasında gir."));
    put("waistCm", range(m.waistCm, 40, 200, "Bel ölçünü 40-200 cm arasında gir."));
    if (d.profile.gender === "female") put("hipCm", range(m.hipCm, 50, 200, "Kadınlarda kalça ölçüsü de gerekiyor."));
    // The formula needs a waist wider than the neck; without it there is no estimate to show.
    if (!e.waistCm && !e.neckCm && m.waistCm !== null && m.neckCm !== null && m.waistCm <= m.neckCm) {
      e.waistCm = "Bel ölçüsü boyun ölçüsünden büyük olmalı.";
    }
  }
  if (step === "goal") {
    if (!d.goal.intent) e.intent = "Bir yön seç.";
    else if (d.goal.intent === "lose" && d.goal.targetBodyFatPct === null) e.targetBodyFatPct = "Bir hedef yağ oranı seç.";
  }
  return e;
}

export function stepReady(step: OnboardingStep, d: OnboardingDraft, password: string): boolean {
  return Object.keys(fieldErrors(step, d, password)).length === 0;
}

/* ----------------------------------------------------------------- derived */

/** The Navy estimate, the moment every input it needs is present. */
export function bodyFatFor(d: OnboardingDraft): number | null {
  const { gender, heightCm } = d.profile;
  const { neckCm, waistCm, hipCm } = d.measurement;
  if (!gender || heightCm === null || neckCm === null || waistCm === null) return null;
  return navyBodyFat({ gender, heightCm, neckCm, waistCm, hipCm });
}

/* ----------------------------------------------------------------- payload */

/** The `POST /onboarding` body (C3). One call commits the whole flow. */
export function onboardingPayload(d: OnboardingDraft, measurementDay: Weekday): OnboardingInput {
  const p = d.profile;
  const m = d.measurement;
  return {
    profile: {
      gender: p.gender ?? "male",
      birthDate: p.birthDate ?? "",
      heightCm: p.heightCm ?? 0,
      activityLevel: p.activityLevel ?? "moderate",
      measurementDay,
    },
    measurement: {
      weightKg: m.weightKg ?? 0,
      neckCm: m.neckCm ?? 0,
      waistCm: m.waistCm ?? 0,
      ...(p.gender === "female" && m.hipCm !== null ? { hipCm: m.hipCm } : {}),
    },
    // Only fat loss is a *goal*; the other two intents shape the diet target instead.
    goal: d.goal.intent === "lose" && d.goal.targetBodyFatPct !== null ? { targetBodyFatPct: d.goal.targetBodyFatPct, profile: d.goal.profile } : null,
  };
}

/* ------------------------------------------------------------------ resume */

/**
 * Where to drop someone back into a restored draft.
 *
 * A draft can outlive the session that made it: if the app died between "account" and the register
 * call, the answers are still on disk but there is no account yet, so the furthest they may resume
 * is the account step. Once signed in, the account step is behind them for good.
 */
export function resumeStep(draft: OnboardingDraft, signedIn: boolean): OnboardingStep {
  const at = STEP_ORDER.indexOf(draft.step);
  if (!signedIn) return draft.step === "welcome" ? "welcome" : "account";
  return at < STEP_ORDER.indexOf("about") ? "about" : draft.step;
}

/** Steps a signed-in user can walk back to (the account step is done and gone). */
export function canGoBackTo(step: OnboardingStep, signedIn: boolean): boolean {
  if (step === "done") return false;
  if (signedIn && (step === "welcome" || step === "account")) return false;
  return true;
}
