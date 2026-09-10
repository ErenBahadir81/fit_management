/**
 * Goal progress from real data (03-goal-engine.md §Progress).
 *
 * Every weight decision reads the EWMA trend rather than a raw weigh-in. The trend lags a falling
 * weight by roughly 1/alpha days, so comparing it against the plan's *raw* expected weight would
 * report "behind" forever. We therefore push the plan's expected trajectory through the identical
 * EWMA (same dates, same gaps, same alpha) and compare trend against trend; `expectedWeightKg` in
 * the DTO stays the plain roadmap value the UI should draw.
 */
import type { GoalDTO, GoalProgress, RoadmapWeek } from "../schemas/goal";
import type { OnTrack } from "../schemas/common";
import type { GoalSettings } from "../schemas/settings";
import { daysBetween, shiftKey } from "../time/index";
import { clamp, round } from "../utils/index";
import { ewmaChange, ewmaSlopePerWeek, ewmaTrend, type WeightPoint } from "./ewma";
import { isLogged, type DayIntake } from "./recalibrate";

export type GoalLike = Pick<GoalDTO, "targetBodyFatPct" | "start" | "plan">;

export interface BodyPoint {
  dateKey: string;
  weightKg: number;
  bodyFatPct: number;
  waistCm?: number | null;
}

/** kg difference at which the plan is considered missed in either direction. */
export const ON_TRACK_TOLERANCE_KG = 0.4;
/** A trend that has moved less than this over 14 days counts as a plateau. */
export const STALL_THRESHOLD_KG = -0.1;

/** Roadmap week covering `dayOffset` days after the goal start (clamped to the plan). */
export function roadmapWeekAt(roadmap: RoadmapWeek[], dayOffset: number): RoadmapWeek | null {
  if (roadmap.length === 0) return null;
  const i = clamp(Math.floor(dayOffset / 7), 0, roadmap.length - 1);
  return roadmap[i];
}

/** Expected weight / body fat at `dayOffset`, linearly interpolated inside the roadmap week. */
export function expectedAtDay(goal: GoalLike, dayOffset: number): { weightKg: number; bodyFatPct: number } {
  const roadmap = goal.plan.roadmap;
  if (roadmap.length === 0) return { weightKg: goal.start.weightKg, bodyFatPct: goal.start.bodyFatPct };
  if (dayOffset <= 0) return { weightKg: roadmap[0].startWeightKg, bodyFatPct: roadmap[0].startBfPct };
  const weekIndex = Math.floor(dayOffset / 7);
  if (weekIndex >= roadmap.length) {
    const last = roadmap[roadmap.length - 1];
    return { weightKg: last.endWeightKg, bodyFatPct: last.endBfPct };
  }
  const w = roadmap[weekIndex];
  const frac = (dayOffset - weekIndex * 7) / 7;
  return {
    weightKg: w.startWeightKg + (w.endWeightKg - w.startWeightKg) * frac,
    bodyFatPct: w.startBfPct + (w.endBfPct - w.startBfPct) * frac,
  };
}

/** TDEE the plan assumed for the week containing `dayOffset`. */
export function tdeeAtDay(goal: GoalLike, dayOffset: number): number {
  const w = roadmapWeekAt(goal.plan.roadmap, Math.max(0, dayOffset));
  return w ? w.dailyCalorieTarget + w.weeklyDeficitKcal / 7 : goal.plan.tdee;
}

