/**
 * The goal maths behind steps 5 and 6, all client-side and instant.
 *
 * "Where you are now" is core's `assessBody`, and every number under the goal slider is core's
 * `computeGoalPlan` — the same engine `POST /onboarding` runs — so what Floo promises while the
 * user drags is exactly what the server will store.
 */
import {
  DEFAULT_GOAL_SETTINGS,
  MIN_SAFE_BODY_FAT,
  ageFromBirthDate,
  assessBody,
  computeGoalPlan,
  round,
  type BodyAssessment,
  type GoalDirection,
  type GoalPlan,
  type GoalProfile,
} from "@fitfloow/core";
import { bodyFatFor, trainingLevelOf, type GoalChoice, type OnboardingDraft } from "./draftShape";

export const TARGET_STEP = 0.5;
/** A first bulk asks for at most this much lean mass; the next goal can take it further. */
export const MAX_FIRST_BULK_KG = 12;

export interface GoalBounds {
  min: number;
  max: number;
  step: number;
}

export function assessmentFor(d: OnboardingDraft): BodyAssessment | null {
  const bf = bodyFatFor(d);
  const { gender, heightCm } = d.profile;
  const weightKg = d.measurement.weightKg;
  if (bf === null || !gender || heightCm === null || weightKg === null) return null;
  return assessBody({ sex: gender, weightKg, heightCm, bodyFatPct: bf, trainingLevel: trainingLevelOf(d), settings: DEFAULT_GOAL_SETTINGS });
}

const snap = (v: number, b: GoalBounds) => {
  if (!Number.isFinite(v)) return b.min;
  return round(Math.min(Math.max(Math.round(v / b.step) * b.step, b.min), b.max), 1);
};

/** Slider range. Cut / recomp: essential-fat floor … half a point under today. Bulk: 0.5 kg … the room left to the ceiling. */
export function goalBounds(direction: GoalDirection, a: BodyAssessment): GoalBounds {
  if (direction === "bulk") {
    const room = Math.floor(Math.min(MAX_FIRST_BULK_KG, a.leanToCeilingKg) / TARGET_STEP) * TARGET_STEP;
    return { min: TARGET_STEP, max: Math.max(TARGET_STEP, room), step: TARGET_STEP };
  }
  const min = MIN_SAFE_BODY_FAT[a.sex];
  const max = Math.max(min, Math.floor((a.bodyFatPct - TARGET_STEP) / TARGET_STEP + 1e-9) * TARGET_STEP);
  return { min, max: round(max, 1), step: TARGET_STEP };
}

export function choiceTarget(c: GoalChoice): number | null {
  return c.direction === "bulk" ? c.targetLeanGainKg : c.targetBodyFatPct;
}

export function setChoiceTarget(c: GoalChoice, value: number, a: BodyAssessment): GoalChoice {
  const v = snap(value, goalBounds(c.direction, a));
  return c.direction === "bulk" ? { ...c, targetLeanGainKg: v, targetBodyFatPct: null } : { ...c, targetBodyFatPct: v, targetLeanGainKg: null };
}

/** Floo's recommendation as a choice, snapped onto the slider's grid. */
export function recommendedChoice(a: BodyAssessment): GoalChoice {
  const r = a.recommendation;
  const base: GoalChoice = { direction: r.direction, targetBodyFatPct: null, targetLeanGainKg: null };
  const target = r.direction === "bulk" ? r.targetLeanGainKg : r.targetBodyFatPct;
  return setChoiceTarget(base, target ?? defaultTarget(r.direction, a), a);
}

function defaultTarget(direction: GoalDirection, a: BodyAssessment): number {
  if (direction === "bulk") return Math.min(2, goalBounds("bulk", a).max);
  // A recomp moves body fat slowly; a few points is an honest first target.
  return a.bodyFatPct - (direction === "recomp" ? 3 : 5);
}

/** Switching direction keeps the recommendation's number when it matches, else a sensible default. */
export function switchDirection(c: GoalChoice, direction: GoalDirection, a: BodyAssessment): GoalChoice {
  if (direction === c.direction) return c;
  const rec = recommendedChoice(a);
  if (rec.direction === direction) return rec;
  return setChoiceTarget({ direction, targetBodyFatPct: null, targetLeanGainKg: null }, defaultTarget(direction, a), a);
}

/** What the goal step shows and what accepting it sends: the user's pick, else Floo's recommendation. */
export function resolvedGoal(d: OnboardingDraft): GoalChoice | null {
  const a = assessmentFor(d);
  if (!a) return null;
  const g = d.goal;
  const rec = recommendedChoice(a);
  if (!g.direction) return rec;
  const picked: GoalChoice = { direction: g.direction, targetBodyFatPct: g.direction === "bulk" ? null : g.targetBodyFatPct, targetLeanGainKg: g.direction === "bulk" ? g.targetLeanGainKg : null };
  // A direction without its number (e.g. a migrated "gain") takes that direction's default.
  return choiceTarget(picked) === null ? switchDirection(rec, g.direction, a) : picked;
}

/** Why a choice cannot be sent, in one sentence; undefined when it can. */
export function choiceError(c: GoalChoice, a: BodyAssessment): string | undefined {
  const t = choiceTarget(c);
  if (t === null) return c.direction === "bulk" ? "Kaç kilo kas kazanmak istediğini seç." : "Bir hedef yağ oranı seç.";
  const b = goalBounds(c.direction, a);
  if (t < b.min - 1e-9) return c.direction === "bulk" ? "En az yarım kilo kas hedefle." : `Hedef %${b.min}'in altına inemez.`;
  if (t > b.max + 1e-9) return c.direction === "bulk" ? "Bu hedef doğal sınırın ötesinde." : "Hedef şu anki oranının altında olmalı.";
  return undefined;
}

/** The real engine's plan for a choice and pace; null when inputs are missing or the engine refuses. */
export function planFor(d: OnboardingDraft, c: GoalChoice, profile: GoalProfile, todayKey: string): GoalPlan | null {
  const a = assessmentFor(d);
  const activityLevel = d.training.activityLevel ?? "moderate";
  if (!a || choiceTarget(c) === null) return null;
  try {
    return computeGoalPlan({
      sex: a.sex,
      weightKg: a.weightKg,
      bodyFatPct: a.bodyFatPct,
      heightCm: a.heightCm,
      age: d.profile.birthDate ? ageFromBirthDate(d.profile.birthDate, todayKey) : null,
      activityLevel,
      direction: c.direction,
      targetBodyFatPct: c.targetBodyFatPct,
      targetLeanGainKg: c.targetLeanGainKg,
      trainingLevel: a.trainingLevel,
      profile,
      startDate: todayKey,
      settings: DEFAULT_GOAL_SETTINGS,
    });
  } catch {
    return null;
  }
}

export type PlansByPace = Record<GoalProfile, GoalPlan | null>;

export function plansByPace(d: OnboardingDraft, c: GoalChoice, todayKey: string): PlansByPace {
  return {
    conservative: planFor(d, c, "conservative", todayKey),
    optimal: planFor(d, c, "optimal", todayKey),
    aggressive: planFor(d, c, "aggressive", todayKey),
  };
}
