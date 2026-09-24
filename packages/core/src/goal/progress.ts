/**
 * Goal progress from real data (03-goal-engine.md §Progress).
 *
 * Every weight decision reads the EWMA trend rather than a raw weigh-in. The trend lags a falling
 * weight by roughly 1/alpha days, so comparing it against the plan's *raw* expected weight would
 * report "behind" forever. We therefore push the plan's expected trajectory through the identical
 * EWMA (same dates, same gaps, same alpha) and compare trend against trend; `expectedWeightKg` in
 * the DTO stays the plain roadmap value the UI should draw.
 *
 * T7: direction-aware. "ahead" always means *further along the plan's direction than planned*
 * (cut: lighter than planned; bulk: heavier; recomp: leaner). A recomp's weight barely moves by
 * design, so its goal bar, verdict and projection come from the body-fat measurements
 * (`bodyFatTrend`), never from the scale.
 */
import type { GoalDirection, GoalDTO, GoalProgress, RoadmapWeek } from "../schemas/goal";
import type { OnTrack } from "../schemas/common";
import type { GoalSettings } from "../schemas/settings";
import { daysBetween, shiftKey } from "../time/index";
import { clamp, round } from "../utils/index";
import { ewmaChange, ewmaSlopePerWeek, ewmaTrend, type WeightPoint } from "./ewma";
import { isLogged, type DayIntake } from "./recalibrate";

export type GoalLike = Pick<GoalDTO, "targetBodyFatPct" | "start" | "plan"> & { direction?: GoalDirection };

/** Direction of a goal or plan, `cut` for anything stored before directions existed. */
export function directionOf(goal: GoalLike): GoalDirection {
  return goal.direction ?? goal.plan.direction ?? "cut";
}

/** +1 when the plan moves weight up (bulk), −1 when it moves it down (cut, recomp). */
export function weightSign(direction: GoalDirection): 1 | -1 {
  return direction === "bulk" ? 1 : -1;
}

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

export interface ExpectedBody {
  weightKg: number;
  bodyFatPct: number;
  leanMassKg: number;
}

/** Lean mass of a roadmap end point; plans stored before T7 lack the field, so derive it. */
const leanOf = (stored: number | undefined, weightKg: number, bodyFatPct: number) => stored ?? weightKg * (1 - bodyFatPct / 100);

/** Expected weight / body fat / lean mass at `dayOffset`, linearly interpolated inside the roadmap week. */
export function expectedAtDay(goal: GoalLike, dayOffset: number): ExpectedBody {
  const roadmap = goal.plan.roadmap;
  if (roadmap.length === 0) return { weightKg: goal.start.weightKg, bodyFatPct: goal.start.bodyFatPct, leanMassKg: goal.start.leanMassKg };
  if (dayOffset <= 0) {
    const w = roadmap[0];
    return { weightKg: w.startWeightKg, bodyFatPct: w.startBfPct, leanMassKg: leanOf(w.startLeanMassKg, w.startWeightKg, w.startBfPct) };
  }
  const weekIndex = Math.floor(dayOffset / 7);
  if (weekIndex >= roadmap.length) {
    const last = roadmap[roadmap.length - 1];
    return { weightKg: last.endWeightKg, bodyFatPct: last.endBfPct, leanMassKg: leanOf(last.endLeanMassKg, last.endWeightKg, last.endBfPct) };
  }
  const w = roadmap[weekIndex];
  const frac = (dayOffset - weekIndex * 7) / 7;
  const leanStart = leanOf(w.startLeanMassKg, w.startWeightKg, w.startBfPct);
  const leanEnd = leanOf(w.endLeanMassKg, w.endWeightKg, w.endBfPct);
  return {
    weightKg: w.startWeightKg + (w.endWeightKg - w.startWeightKg) * frac,
    bodyFatPct: w.startBfPct + (w.endBfPct - w.startBfPct) * frac,
    leanMassKg: leanStart + (leanEnd - leanStart) * frac,
  };
}

