/**
 * Muscle load (activation) helpers for the exercise editor. A load is how much of one set counts
 * toward a muscle's weekly volume: 0–1 on a 0.05 grid (the literature data is rounded the same way).
 */

export const LOAD_STEP = 0.05;

const loadFormat = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Clamps to 0–1 and rounds to the 0.05 grid, free of float noise (0.1 + 0.2 → 0.3). */
export function snapLoad(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped / LOAD_STEP) / Math.round(1 / LOAD_STEP);
}

/** "0,35" / "0.35" → 0.35; empty, garbage or outside 0–1 → null. Not snapped (that happens on commit). */
export function parseLoadInput(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 1) return null;
  return value;
}

/** tr-TR, at most two decimals: 0,95 · 0,5 · 1. */
export function formatLoad(value: number): string {
  return loadFormat.format(value);
}

/** Whether a load differs from the literature value (grid-exact, so float noise is ignored). */
export function loadDiffers(value: number | undefined, reference: number): boolean {
  return value === undefined || Math.round(value * 100) !== Math.round(reference * 100);
}

/**
 * The `{key, load}` list the API stores: known muscles in catalog order first, then any other key
 * the exercise already had; zero pairs dropped, loads rounded to two decimals.
 */
export function toMusclePayload(loads: Record<string, number>, order: readonly string[]): Array<{ key: string; load: number }> {
  const rank = new Map(order.map((key, i) => [key, i]));
  return Object.entries(loads)
    .filter(([, load]) => load > 0)
    .sort(([a], [b]) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER))
    .map(([key, load]) => ({ key, load: Math.round(load * 100) / 100 }));
}
