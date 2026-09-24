/**
 * The first-run session as data.
 *
 * Every rule about what a step needs, what is wrong with it, and what finally gets sent lives here
 * and nowhere else, so the screens stay thin and the whole flow is testable without rendering it.
 *
 * A welcome door, then seven stages the progress bar counts (hello + account share the first):
 * name → body → measurements → training → "where you are now" → Floo's goal → finish.
 */
import { ageFromBirthDate, isDateKey, type Gender, type GoalInput, type OnboardingInput, type Weekday } from "@fitfloow/core";
import { todayKey } from "../../lib/dates";
import { trainingLevelOf, type OnboardingDraft, type OnboardingStep } from "./draftShape";
import { assessmentFor, choiceError, resolvedGoal } from "./plan";

export { DEFAULT_HEIGHT_CM, bodyFatFor, emptyDraft, type GoalChoice, type OnboardingDraft, type OnboardingStep } from "./draftShape";

export const STEP_ORDER: readonly OnboardingStep[] = ["welcome", "hello", "account", "body", "measure", "training", "assessment", "goal", "done"];

/** Stages on the progress bar. */
export const STAGE_COUNT = 7;

const STAGE: Record<OnboardingStep, number> = { welcome: 0, hello: 1, account: 1, body: 2, measure: 3, training: 4, assessment: 5, goal: 6, done: 7 };

