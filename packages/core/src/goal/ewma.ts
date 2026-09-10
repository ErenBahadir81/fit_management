/**
 * Time-aware EWMA weight trend with outlier rejection (03-goal-engine.md §Recalibration).
 * Scale weight is noisy (glycogen, sodium, gut content); every downstream decision — progress,
 * on-track, recalibration, reports — reads the trend, never the raw number.
 */
import { daysBetween } from "../time/index";

export interface WeightPoint {
  dateKey: string;
  weightKg: number;
}

export interface WeightTrendPoint extends WeightPoint {
  /** Smoothed weight at this date. Unchanged from the previous point when `outlier` is true. */
  ewma: number;
  outlier: boolean;
}

export interface EwmaSettings {
  alpha: number;
  sparseAlpha: number;
  outlierRejectKg: number;
}

/** Weigh-ins per week; below 5 the series is "sparse" and gets the faster alpha. */
export function weighInsPerWeek(points: WeightPoint[]): number {
  if (points.length === 0) return 0;
  const spanDays = daysBetween(points[0].dateKey, points[points.length - 1].dateKey);
  return points.length / Math.max(1, spanDays / 7);
}

function normalise(points: WeightPoint[]): WeightPoint[] {
  const byKey = new Map<string, number>();
  for (const p of points) {
    if (!Number.isFinite(p.weightKg)) continue;
    byKey.set(p.dateKey, p.weightKg); // last value for a day wins
  }
  return [...byKey.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([dateKey, weightKg]) => ({ dateKey, weightKg }));
}

/**
 * `α_eff = 1 − (1 − α)^days` so a gap of a week moves the trend as far as seven daily updates.
 * A point deviating more than `outlierRejectKg` from the trend is flagged and skipped (kept raw).
 */
export function ewmaTrend(points: WeightPoint[], settings: EwmaSettings): WeightTrendPoint[] {
  const series = normalise(points);
  if (series.length === 0) return [];
  const alpha = weighInsPerWeek(series) < 5 ? settings.sparseAlpha : settings.alpha;

  const out: WeightTrendPoint[] = [];
  let trend = series[0].weightKg;
  let lastAcceptedKey = series[0].dateKey;
  out.push({ ...series[0], ewma: trend, outlier: false });

  for (let i = 1; i < series.length; i++) {
    const p = series[i];
    if (Math.abs(p.weightKg - trend) > settings.outlierRejectKg) {
      out.push({ ...p, ewma: trend, outlier: true });
      continue;
    }
    const gap = Math.max(1, daysBetween(lastAcceptedKey, p.dateKey));
    const alphaEff = 1 - (1 - alpha) ** gap;
    trend = trend + alphaEff * (p.weightKg - trend);
    lastAcceptedKey = p.dateKey;
    out.push({ ...p, ewma: trend, outlier: false });
  }
  return out;
}

/** Trend value at `dateKey`, carrying the last known value forward. `null` before the series starts. */
export function ewmaAt(trend: WeightTrendPoint[], dateKey: string): number | null {
  let value: number | null = null;
  for (const p of trend) {
    if (p.dateKey > dateKey) break;
    value = p.ewma;
  }
  return value;
}

export function latestTrendWeight(trend: WeightTrendPoint[]): number | null {
  return trend.length === 0 ? null : trend[trend.length - 1].ewma;
}

/** Trend delta between two dates; `null` when either end has no data yet. */
export function ewmaChange(trend: WeightTrendPoint[], fromKey: string, toKey: string): number | null {
  const a = ewmaAt(trend, fromKey);
  const b = ewmaAt(trend, toKey);
  return a === null || b === null ? null : b - a;
}

/**
 * Least-squares slope of the trend in kg per week over the `days` window ending at `toKey`.
 * Negative while losing. `null` with fewer than two points in the window.
 */
export function ewmaSlopePerWeek(trend: WeightTrendPoint[], toKey: string, days: number): number | null {
  const inWindow = trend.filter((p) => p.dateKey <= toKey && daysBetween(p.dateKey, toKey) <= days);
  if (inWindow.length < 2) return null;
  const base = inWindow[0].dateKey;
  const xs = inWindow.map((p) => daysBetween(base, p.dateKey));
  const ys = inWindow.map((p) => p.ewma);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return (num / den) * 7;
}
