/**
 * Goal-engine adapter for the admin simulator.
 *
 * `@fitfloow/core/goal` now implements docs/plan/03-goal-engine.md, so this module is a thin
 * shim: it keeps the panel's own input shape (`startKey`) and owns the Turkish labels, while
 * every number comes from core — the same code the API runs, so the simulator can never
 * drift from the plans users actually get.
 */
import {
  computeGoalPlan as coreComputeGoalPlan,
  safeWeeklyRate,
  type ActivityLevel,
  type Gender,
  type GoalPlan,
  type GoalProfile,
  type GoalSettings,
  type GoalWarning,
  type RateInput,
  type RateLimit,
  type RateResult,
} from "@fitfloow/core";

export interface GoalSimInput {
  sex: Gender;
  weightKg: number;
  bodyFatPct: number;
  heightCm: number;
  age?: number | null;
  activityLevel: ActivityLevel;
  targetBodyFatPct: number;
  profile: GoalProfile;
  /** dateKey the plan starts on. */
  startKey: string;
  settings: GoalSettings;
  tdeeOverride?: number | null;
}

export type RateLimiter = RateLimit;
export type { RateInput as RateState, RateResult };

export function computeGoalPlan(input: GoalSimInput): GoalPlan {
  const { startKey, ...rest } = input;
  return coreComputeGoalPlan({ ...rest, startDate: startKey });
}

/** Step 4 — the four caps, smallest wins. Re-exported so the simulator can show which binds. */
export const rateForState = safeWeeklyRate;

export const RATE_LIMITER_TR: Record<RateLimiter, string> = {
  table: "Oran tablosu",
  absolute: "Bant üst sınırı",
  alpert: "Alpert yağ mobilizasyonu",
  relative: "Göreli açık sınırı",
};

export const GOAL_WARNING_TR: Record<GoalWarning, string> = {
  TARGET_ABOVE_CURRENT: "Hedef, mevcut yağ oranının üstünde — kaybedilecek yağ yok.",
  TARGET_TOO_LOW: "Hedef temel yağ sınırının altında; sağlık riski taşır.",
  FLOOR_LIMITED: "Kalori tabanına takıldı; haftalık hız düşürüldü.",
  LONG_HORIZON: "Plan bir yılı aşıyor; ara hedef önerilir.",
  NO_BODY_ENTRY: "Ölçüm kaydı yok; plan varsayılan değerlerle hesaplandı.",
  ALPERT_LIMITED: "Yağ mobilizasyon tavanı (Alpert) hızı sınırlıyor.",
};
