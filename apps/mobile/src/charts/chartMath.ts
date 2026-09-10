/** Pure chart helpers — tested directly, shared by every chart component. */
import { fmtDate } from "../lib/format";

export type Nullable = number | null | undefined;

const finite = (values: Nullable[]): number[] => values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));

/** [min, max] padded by `padFrac` of the range; never collapses to a zero-height domain. */
export function niceDomain(values: Nullable[], padFrac = 0.1): [number, number] {
  const xs = finite(values);
  if (xs.length === 0) return [0, 1];
  let min = Math.min(...xs);
  let max = Math.max(...xs);
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * padFrac;
  min -= pad;
  max += pad;
  return [Number(min.toFixed(6)), Number(max.toFixed(6))];
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

/** About `count` round tick values inside [min, max]. */
export function ticks(min: number, max: number, count = 4): number[] {
  if (!(max > min) || count < 1) return [min];
  const step = niceStep((max - min) / count);
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** Index of the closest value (ties → later index); −1 for empty input. */
export function nearestIndex(xs: number[], x: number): number {
  if (xs.length === 0) return -1;
  let best = 0;
  let bestD = Math.abs(xs[0] - x);
  for (let i = 1; i < xs.length; i++) {
    const d = Math.abs(xs[i] - x);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/** EWMA that skips nulls (keeps the previous state) and returns null in their place. */
export function ewmaSeries(values: Nullable[], alpha: number): (number | null)[] {
  let prev: number | null = null;
  return values.map((v) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    prev = prev === null ? v : prev + alpha * (v - prev);
    return Number(prev.toFixed(6));
  });
}

export interface TrendPoint {
  dateKey: string;
  raw: number | null;
  ewma: number | null;
}
/** A type alias (not an interface) so victory-native's `Record<string, unknown>` constraint is satisfied. */
export type TrendRow = {
  x: number;
  dateKey: string;
  raw: number | null;
  ewma: number | null;
  goal: number | null;
};
export interface TrendSeries {
  data: TrendRow[];
  domainY: [number, number];
  labels: string[];
}

/** Rows for a CartesianChart (x = index), the padded Y domain (goal included) and short date labels. */
export function buildTrendSeries(points: TrendPoint[], goal?: number | null): TrendSeries {
  const g = typeof goal === "number" && Number.isFinite(goal) ? goal : null;
  const data = points.map((p, i) => ({ x: i, dateKey: p.dateKey, raw: p.raw, ewma: p.ewma, goal: g }));
  const domainY = niceDomain([...points.map((p) => p.raw), ...points.map((p) => p.ewma), g], 0.1);
  return { data, domainY, labels: points.map((p) => fmtDate(p.dateKey, "short")) };
}

/** Evenly spaced bars: `step` per slot, `barWidth = step − gap`. */
export function barLayout(n: number, width: number, gap: number) {
  const step = n > 0 ? width / n : width;
  return { step, barWidth: Math.max(1, step - gap), x: (i: number) => i * step };
}

/** Keep at most ~`max` labels (first + last always), blanks elsewhere. */
export function dateTickLabels(keys: string[], max = 5): string[] {
  const n = keys.length;
  if (n === 0) return [];
  const every = Math.max(1, Math.ceil((n - 1) / Math.max(1, max - 1)));
  return keys.map((k, i) => (i % every === 0 || i === n - 1 ? fmtDate(k, "short") : ""));
}
