/** Small pure helpers shared by every domain module. */

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Round to `digits` decimals (half away from zero for positives, matches v1 behaviour). */
export function round(n: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Deterministic 32-bit FNV-1a hash of a string — used for stable variant selection. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Exponentially weighted moving average over an ordered series.
 * Returns one smoothed value per input (same length). First value seeds the average.
 */
export function ewma(values: number[], alpha: number): number[] {
  if (alpha <= 0 || alpha > 1) throw new RangeError("alpha must be in (0, 1]");
  const out: number[] = [];
  let prev: number | null = null;
  for (const v of values) {
    prev = prev === null ? v : prev + alpha * (v - prev);
    out.push(prev);
  }
  return out;
}

/** Linear regression slope (units per index step) for a numeric series; 0 for < 2 points. */
export function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

/** Turkish-aware lowercase + diacritic folding for search keys ("İstanbul Köftesi" → "istanbul koftesi"). */
export function searchKey(s: string): string {
  return s
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLowerCase()
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
