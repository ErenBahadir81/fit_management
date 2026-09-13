/**
 * The goal, in the user's language.
 *
 * The engine thinks in target body-fat percentages. People think "I want to lose some fat" and then
 * "how fast?". This module is the translation layer between the two, plus the plain-Turkish
 * sentences that answer the question the old UI never answered: **when do I arrive where.**
 *
 * Everything here is pure, so the onboarding flow and the goal-setup screen can share it and both
 * stay instant while the server's authoritative preview is in flight.
 */
import {
  DEFAULT_GOAL_SETTINGS,
  ageFromBirthDate,
  bmrFor,
  bodyComposition,
  daysBetween,
  formatDayMonthLocativeTr,
  round,
  tdeeFor,
  type ActivityLevel,
  type Gender,
  type GoalMilestone,
  type GoalPlan,
  type GoalProfile,
  type OnTrack,
} from "@fitfloow/core";
import { fmtInt, fmtNumber, fmtPct } from "../../lib/format";
import type { Tone } from "../../theme/tokens";
import type { AppIcon } from "../../ui/icons";

/** How the API's on-track verdict reads to a person, and which tone it carries. */
export const ON_TRACK_TR: Record<OnTrack, { label: string; tone: Tone }> = {
  ahead: { label: "Önde", tone: "success" },
  onTrack: { label: "Rotada", tone: "success" },
  behind: { label: "Geride", tone: "warning" },
  stalled: { label: "Durakladı", tone: "danger" },
};

/* ------------------------------------------------------------------ intent */

/** What the person is actually here to do. `lose` is the one the plan engine models. */
export type GoalIntent = "lose" | "maintain" | "gain";

export interface IntentOption {
  value: GoalIntent;
  label: string;
  /** One line, in the second person, saying what choosing this does. */
  body: string;
  icon: AppIcon;
}

export const INTENT_OPTIONS: readonly IntentOption[] = [
  { value: "lose", label: "Yağ yakmak", body: "Bir yağ oranı seç, ne zaman varacağını gün gün planlayayım.", icon: "lose" },
  { value: "maintain", label: "Formunu korumak", body: "Hedef koymadan devam et; günlük kalorini koruma seviyesinde tutayım.", icon: "maintain" },
  { value: "gain", label: "Kas yapmak", body: "Kalorini koruma seviyesinin biraz üstüne alayım, kası yavaş ve temiz kur.", icon: "gain" },
];

/** Reading an existing goal back into the intent picker. */
export function intentForGoal(goal: { targetBodyFatPct: number } | null, currentBodyFatPct: number | null): GoalIntent {
  if (!goal) return "maintain";
  if (currentBodyFatPct !== null && goal.targetBodyFatPct >= currentBodyFatPct) return "maintain";
  return "lose";
}

/* -------------------------------------------------------------------- pace */

export interface PaceOption {
  value: GoalProfile;
  label: string;
  /** What it costs, not what it is called. */
  body: string;
}

export const PACE_OPTIONS: readonly PaceOption[] = [
  { value: "conservative", label: "Sakin", body: "En uzun yol, en az fedakârlık. Kasını en iyi koruyan tempo." },
  { value: "optimal", label: "Dengeli", body: "Araştırmaların önerdiği orta yol: fark edilir hız, sürdürülebilir açlık." },
  { value: "aggressive", label: "Hızlı", body: "En kısa yol. Günlük kalorin belirgin düşer, disiplin ister." },
];

/* ----------------------------------------------------------- Turkish dates */

/**
 * "2026-01-17" → "17 Ocak'ta". The locative suffix harmonises with the month's last vowel and
 * hardens after a voiceless consonant. Core owns the table; re-exported here so screens have one
 * import for everything goal-copy related.
 */
export const dateLocativeTr = formatDayMonthLocativeTr;

/** "bugün" · "yarın" · "4 gün sonra" · "4 hafta sonra" · "geçti". Day-accurate, unlike the plan's
 * week-granular label, which is what the home screen's countdown needs. */
export function etaBetweenTr(fromKey: string, toKey: string): string {
  const days = daysBetween(fromKey, toKey);
  if (days < 0) return "geçti";
  if (days === 0) return "bugün";
  if (days === 1) return "yarın";
  if (days < 14) return `${days} gün sonra`;
  return `${Math.round(days / 7)} hafta sonra`;
}

