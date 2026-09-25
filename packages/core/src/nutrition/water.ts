/**
 * Daily water: one glass is one tap. The goal follows body weight (~35 ml per kg, the common
 * EFSA/IOM-style rule of thumb), rounded to whole glasses and kept inside a sane band, so a user
 * with no weigh-in yet still gets a reasonable 2.5 L.
 */
export const WATER_GLASS_ML = 250;
export const WATER_DEFAULT_GOAL_ML = 2500;
export const WATER_GOAL_MIN_ML = 1500;
export const WATER_GOAL_MAX_ML = 4000;

export function waterGoalMl(weightKg: number | null | undefined): number {
  if (weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0) return WATER_DEFAULT_GOAL_ML;
  const raw = Math.round((weightKg * 35) / WATER_GLASS_ML) * WATER_GLASS_ML;
  return Math.min(WATER_GOAL_MAX_ML, Math.max(WATER_GOAL_MIN_ML, raw));
}

/** 0..1 share of the day's goal, for rings and for Floo's hydration. */
export function waterProgress(totalMl: number, goalMl: number): number {
  if (!Number.isFinite(totalMl) || !Number.isFinite(goalMl) || goalMl <= 0) return 0;
  return Math.max(0, Math.min(1, totalMl / goalMl));
}
