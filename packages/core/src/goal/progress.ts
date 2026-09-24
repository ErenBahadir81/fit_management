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
import { clamp, mean, round } from "../utils/index";
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
 * Levels are read at `latestKey`, the day of the latest reading used.
 */
export interface BodyFatTrend {
  /** Weeks with a reading, since the plan (re)started, inside the trailing window, up to today. */
  count: number;
  /** Days from the first to the latest reading used. */
  spanDays: number;
  latestKey: string | null;
  /** The last reading of the week before, where the verdict is re-checked before anything is proposed. */
  previousKey: string | null;
  /** Weight on the latest reading. */
  latestWeightKg: number | null;
  /** Enough weeks of readings, spread over enough days, the latest recent enough: `status` is set. */
  enough: boolean;
  /**
   * Body fat now, smoothed: the line through the readings of the window, whichever plan they belong
   * to, read at the latest one (`smoothedBodyFat`). null below `bfMinMeasurements` weeks of readings.
   */
  smoothedPct: number | null;
  /** Body fat on the fitted plan-relative line at `latestKey`. */
  bodyFatPct: number | null;
  /** Fitted minus planned body fat at `latestKey`, points (positive = fatter than planned). */
  deviationPts: number | null;
  /** Observed body-fat change per week (negative = falling). */
  slopePtsPerWeek: number | null;
  /** Observed minus planned body-fat change per week (positive = losing slower than planned). */
  paceGapPtsPerWeek: number | null;
  /** `paceGapPtsPerWeek` in standard errors: how sure the pace really differs from the plan. */
  paceZ: number | null;
  /**
   * The pace itself is shown to be slower than planned (`paceZ` ≥ `bfConfidenceZ`). Only then is
   * eating less the answer; a gap without it (e.g. past the plan's end) calls for more time.
   */
  paceSlow: boolean;
  /** Fitted minus planned lean mass at `latestKey`, kg (negative = less lean than planned). */
  deviationLeanKg: number | null;
  /** Observed lean-mass change per week. */
  leanSlopeKgPerWeek: number | null;
  /** Observed minus planned lean-mass change per week, in standard errors (negative = losing lean). */
  leanPaceZ: number | null;
  /** The latest reading is past the roadmap's end: the verdict compares with the target itself. */
  planEnded: boolean;
  /** On body fat, when `enough`: ahead / onTrack / behind / stalled. null otherwise. */
  status: OnTrack | null;
  /** When `enough`: lean mass is below plan and falling, at a pace that is not noise. */
  leanLoss: boolean;
}

interface Reading {
  /** Last reading day of the week. */
  dateKey: string;
  /** Mean day of the week's readings, counted from the bucketing anchor. */
  day: number;
  bodyFatPct: number;
  weightKg: number;
}

/**
 * Usable tape readings in [fromKey, toKey], one per day (the last of a day in input order wins),
 * then one per week counted from `anchorKey` (the week's mean): several readings in a week share
 * their technique and bloating, so they are not independent evidence. Oldest first.
 */
function weeklyReadings(bodyEntries: BodyPoint[], anchorKey: string, fromKey: string, toKey: string): Reading[] {
  const byDay = new Map<string, BodyPoint>();
  for (const b of bodyEntries) {
    if (b.dateKey < fromKey || b.dateKey > toKey || !Number.isFinite(b.bodyFatPct) || !(b.weightKg > 0)) continue;
    byDay.set(b.dateKey, b);
  }
  const weeks = new Map<number, BodyPoint[]>();
  for (const b of byDay.values()) {
    const w = Math.floor(daysBetween(anchorKey, b.dateKey) / 7);
    weeks.set(w, [...(weeks.get(w) ?? []), b]);
  }
  return [...weeks.values()]
    .map((pts) => {
      const last = pts.reduce((a, b) => (b.dateKey > a.dateKey ? b : a));
      return {
        dateKey: last.dateKey,
        day: mean(pts.map((p) => daysBetween(anchorKey, p.dateKey))),
        bodyFatPct: mean(pts.map((p) => p.bodyFatPct)),
        weightKg: mean(pts.map((p) => p.weightKg)),
      };
    })
    .sort((x, y) => x.day - y.day);
}

