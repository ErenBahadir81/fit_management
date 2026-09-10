/**
 * Pure helpers for goal setup + roadmap. The instant preview runs the same engine the API runs
 * (`computeGoalPlan`, default settings); the server answer stays authoritative.
 */
import {
  DEFAULT_GOAL_SETTINGS,
  MIN_SAFE_BODY_FAT,
  ageFromBirthDate,
  clamp,
  computeGoalPlan,
  daysBetween,
  expectedAtDay,
  round,
  shiftKey,
  type ActivityLevel,
  type BodyTrends,
  type Gender,
  type GoalDTO,
  type GoalPlan,
  type GoalProfile,
  type GoalWarning,
  type RoadmapWeek,
} from "@fitfloow/core";
import type { Tone } from "../../theme/tokens";

export const TARGET_STEP = 0.5;

export interface Bounds {
  min: number;
  max: number;
}

/** Slider range: essential-fat floor … one step below the current estimate (collapses when already there). */
export function targetBounds(sex: Gender, currentBf: number): Bounds {
  const min = MIN_SAFE_BODY_FAT[sex];
  const max = Math.max(min, Math.floor((currentBf - TARGET_STEP) / TARGET_STEP + 1e-9) * TARGET_STEP);
  return { min, max: round(max, 1) };
}

/** Round to the 0.5 grid and clamp; NaN falls to the floor. */
export function snapTarget(value: number, bounds: Bounds, step = TARGET_STEP): number {
  if (!Number.isFinite(value)) return bounds.min;
  const snapped = Math.round(value / step) * step;
  return round(clamp(snapped, bounds.min, bounds.max), 1);
}

export function defaultTarget(sex: Gender, currentBf: number): number {
  return snapTarget(currentBf - 5, targetBounds(sex, currentBf));
}

export const PROFILE_OPTIONS: { value: GoalProfile; label: string; hint: string }[] = [
  { value: "conservative", label: "Temkinli", hint: "Daha yavaş, kas koruması en yüksek. Uzun vadede en rahatı." },
  { value: "optimal", label: "Optimal", hint: "Araştırmaların önerdiği denge: hız ve sürdürülebilirlik." },
  { value: "aggressive", label: "Agresif", hint: "Hızlı ama zorlayıcı. Kısa dönemler için, sıkı takiple." },
];

export const WARNING_TR: Record<GoalWarning, { label: string; tone: Tone }> = {
  TARGET_ABOVE_CURRENT: { label: "Hedef şu anki oranın üstünde", tone: "danger" },
  TARGET_TOO_LOW: { label: "Esansiyel yağın altında — sağlıksız", tone: "danger" },
  FLOOR_LIMITED: { label: "Kalori tabanı hızı sınırladı", tone: "warning" },
  LONG_HORIZON: { label: "Bir yıldan uzun sürer", tone: "warning" },
  NO_BODY_ENTRY: { label: "Önce bir ölçüm gerekli", tone: "danger" },
  ALPERT_LIMITED: { label: "Yağ mobilizasyonu hızı sınırladı", tone: "neutral" },
};

export interface InstantPlanInput {
  sex: Gender;
  weightKg: number;
  bodyFatPct: number;
  heightCm: number;
  birthDate?: string | null;
  activityLevel: ActivityLevel;
  targetBodyFatPct: number;
  profile: GoalProfile;
  todayKey: string;
  tdeeOverride?: number | null;
}

/** Instant client-side plan (default admin settings). */
export function instantPlan(i: InstantPlanInput): GoalPlan {
  return computeGoalPlan({
    sex: i.sex,
    weightKg: i.weightKg,
    bodyFatPct: i.bodyFatPct,
    heightCm: i.heightCm,
    age: i.birthDate ? ageFromBirthDate(i.birthDate, i.todayKey) : null,
    activityLevel: i.activityLevel,
    targetBodyFatPct: i.targetBodyFatPct,
    profile: i.profile,
    startDate: i.todayKey,
    settings: DEFAULT_GOAL_SETTINGS,
    tdeeOverride: i.tdeeOverride ?? null,
  });
}

export type WeekState = "past" | "current" | "future";
export interface RoadmapRow {
  week: RoadmapWeek;
  state: WeekState;
  /** Trend weight at the week's end (past weeks) or now (current week). */
  actualEndKg: number | null;
  /** actual − expected at the same point (negative = ahead). */
  deltaVsExpectedKg: number | null;
}

function ewmaAtOrBefore(trends: BodyTrends | undefined, dateKey: string): number | null {
  if (!trends) return null;
  let v: number | null = null;
  for (const p of trends.points) {
    if (p.dateKey > dateKey) break;
    if (p.weightEwma !== null) v = p.weightEwma;
  }
  return v;
}

/** Week list rows: state per week + actual-vs-expected for the weeks that already happened. */
export function roadmapRows(goal: GoalDTO, trends: BodyTrends | undefined, todayKey: string): RoadmapRow[] {
  return goal.plan.roadmap.map((week) => {
    const state: WeekState = todayKey > week.endKey ? "past" : todayKey < week.startKey ? "future" : "current";
    if (state === "future") return { week, state, actualEndKg: null, deltaVsExpectedKg: null };
    const at = state === "past" ? week.endKey : todayKey;
    const actual = ewmaAtOrBefore(trends, at);
    const expected = state === "past" ? week.endWeightKg : week.startWeightKg + (week.endWeightKg - week.startWeightKg) * (daysBetween(week.startKey, todayKey) / 7);
    return { week, state, actualEndKg: actual === null ? null : round(actual, 2), deltaVsExpectedKg: actual === null ? null : round(actual - expected, 2) };
  });
}

export interface PlanRow {
  x: number;
  dateKey: string;
  expected: number;
  actual: number | null;
  raw: number | null;
}

/** Daily rows from the plan start to the target date: planned trajectory + the real trend so far. */
export function planChartRows(goal: GoalDTO, trends: BodyTrends | undefined, todayKey: string): PlanRow[] {
  const start = goal.plan.startKey || goal.start.dateKey;
  const end = goal.plan.targetDate > todayKey ? goal.plan.targetDate : todayKey;
  const n = Math.max(0, daysBetween(start, end));
  const byKey = new Map(trends?.points.map((p) => [p.dateKey, p]) ?? []);
  const rows: PlanRow[] = [];
  for (let i = 0; i <= n; i++) {
    const dateKey = shiftKey(start, i);
    const p = dateKey <= todayKey ? byKey.get(dateKey) : undefined;
    rows.push({ x: i, dateKey, expected: round(expectedAtDay(goal, i).weightKg, 2), actual: p?.weightEwma ?? null, raw: p?.weightKg ?? null });
  }
  return rows;
}