export function computeGoalProgress(
  goal: GoalLike,
  weighIns: WeightPoint[],
  bodyEntries: BodyPoint[],
  dayIntake: DayIntake[],
  todayKey: string,
  settings: GoalSettings
): GoalProgress {
  const startKey = goal.start.dateKey;
  // A recalibration re-simulates the roadmap from the day it happened, so the plan timeline and
  // the goal timeline can differ; elapsed time is measured from the goal, the roadmap from the plan.
  const planStartKey = goal.plan.startKey || startKey;
  const planOffset = Math.max(0, daysBetween(planStartKey, todayKey));
  const roadmap = goal.plan.roadmap;
  const daysElapsed = Math.max(0, daysBetween(startKey, todayKey));
  const weeksElapsed = Math.floor(daysElapsed / 7);
  const planWeeksElapsed = Math.floor(planOffset / 7);
  const expected = expectedAtDay(goal, planOffset);

  /* actual weight — EWMA trend, plus the lag-matched expected trend for the comparison */
  const usable = weighIns.filter((p) => p.dateKey <= todayKey);
  const trend = ewmaTrend(usable, settings.ewma);
  const actualWeightKg = trend.length > 0 ? trend[trend.length - 1].ewma : null;
  const expectedTrend = ewmaTrend(
    trend.map((p) => ({ dateKey: p.dateKey, weightKg: expectedAtDay(goal, daysBetween(planStartKey, p.dateKey)).weightKg })),
    settings.ewma
  );
  const expectedTrendNow = expectedTrend.length > 0 ? expectedTrend[expectedTrend.length - 1].ewma : null;

  const latestBody = bodyEntries.filter((b) => b.dateKey <= todayKey).sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1)).at(-1) ?? null;
  const actualBodyFatPct = latestBody ? latestBody.bodyFatPct : null;

  /* banked vs planned deficit over the elapsed days */
  const intakeByKey = new Map(dayIntake.map((d) => [d.dateKey, d]));
  let deficitBankedKcal = 0;
  let deficitPlannedKcal = 0;
  for (let i = 0; i <= daysElapsed; i++) {
    const key = shiftKey(startKey, i);
    const planDay = daysBetween(planStartKey, key);
    const tdee = tdeeAtDay(goal, planDay);
    const week = roadmapWeekAt(roadmap, Math.max(0, planDay));
    if (week) deficitPlannedKcal += week.weeklyDeficitKcal / 7;
    const day = intakeByKey.get(key);
    if (isLogged(day)) deficitBankedKcal += tdee - day!.kcal;
  }

  /* distance to the goal */
  const targetWeightKg = goal.plan.targetWeightKg;
  const span = goal.start.weightKg - targetWeightKg;
  const percentComplete = actualWeightKg === null || span <= 0 ? 0 : clamp((goal.start.weightKg - actualWeightKg) / span, 0, 1) * 100;
  const kgToGo = Math.max(0, (actualWeightKg ?? goal.start.weightKg) - targetWeightKg);
  const bfToGo = Math.max(0, (actualBodyFatPct ?? goal.start.bodyFatPct) - goal.targetBodyFatPct);

  /* on-track classification */
  let onTrack: OnTrack = "onTrack";
  if (actualWeightKg !== null && expectedTrendNow !== null) {
    const diff = actualWeightKg - expectedTrendNow;
    if (diff <= -ON_TRACK_TOLERANCE_KG) onTrack = "ahead";
    else if (diff >= ON_TRACK_TOLERANCE_KG) onTrack = "behind";
  }
  const twoWeekChange = ewmaChange(trend, shiftKey(todayKey, -14), todayKey);
  if (weeksElapsed >= 2 && twoWeekChange !== null && twoWeekChange > STALL_THRESHOLD_KG) onTrack = "stalled";

  /* projection from the observed slope (falls back to the plan rate when the slope is unknown) */
  const slope = ewmaSlopePerWeek(trend, todayKey, 28);
  const observedRate = slope === null ? goal.plan.initialRateKgPerWeek : -slope;
  let weeksRemainingProjected: number | null = null;
  let projectedDate: string | null = null;
  if (actualWeightKg !== null && observedRate > 0.01) {
    weeksRemainingProjected = Math.max(0, Math.ceil(kgToGo / observedRate));
    projectedDate = shiftKey(todayKey, 7 * weeksRemainingProjected);
  }

  return {
    daysElapsed,
    weeksElapsed,
    weekIndexInPlan: roadmap.length === 0 ? 0 : Math.min(planWeeksElapsed + 1, roadmap.length),
    expectedWeightKg: round(expected.weightKg, 2),
    actualWeightKg: actualWeightKg === null ? null : round(actualWeightKg, 2),
    expectedBodyFatPct: round(expected.bodyFatPct, 2),
    actualBodyFatPct,
    deficitBankedKcal: round(deficitBankedKcal, 0),
    deficitPlannedKcal: round(deficitPlannedKcal, 0),
    percentComplete: round(percentComplete, 1),
    kgToGo: round(kgToGo, 2),
    bfToGo: round(bfToGo, 2),
    onTrack,
    projectedDate,
    weeksRemainingPlan: Math.max(0, roadmap.length - planWeeksElapsed),
    weeksRemainingProjected,
    // The roadmap is indexed on the *plan* timeline (a recalibration re-simulates it from the
    // day it ran), so `currentWeek` must use planOffset — exactly like weekIndexInPlan and tdeeAtDay.
    currentWeek: roadmapWeekAt(roadmap, planOffset),
  };
}