/** TDEE the plan assumed for the week containing `dayOffset`. */
export function tdeeAtDay(goal: GoalLike, dayOffset: number): number {
  const w = roadmapWeekAt(goal.plan.roadmap, Math.max(0, dayOffset));
  return w ? w.dailyCalorieTarget + w.weeklyDeficitKcal / 7 : goal.plan.tdee;
}

/**
 * Recomp verdict from the tape measurements (docs/plan/11-muscle-gain-engine.md §Recomp on body fat).
 * All deviations are read at `latestKey`, the day of the latest reading used.
 */
export interface BodyFatTrend {
  /** Readings used: one per day, since the plan (re)started, inside the trailing window, up to today. */
  count: number;
  /** Days from the first to the latest reading used. */
  spanDays: number;
  latestKey: string | null;
  /** The reading before the latest one, where the verdict is re-checked before anything is proposed. */
  previousKey: string | null;
  /** Weight on the latest reading. */
  latestWeightKg: number | null;
  /** Enough readings, spread over enough days, the latest recent enough: `status` is set. */
  enough: boolean;
  /** Body fat on the fitted trend at `latestKey`. */
  bodyFatPct: number | null;
  /** Fitted minus planned body fat, points (positive = fatter than planned). */
  deviationPts: number | null;
  /** The gap that counts: max(tolerance, z × standard error of the deviation). */
  thresholdPts: number | null;
  /** Observed body-fat change per week (negative = falling). */
  slopePtsPerWeek: number | null;
  /** Fitted minus planned lean mass, kg (negative = less lean than planned). */
  deviationLeanKg: number | null;
  thresholdLeanKg: number | null;
  /** Observed lean-mass change per week. */
  leanSlopeKgPerWeek: number | null;
  /** On body fat, when `enough`: ahead / onTrack / behind / stalled. null otherwise. */
  status: OnTrack | null;
  /** When `enough`: lean mass is below plan by more than its threshold and falling. */
  leanLoss: boolean;
}

/** Least-squares line through (x, y): the fitted value at `x`, its standard-error factor and the scatter. */
function fitLine(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const slope = sxy / sxx;
  const at = (x: number) => my + slope * (x - mx);
  let ssr = 0;
  for (let i = 0; i < n; i++) ssr += (ys[i] - at(xs[i])) ** 2;
  return {
    slope,
    at,
    /** SE of the fitted value at `x` is σ × this. */
    seFactor: (x: number) => Math.sqrt(1 / n + (x - mx) ** 2 / sxx),
    /** Residual SD (n − 2 degrees of freedom); null below three points. */
    scatter: n >= 3 ? Math.sqrt(ssr / (n - 2)) : null,
  };
}

const EMPTY_TREND: BodyFatTrend = {
  count: 0,
  spanDays: 0,
  latestKey: null,
  previousKey: null,
  latestWeightKg: null,
  enough: false,
  bodyFatPct: null,
  deviationPts: null,
  thresholdPts: null,
  slopePtsPerWeek: null,
  deviationLeanKg: null,
  thresholdLeanKg: null,
  leanSlopeKgPerWeek: null,
  status: null,
  leanLoss: false,
};

/**
 * The tape-measurement trend against the plan. On a recomp the scale barely moves by design, so
 * progress is body fat and the lean mass derived from it — but a Navy reading is only good to about
 * ±1 point while the plan moves ~0.3 points a week, so a single reading never decides:
 *
 *  1. readings since the plan (re)started, within `bfWindowDays` of today, one per day (last wins);
 *  2. each is compared with the roadmap's expected body fat / lean mass on its day (the residual);
 *  3. a least-squares line through the residuals gives the deviation at the latest reading and its
 *     standard error (noise = the literature floor or the person's own scatter, whichever is larger);
 *  4. a deviation counts only beyond max(tolerance, z × SE), and only with `bfMinMeasurements`
 *     readings over `bfMinSpanDays`, the latest no older than `bfMaxAgeDays`.
 */