/** Least-squares line through (x, y): the fitted value at `x`, its SE factor, the slope in SEs and the scatter. */
function fitLine(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const at = (x: number) => my + slope * (x - mx);
  let ssr = 0;
  for (let i = 0; i < n; i++) ssr += (ys[i] - at(xs[i])) ** 2;
  return {
    slope,
    at,
    /** SE of the fitted value at `x` is σ × this. */
    seFactor: (x: number) => Math.sqrt(1 / n + (sxx > 0 ? (x - mx) ** 2 / sxx : 0)),
    /** The slope in standard errors, for a reading noise σ. */
    slopeZ: (sigma: number) => (slope * Math.sqrt(sxx)) / sigma,
    /** Residual SD (n − 2 degrees of freedom); null below three points. */
    scatter: n >= 3 ? Math.sqrt(ssr / (n - 2)) : null,
  };
}

/**
 * The goal's readings of the window as one line, read at the latest reading: the value, its SE
 * factor and the scatter. Counted from the goal start (not the plan's), in weeks anchored there,
 * so a re-plan does not reset it and every caller gets the same value whatever history it loads.
 */
function smoothedFit(goal: GoalLike, bodyEntries: BodyPoint[], todayKey: string, settings: GoalSettings) {
  const goalStartKey = goal.start.dateKey;
  const windowStartKey = shiftKey(todayKey, -settings.adaptive.bfWindowDays);
  const readings = weeklyReadings(bodyEntries, goalStartKey, goalStartKey > windowStartKey ? goalStartKey : windowStartKey, todayKey);
  if (readings.length < Math.max(2, settings.adaptive.bfMinMeasurements)) return null;
  const xs = readings.map((r) => r.day);
  const line = fitLine(
    xs,
    readings.map((r) => r.bodyFatPct)
  );
  const xLast = xs[xs.length - 1];
  return { pct: line.at(xLast), seFactor: line.seFactor(xLast), scatter: line.scatter };
}

/**
 * Body fat now, smoothed: the least-squares line through the goal's readings of the last
 * `bfWindowDays` (whichever plan they belong to, one per week), read at the latest one. A re-plan
 * does not reset it. null below `bfMinMeasurements` weeks of readings.
 */
export function smoothedBodyFat(goal: GoalLike, bodyEntries: BodyPoint[], todayKey: string, settings: GoalSettings): number | null {
  const fit = smoothedFit(goal, bodyEntries, todayKey, settings);
  return fit === null ? null : round(fit.pct, 2);
}

const EMPTY_TREND: BodyFatTrend = {
  count: 0,
  spanDays: 0,
  latestKey: null,
  previousKey: null,
  latestWeightKg: null,
  enough: false,
  smoothedPct: null,
  bodyFatPct: null,
  deviationPts: null,
  slopePtsPerWeek: null,
  paceGapPtsPerWeek: null,
  paceZ: null,
  paceSlow: false,
  deviationLeanKg: null,
  leanSlopeKgPerWeek: null,
  leanPaceZ: null,
  planEnded: false,
  status: null,
  leanLoss: false,
};

/**
 * The tape-measurement trend against the plan. On a recomp the scale barely moves by design, so
 * progress is body fat and the lean mass derived from it. A Navy reading is good to ±1 point between
 * trained observers (≈ ±1.5 self-measured) while the plan moves ~0.3 points a week, and the plan
 * itself starts from one such reading, so neither one reading nor the gap to the plan's level
 * decides:
 *
 *  1. readings since the plan (re)started, within `bfWindowDays` of today, one per week (the mean
 *     of the week's readings; pass them oldest first);
 *  2. each is compared with the roadmap's expected body fat / lean mass on its day (the residual);
 *  3. a least-squares line through the residuals: its slope is the pace gap (observed minus planned
 *     change a week), which the start reading's error cannot bias; its value at the latest reading
 *     is the deviation from the plan's level, which it can;
 *  4. a verdict needs the pace gap beyond `bfConfidenceZ` standard errors (noise = the literature
 *     floor or the person's own scatter, whichever is larger) and the level at least
 *     `bfTolerancePts` off the same way, with `bfMinMeasurements` weeks of readings over
 *     `bfMinSpanDays`, the latest no older than `bfMaxAgeDays`;
 *  5. past the roadmap's end the plan no longer moves, so the pace gap says nothing; the smoothed
 *     body fat is then compared with the target itself (which no start reading can bias).
 */