export function stageOf(step: OnboardingStep): number {
  return STAGE[step];
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

export type MeasurementField = keyof OnboardingDraft["measurement"];

export type FieldErrors = Partial<
  Record<
    "displayName" | "username" | "password" | "gender" | "birthDate" | "heightCm" | MeasurementField | "activityLevel" | "daysPerWeek" | "experience" | "assessment" | "target",
    string
  >
>;

const USERNAME_RE = /^[a-z0-9_.]{3,32}$/i;
/** C3: the API refuses anything shorter. Catch it here so nobody types a password twice. */
export const MIN_PASSWORD = 8;

/** The accepted range of each measurement (the API's own, a little tighter where people mistype). */
export const MEASUREMENT_RANGE: Record<MeasurementField, { min: number; max: number; message: string }> = {
  weightKg: { min: 30, max: 300, message: "Kilonu 30-300 kg arasında gir." },
  neckCm: { min: 20, max: 80, message: "Boyun ölçünü 20-80 cm arasında gir." },
  waistCm: { min: 40, max: 200, message: "Bel ölçünü 40-200 cm arasında gir." },
  hipCm: { min: 50, max: 200, message: "Kalça ölçünü 50-200 cm arasında gir." },
};

export function measurementFields(gender: Gender | null): MeasurementField[] {
  return gender === "female" ? ["weightKg", "neckCm", "waistCm", "hipCm"] : ["weightKg", "neckCm", "waistCm"];
}

export function inRange(field: MeasurementField, value: number | null): boolean {
  const r = MEASUREMENT_RANGE[field];
  return value !== null && Number.isFinite(value) && value >= r.min && value <= r.max;
}

/** How many of this person's measurements are in and plausible: the ring's segments. */
export function measuredCount(d: OnboardingDraft): number {
  return measurementFields(d.profile.gender).filter((f) => inRange(f, d.measurement[f])).length;
}

/** What is still wrong on this step. An empty object means the step is done. */
export function fieldErrors(step: OnboardingStep, d: OnboardingDraft, password: string): FieldErrors {
  const e: FieldErrors = {};
  if (step === "hello") {
    if (d.account.displayName.trim().length < 2) e.displayName = "Sana nasıl sesleneyim?";
  }
  if (step === "account") {
    const u = d.account.username.trim();
    if (!u) e.username = "Bir kullanıcı adı seç.";
    else if (!USERNAME_RE.test(u)) e.username = "3-32 karakter; harf, rakam, nokta ve alt çizgi.";
    if (password.length < MIN_PASSWORD) e.password = `En az ${MIN_PASSWORD} karakter.`;
  }
  if (step === "body") {
    const p = d.profile;
    if (!p.gender) e.gender = "Yağ oranı formülü cinsiyete göre değişiyor.";
    if (!p.birthDate || !isDateKey(p.birthDate)) e.birthDate = "Doğum tarihini seç.";
    else {
      const age = ageFromBirthDate(p.birthDate, todayKey());
      if (age < 13 || age > 100) e.birthDate = "13-100 yaş arası bir tarih seç.";
    }
    if (p.heightCm === null || !Number.isFinite(p.heightCm) || p.heightCm < 100 || p.heightCm > 250) e.heightCm = "Boyunu 100-250 cm arasında gir.";
  }
  if (step === "measure") {
    const m = d.measurement;
    for (const f of measurementFields(d.profile.gender)) {
      if (!inRange(f, m[f])) e[f] = f === "hipCm" && m.hipCm === null ? "Kadınlarda kalça ölçüsü de gerekiyor." : MEASUREMENT_RANGE[f].message;
    }
    // The formula needs a waist wider than the neck; without it there is no estimate to show.
    if (!e.waistCm && !e.neckCm && m.waistCm !== null && m.neckCm !== null && m.waistCm <= m.neckCm) {
      e.waistCm = "Bel ölçüsü boyun ölçüsünden büyük olmalı.";
    }
  }
  if (step === "training") {
    const t = d.training;
    if (!t.activityLevel) e.activityLevel = "Günün ne kadar hareketli geçiyor?";
    if (t.daysPerWeek === null || t.daysPerWeek < 2 || t.daysPerWeek > 6) e.daysPerWeek = "Haftada kaç gün ayırabilirsin?";
    if (!t.experience) e.experience = "Ne zamandır antrenman yapıyorsun?";
  }
  if (step === "assessment" || step === "goal") {
    const a = assessmentFor(d);
    if (!a) e.assessment = "Önce ölçülerin gerekiyor.";
    else if (step === "goal" && !d.goal.skipped) {
      const c = resolvedGoal(d);
      const err = c ? choiceError(c, a) : "Bir hedef seç.";
      if (err) e.target = err;
    }
  }
  return e;
}

export function stepReady(step: OnboardingStep, d: OnboardingDraft, password: string): boolean {
  return Object.keys(fieldErrors(step, d, password)).length === 0;
}

/* ----------------------------------------------------------------- payload */

/** The goal exactly as `POST /onboarding` takes it (`zGoalInput`), or null for "not now". */
export function goalPayload(d: OnboardingDraft): GoalInput | null {
  if (d.goal.skipped) return null;
  const c = resolvedGoal(d);
  if (!c) return null;
  const trainingLevel = trainingLevelOf(d) ?? undefined;
  const level = trainingLevel ? { trainingLevel } : {};
  if (c.direction === "bulk") {
    return c.targetLeanGainKg === null ? null : { direction: "bulk", targetLeanGainKg: c.targetLeanGainKg, ...level, profile: d.goal.profile };
  }
  return c.targetBodyFatPct === null ? null : { direction: c.direction, targetBodyFatPct: c.targetBodyFatPct, ...level, profile: d.goal.profile };
}

/** The `POST /onboarding` body (C3 + T8). One call commits the whole session. */
export function onboardingPayload(d: OnboardingDraft, measurementDay: Weekday): OnboardingInput {
  const p = d.profile;
  const m = d.measurement;
  const t = d.training;
  return {
    profile: {
      gender: p.gender ?? "male",
      birthDate: p.birthDate ?? "",
      heightCm: p.heightCm ?? 0,
      activityLevel: t.activityLevel ?? "moderate",
      measurementDay,
    },
    measurement: {
      weightKg: m.weightKg ?? 0,
      neckCm: m.neckCm ?? 0,
      waistCm: m.waistCm ?? 0,
      ...(p.gender === "female" && m.hipCm !== null ? { hipCm: m.hipCm } : {}),
    },
    goal: goalPayload(d),
    ...(t.daysPerWeek !== null && t.experience ? { training: { daysPerWeek: t.daysPerWeek, experience: t.experience } } : {}),
  };
}

/* ------------------------------------------------------------------ resume */

/** Steps answered from the draft alone, in order (hello and account need the session). */
const DRAFT_STEPS: readonly OnboardingStep[] = ["body", "measure", "training", "assessment", "goal"];

/** The first step whose question is still unanswered, or null when everything up to the goal is. */
export function firstIncompleteStep(d: OnboardingDraft, password: string): OnboardingStep | null {
  return DRAFT_STEPS.find((s) => !stepReady(s, d, password)) ?? null;
}

const at = (s: OnboardingStep) => STEP_ORDER.indexOf(s);

/**
 * Where to drop someone back into a restored draft.
 *
 * A draft can outlive the session that made it: if the app died between the account step and the
 * register call, the answers are still on disk but there is no account yet, so the furthest they
 * may resume is the account step (or hello, if the name is missing). Once signed in, both are
 * behind them for good. A saved step never skips a question that is still unanswered.
 */
export function resumeStep(draft: OnboardingDraft, signedIn: boolean): OnboardingStep {
  if (!signedIn) {
    if (draft.step === "welcome") return "welcome";
    if (!stepReady("hello", draft, "")) return "hello";
    return draft.step === "hello" ? "hello" : "account";
  }
  if (draft.step === "done") return "done";
  const saved = at(draft.step) < at("body") ? "body" : draft.step;
  const gap = firstIncompleteStep(draft, "");
  return gap !== null && at(gap) < at(saved) ? gap : saved;
}

/** Steps a signed-in user can walk back to (hello and the account step are done and gone). */
export function canGoBackTo(step: OnboardingStep, signedIn: boolean): boolean {
  if (step === "done") return false;
  if (signedIn && (step === "welcome" || step === "hello" || step === "account")) return false;
  return true;
}