export function bodyFatTrend(goal: GoalLike, bodyEntries: BodyPoint[], todayKey: string, settings: GoalSettings): BodyFatTrend {
  const a = settings.adaptive;
  const planStartKey = goal.plan.startKey || goal.start.dateKey;
  const windowStartKey = shiftKey(todayKey, -a.bfWindowDays);
  const fromKey = planStartKey > windowStartKey ? planStartKey : windowStartKey;
  const byDay = new Map<string, BodyPoint>();
  for (const b of bodyEntries) {
    if (b.dateKey < fromKey || b.dateKey > todayKey || !Number.isFinite(b.bodyFatPct) || !(b.weightKg > 0)) continue;
    byDay.set(b.dateKey, b);
  }
  const points = [...byDay.values()].sort((x, y) => (x.dateKey < y.dateKey ? -1 : 1));
  const count = points.length;
  if (count === 0) return EMPTY_TREND;
  const latest = points[count - 1];
  const spanDays = daysBetween(points[0].dateKey, latest.dateKey);
  const base = {
    ...EMPTY_TREND,
    count,
    spanDays,
    latestKey: latest.dateKey,
    previousKey: count >= 2 ? points[count - 2].dateKey : null,
    latestWeightKg: latest.weightKg,
  };
  if (count < 2) return base;

  const xs = points.map((p) => daysBetween(planStartKey, p.dateKey));
  const expected = xs.map((x) => expectedAtDay(goal, x));
  const leans = points.map((p) => p.weightKg * (1 - p.bodyFatPct / 100));
  const bfRes = fitLine(xs, points.map((p, i) => p.bodyFatPct - expected[i].bodyFatPct));
  const leanRes = fitLine(xs, leans.map((l, i) => l - expected[i].leanMassKg));
  const xLast = xs[count - 1];
  const expLast = expected[count - 1];
  const deviationPts = bfRes.at(xLast);
  const deviationLeanKg = leanRes.at(xLast);
  const slopePtsPerWeek = fitLine(xs, points.map((p) => p.bodyFatPct)).slope * 7;
  const leanSlopeKgPerWeek = fitLine(xs, leans).slope * 7;

  const meanWeight = points.reduce((s, p) => s + p.weightKg, 0) / count;
  const sigmaBf = Math.max(a.bfNoisePts, bfRes.scatter ?? 0);
  // One point of body fat is weight/100 kg of lean mass; the scale reading adds its own noise.
  const sigmaLean = Math.max((meanWeight / 100) * Math.hypot(a.bfNoisePts, a.weighInNoisePctBw), leanRes.scatter ?? 0);
  const thresholdPts = Math.max(a.bfTolerancePts, a.bfConfidenceZ * sigmaBf * bfRes.seFactor(xLast));
  const thresholdLeanKg = Math.max(a.leanToleranceKg, a.bfConfidenceZ * sigmaLean * leanRes.seFactor(xLast));

  const enough = count >= a.bfMinMeasurements && spanDays >= a.bfMinSpanDays && daysBetween(latest.dateKey, todayKey) <= a.bfMaxAgeDays;
  let status: OnTrack | null = null;
  if (enough) {
    if (deviationPts >= thresholdPts) status = slopePtsPerWeek > -a.bfStallPtsPerWeek ? "stalled" : "behind";
    else if (deviationPts <= -thresholdPts) status = "ahead";
    else status = "onTrack";
  }
  return {
    ...base,
    enough,
    bodyFatPct: round(expLast.bodyFatPct + deviationPts, 2),
    deviationPts: round(deviationPts, 2),
    thresholdPts: round(thresholdPts, 2),
    slopePtsPerWeek: round(slopePtsPerWeek, 3),
    deviationLeanKg: round(deviationLeanKg, 2),
    thresholdLeanKg: round(thresholdLeanKg, 2),
    leanSlopeKgPerWeek: round(leanSlopeKgPerWeek, 3),
    status,
    leanLoss: enough && deviationLeanKg <= -thresholdLeanKg && leanSlopeKgPerWeek < 0,
  };
}