/* -------------------------------------------------------------- milestones */

export type { GoalMilestone };

const FRACTIONS = [0.25, 0.5, 0.75, 1] as const;

/**
 * Quarter-points of the journey (C4).
 *
 * The API computes these; the local derivation below only runs for a plan cached before C4 shipped,
 * so a roadmap opened offline still has a spine instead of a blank.
 */
export function milestonesOf(plan: GoalPlan, todayKey?: string): GoalMilestone[] {
  if (plan.milestones && plan.milestones.length > 0) return plan.milestones;
  const weeks = plan.roadmap;
  if (weeks.length === 0) return [];
  const from = todayKey ?? plan.startKey;
  const startWeight = weeks[0].startWeightKg;
  const totalLoss = startWeight - plan.targetWeightKg;
  if (totalLoss <= 0.0005) return [];
  const last = weeks[weeks.length - 1];
  const byDate = new Map<string, GoalMilestone>();
  for (const fraction of FRACTIONS) {
    const wanted = startWeight - totalLoss * fraction;
    const week = weeks.find((w) => w.endWeightKg <= wanted + 1e-9) ?? last;
    byDate.set(week.endKey, {
      fraction,
      dateKey: week.endKey,
      weightKg: round(week.endWeightKg, 1),
      bodyFatPct: round(week.endBfPct, 1),
      etaLabelTr: etaBetweenTr(from, week.endKey),
    });
  }
  return [...byDate.values()].sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
}

/* ----------------------------------------------------------------- summary */

/**
 * The one sentence the whole plan collapses into (C4's `summaryTr`), with a local composition for
 * plans cached before it existed.
 */
export function summaryOf(plan: GoalPlan): string {
  if (plan.summaryTr) return plan.summaryTr;
  if (plan.roadmap.length === 0 || plan.estimatedWeeks <= 0) return "Bu hedef için bir plan çıkmadı.";
  const last = plan.roadmap[plan.roadmap.length - 1];
  return (
    `${dateLocativeTr(last.endKey)} ~${fmtNumber(last.endWeightKg, 1)} kg ve ${fmtPct(last.endBfPct, 0)} yağ oranındasın` +
    ` · ${plan.estimatedWeeks} hafta, günde ${fmtInt(plan.initialDailyCalorieTarget)} kcal.`
  );
}

/* ------------------------------------------------------------------ energy */

export interface BodySnapshot {
  sex: Gender;
  weightKg: number;
  bodyFatPct: number;
  heightCm: number;
  birthDate?: string | null;
  activityLevel: ActivityLevel;
  todayKey: string;
}

export interface EnergyEstimate {
  bmr: number;
  /** TDEE with no deficit: what holds your weight where it is. */
  maintenance: number;
  activityMultiplier: number;
  leanMassKg: number;
}

/**
 * On-device maintenance estimate, using the same Katch/Mifflin blend the goal engine uses, so the
 * number on the diet tab can never disagree with the number on the plan.
 */
export function maintenanceEnergy(body: BodySnapshot): EnergyEstimate {
  const settings = DEFAULT_GOAL_SETTINGS;
  const { leanMassKg } = bodyComposition(body.weightKg, body.bodyFatPct);
  const age = body.birthDate ? ageFromBirthDate(body.birthDate, body.todayKey) : null;
  const { bmr } = bmrFor({ sex: body.sex, weightKg: body.weightKg, heightCm: body.heightCm, leanMassKg, age, settings });
  return {
    bmr,
    maintenance: tdeeFor(bmr, body.activityLevel, settings),
    activityMultiplier: settings.activityMultipliers[body.activityLevel] ?? 1.55,
    leanMassKg,
  };
}

/** Lean-gain surplus: 10 % over maintenance. Small enough that most of the gain is tissue, not fat. */
export const GAIN_SURPLUS_PCT = 0.1;

/** Maintenance plus the lean-gain surplus, rounded to a number a person can actually aim at. */
export function gainCalories(maintenance: number): number {
  return Math.round((maintenance * (1 + GAIN_SURPLUS_PCT)) / 10) * 10;
}
