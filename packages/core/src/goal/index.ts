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

/* C4 — the plan in plain Turkish. */
export { etaLabelTr, formatTrNumber, goalMilestones, goalSummaryTr } from "./milestones";

export { ewmaTrend, ewmaAt, ewmaChange, ewmaSlopePerWeek, latestTrendWeight, weighInsPerWeek } from "./ewma";
export type { WeightPoint, WeightTrendPoint, EwmaSettings } from "./ewma";

export {
  bodyFatTrend,
  smoothedBodyFat,
  computeGoalProgress,
  expectedAtDay,
  roadmapWeekAt,
  tdeeAtDay,
  trendDeviationAt,
  directionOf,
  weightSign,
  ON_TRACK_TOLERANCE_KG,
  STALL_THRESHOLD_KG,
} from "./progress";
export type { GoalLike, BodyPoint, BodyFatTrend, ExpectedBody } from "./progress";

export { recalibrateTdee, isLogged } from "./recalibrate";
export type { RecalibrationInput, DayIntake } from "./recalibrate";

/* T7 — muscle-gain engine, the two new directions, the adaptive goal and instant feedback. */
export { muscleGainRate, recompLeanRate, ffmiTaper, inferTrainingLevel, levelAfterWeeks, TRAINING_LEVEL_TR, WEEKS_PER_MONTH } from "./muscle";
export type { MuscleRateInput, MuscleRateResult } from "./muscle";
export { computeBulkPlan, computeRecompPlan, bulkMacrosFor } from "./directions";
export {
  proposeGoalAdjustment,
  replanGoal,
  remainingLeanGain,
  estimateCurrentBody,
  planSnapshot,
  adjustmentId,
  adjustmentSinceKey,
} from "./adjust";
export type { AdaptiveGoal, ReplanBase, AdjustmentInput, GoalChange } from "./adjust";
export { goalFeedback, evaluateGoal } from "./feedback";
export type { FeedbackInput, EvaluateGoalInput, GoalEvaluation } from "./feedback";