export function bodyFatTrend(goal: GoalLike, bodyEntries: BodyPoint[], todayKey: string, settings: GoalSettings): BodyFatTrend {
  const a = settings.adaptive;
  const planStartKey = goal.plan.startKey || goal.start.dateKey;
  const windowStartKey = shiftKey(todayKey, -a.bfWindowDays);
  const points = weeklyReadings(bodyEntries, planStartKey, planStartKey > windowStartKey ? planStartKey : windowStartKey, todayKey);
  const count = points.length;
  // Plan-independent: kept even right after a re-plan, before any reading of the new plan.
  const smoothed = smoothedFit(goal, bodyEntries, todayKey, settings);
  const smoothedPct = smoothed === null ? null : round(smoothed.pct, 2);
  if (count === 0) return { ...EMPTY_TREND, smoothedPct };
  const latest = points[count - 1];
  const spanDays = daysBetween(points[0].dateKey, latest.dateKey);
  const base = {
    ...EMPTY_TREND,
    count,
    spanDays,
    latestKey: latest.dateKey,
    previousKey: count >= 2 ? points[count - 2].dateKey : null,
    latestWeightKg: latest.weightKg,
    smoothedPct,
  };
  if (count < 2) return base;

  const xs = points.map((p) => p.day);
  const expected = xs.map((x) => expectedAtDay(goal, x));
  const leans = points.map((p) => p.weightKg * (1 - p.bodyFatPct / 100));
  const bfRes = fitLine(xs, points.map((p, i) => p.bodyFatPct - expected[i].bodyFatPct));
  const leanRes = fitLine(xs, leans.map((l, i) => l - expected[i].leanMassKg));
  const xLast = xs[count - 1];
  const deviationPts = bfRes.at(xLast);
  const deviationLeanKg = leanRes.at(xLast);
  const slopePtsPerWeek = fitLine(xs, points.map((p) => p.bodyFatPct)).slope * 7;
  const leanSlopeKgPerWeek = fitLine(xs, leans).slope * 7;

  const meanWeight = mean(points.map((p) => p.weightKg));
  const sigmaBf = Math.max(a.bfNoisePts, bfRes.scatter ?? 0);
  // One point of body fat is weight/100 kg of lean mass; the scale reading adds its own noise.
  const sigmaLean = Math.max((meanWeight / 100) * Math.hypot(a.bfNoisePts, a.weighInNoisePctBw), leanRes.scatter ?? 0);
  const paceZ = bfRes.slopeZ(sigmaBf);
  const leanPaceZ = leanRes.slopeZ(sigmaLean);
  const planEnded = xLast >= goal.plan.roadmap.length * 7;

  const enough = count >= a.bfMinMeasurements && spanDays >= a.bfMinSpanDays && daysBetween(latest.dateKey, todayKey) <= a.bfMaxAgeDays;
  let status: OnTrack | null = null;
  if (enough) {
    const stalledOrBehind = slopePtsPerWeek > -a.bfStallPtsPerWeek ? "stalled" : "behind";
    if (planEnded) {
      // The plan has arrived and expects body fat to sit at the target: compare where it sits with
      // the target itself — the mean of the readings since the end once there are enough of them
      // (a plateau), else the smoothed line, else this plan's own fitted line.
      const after = points.filter((p) => p.day >= goal.plan.roadmap.length * 7).map((p) => p.bodyFatPct);
      let level: number;
      let se: number;
      if (after.length >= a.bfMinMeasurements) {
        const m = mean(after);
        level = m;
        se = Math.max(a.bfNoisePts, Math.sqrt(after.reduce((s, v) => s + (v - m) ** 2, 0) / (after.length - 1))) / Math.sqrt(after.length);
      } else if (smoothed !== null) {
        level = smoothed.pct;
        se = Math.max(a.bfNoisePts, smoothed.scatter ?? 0) * smoothed.seFactor;
      } else {
        level = expected[count - 1].bodyFatPct + deviationPts;
        se = sigmaBf * bfRes.seFactor(xLast);
      }
      const gap = level - goal.targetBodyFatPct;
      status = gap >= Math.max(a.bfTolerancePts, a.bfConfidenceZ * se) ? stalledOrBehind : "onTrack";
    } else if (paceZ >= a.bfConfidenceZ && deviationPts >= a.bfTolerancePts) status = stalledOrBehind;
    else if (paceZ <= -a.bfConfidenceZ && deviationPts <= -a.bfTolerancePts) status = "ahead";
    else status = "onTrack";
  }
  return {
    ...base,
    enough,
    bodyFatPct: round(expected[count - 1].bodyFatPct + deviationPts, 2),
    deviationPts: round(deviationPts, 2),
    slopePtsPerWeek: round(slopePtsPerWeek, 3),
    paceGapPtsPerWeek: round(bfRes.slope * 7, 3),
    paceZ: round(paceZ, 2),
    paceSlow: paceZ >= a.bfConfidenceZ,
    deviationLeanKg: round(deviationLeanKg, 2),
    leanSlopeKgPerWeek: round(leanSlopeKgPerWeek, 3),
    leanPaceZ: round(leanPaceZ, 2),
    planEnded,
    status,
    leanLoss: enough && leanPaceZ <= -a.bfConfidenceZ && deviationLeanKg <= -a.leanToleranceKg && leanSlopeKgPerWeek < 0,
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
  settings: GoalSettings,
  /** Recomp: `bodyFatTrend` for the same inputs when the caller already has it (computed otherwise). */
  bodyFat?: BodyFatTrend | null
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
  // Recomp: weight is nearly flat, body fat is what moves. Like the weight trend on a cut, the
  // smoothed body fat is used once there are enough readings, so one tape reading does not jump the bar.
  const bf = direction === "recomp" ? (bodyFat ?? bodyFatTrend(goal, bodyEntries, todayKey, settings)) : null;
  const bfNow = bf?.smoothedPct ?? actualBodyFatPct;
  if (direction === "recomp") {
    const bfSpan = goal.start.bodyFatPct - goal.targetBodyFatPct;
    percentComplete = bfNow === null || bfSpan <= 0 ? 0 : clamp((goal.start.bodyFatPct - bfNow) / bfSpan, 0, 1) * 100;
  }
  const kgToGo = Math.max(0, sign * (targetWeightKg - (actualWeightKg ?? goal.start.weightKg)));
  // The distance of the latest reading, as measured: clients read the target back as actual − bfToGo.
  const bfToGo = direction === "bulk" ? 0 : Math.max(0, (actualBodyFatPct ?? goal.start.bodyFatPct) - goal.targetBodyFatPct);

  /* on-track classification (diff > 0 = further along than planned) and the projected end */
  let onTrack: OnTrack = "onTrack";
  /** Distance left and the rate it is covered at per week (null: nothing to project from). */
  let toGo = 0;
  let ratePerWeek: number | null = null;
  if (bf) {
    // Weight is meant to stay nearly flat, so the scale says nothing here: body fat and lean mass
    // from the tape measurements do, and only once there are enough of them.
    onTrack = bf.status ?? "onTrack";
    // One tape reading must not swing the date: the distance is the smoothed one, and the observed
    // pace replaces the plan's only once a verdict shows it differs. A stall projects no date.
    toGo = Math.max(0, (bfNow ?? goal.start.bodyFatPct) - goal.targetBodyFatPct);
    const paceDiffers = (bf.status === "ahead" || bf.status === "behind") && bf.slopePtsPerWeek !== null;
    if (bfNow !== null && bf.status !== "stalled") ratePerWeek = paceDiffers ? -bf.slopePtsPerWeek! : plannedBfRatePerWeek(goal);
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
