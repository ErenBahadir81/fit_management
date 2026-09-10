/**
 * Goal engine — pure, deterministic, admin-settings driven (docs/plan/03-goal-engine.md).
 * No I/O: every function takes plain values and returns plain values.
 */
export { leannessBandFor, fatFractionFor, bmrFor, tdeeFor, macrosFor } from "./tdee";
export type { LeannessBand, BmrInput, BmrResult, MacrosInput } from "./tdee";

export { rateBandFor, safeWeeklyRate, dailyTargetFor } from "./rate";
export type { RateLimit, RateInput, RateResult, DailyTargetInput, DailyTargetResult } from "./rate";

export { computeGoalPlan, tdeeForWeek } from "./plan";
export type { GoalEngineInput } from "./plan";

export { ewmaTrend, ewmaAt, ewmaChange, ewmaSlopePerWeek, latestTrendWeight, weighInsPerWeek } from "./ewma";
export type { WeightPoint, WeightTrendPoint, EwmaSettings } from "./ewma";

export { computeGoalProgress, expectedAtDay, roadmapWeekAt, tdeeAtDay, ON_TRACK_TOLERANCE_KG, STALL_THRESHOLD_KG } from "./progress";
export type { GoalLike, BodyPoint } from "./progress";

export { recalibrateTdee, isLogged } from "./recalibrate";
export type { RecalibrationInput, DayIntake } from "./recalibrate";