/** Body-fat points the plan takes off per week, on average (recomp projection fallback). */
function plannedBfRatePerWeek(goal: GoalLike): number {
  const roadmap = goal.plan.roadmap;
  if (roadmap.length === 0) return 0;
  return (roadmap[0].startBfPct - roadmap[roadmap.length - 1].endBfPct) / roadmap.length;
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

  /* distance to the goal — measured along the plan's direction */
  const direction = directionOf(goal);
  const sign = weightSign(direction);
  const targetWeightKg = goal.plan.targetWeightKg;
  const span = sign * (targetWeightKg - goal.start.weightKg);
  let percentComplete = actualWeightKg === null || span <= 0 ? 0 : clamp((sign * (actualWeightKg - goal.start.weightKg)) / span, 0, 1) * 100;
  if (direction === "recomp") {
    // Weight is nearly flat on a recomp; body fat is what moves.
    const bfSpan = goal.start.bodyFatPct - goal.targetBodyFatPct;
    percentComplete = actualBodyFatPct === null || bfSpan <= 0 ? 0 : clamp((goal.start.bodyFatPct - actualBodyFatPct) / bfSpan, 0, 1) * 100;
  }
  const kgToGo = Math.max(0, sign * (targetWeightKg - (actualWeightKg ?? goal.start.weightKg)));
  const bfToGo = direction === "bulk" ? 0 : Math.max(0, (actualBodyFatPct ?? goal.start.bodyFatPct) - goal.targetBodyFatPct);

  /* on-track classification (diff > 0 = further along than planned) and the projected end */
  let onTrack: OnTrack = "onTrack";
  /** Distance left and the rate it is covered at per week (null: nothing to project from). */
  let toGo = 0;
  let ratePerWeek: number | null = null;
  if (direction === "recomp") {
    // Weight is meant to stay nearly flat, so the scale says nothing here: body fat and lean mass
    // from the tape measurements do, and only once there are enough of them.
    const bf = bodyFatTrend(goal, bodyEntries, todayKey, settings);
    onTrack = bf.status ?? "onTrack";
    toGo = bfToGo;
    if (actualBodyFatPct !== null) ratePerWeek = bf.enough && bf.slopePtsPerWeek !== null ? -bf.slopePtsPerWeek : plannedBfRatePerWeek(goal);
  } else {
    if (actualWeightKg !== null && expectedTrendNow !== null) {
      const ahead = sign * (actualWeightKg - expectedTrendNow);
      if (ahead >= ON_TRACK_TOLERANCE_KG) onTrack = "ahead";
      else if (ahead <= -ON_TRACK_TOLERANCE_KG) onTrack = "behind";
    }
    const twoWeekChange = ewmaChange(trend, shiftKey(todayKey, -14), todayKey);
    if (weeksElapsed >= 2 && twoWeekChange !== null && sign * twoWeekChange < -STALL_THRESHOLD_KG) onTrack = "stalled";
    // the observed slope, or the plan rate while the slope is unknown
    const slope = ewmaSlopePerWeek(trend, todayKey, 28);
    toGo = kgToGo;
    if (actualWeightKg !== null) ratePerWeek = slope === null ? goal.plan.initialRateKgPerWeek : sign * slope;
  }
  let weeksRemainingProjected: number | null = null;
  let projectedDate: string | null = null;
  if (ratePerWeek !== null && ratePerWeek > 0.01) {
    weeksRemainingProjected = Math.max(0, Math.ceil(toGo / ratePerWeek));
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

/**
 * T7 — trend minus the plan's lag-matched expected trend at `atKey`, kg (positive = heavier than
 * planned). Same comparison `computeGoalProgress` makes for today, available for any day so the
 * adaptive goal can check that a deviation has *held*. null without weigh-ins up to that day.
 */
export function trendDeviationAt(goal: GoalLike, weighIns: WeightPoint[], atKey: string, settings: GoalSettings): number | null {
  const planStartKey = goal.plan.startKey || goal.start.dateKey;
  const trend = ewmaTrend(
    weighIns.filter((p) => p.dateKey <= atKey),
    settings.ewma
  );
  if (trend.length === 0) return null;
  const expected = ewmaTrend(
    trend.map((p) => ({ dateKey: p.dateKey, weightKg: expectedAtDay(goal, daysBetween(planStartKey, p.dateKey)).weightKg })),
    settings.ewma
  );
  return trend[trend.length - 1].ewma - expected[expected.length - 1].ewma;
}
