import { z } from "zod";
import { zActivityLevel, zDateKey, zGoalProfile, zId, zIso, zOnTrack } from "./common";

export const zMacros = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});
export type Macros = z.infer<typeof zMacros>;

export const zRoadmapWeek = z.object({
  weekIndex: z.number().int().min(1),
  startKey: z.string(),
  endKey: z.string(),
  startWeightKg: z.number(),
  endWeightKg: z.number(),
  startBfPct: z.number(),
  endBfPct: z.number(),
  rateKgPerWeek: z.number(),
  weeklyDeficitKcal: z.number(),
  dailyCalorieTarget: z.number(),
  cumulativeDeficitKcal: z.number(),
  macros: zMacros,
});
export type RoadmapWeek = z.infer<typeof zRoadmapWeek>;

export const zGoalWarning = z.enum([
  "TARGET_ABOVE_CURRENT",
  "TARGET_TOO_LOW",
  "FLOOR_LIMITED",
  "LONG_HORIZON",
  "NO_BODY_ENTRY",
  "ALPERT_LIMITED",
]);
export type GoalWarning = z.infer<typeof zGoalWarning>;

export const zGoalPlan = z.object({
  fatToLoseKg: z.number(),
  totalLossKg: z.number(),
  targetWeightKg: z.number(),
  totalDeficitKcal: z.number(),
  avgWeightKg: z.number(),
  pctChange: z.number(),
  leanMassKg: z.number(),
  fatMassKg: z.number(),
  bmr: z.number(),
  bmrMifflin: z.number().nullable(),
  tdeeFormula: z.number(),
  tdee: z.number(),
  activityLevel: zActivityLevel,
  profile: zGoalProfile,
  initialRateKgPerWeek: z.number(),
  initialDailyCalorieTarget: z.number(),
  macros: zMacros,
  estimatedWeeks: z.number().int(),
  startKey: z.string(),
  targetDate: z.string(),
  roadmap: z.array(zRoadmapWeek),
  warnings: z.array(zGoalWarning),
});
export type GoalPlan = z.infer<typeof zGoalPlan>;

export const zGoalStatus = z.enum(["active", "completed", "abandoned"]);
export const zGoal = z.object({
  id: zId,
  status: zGoalStatus,
  targetBodyFatPct: z.number(),
  profile: zGoalProfile,
  start: z.object({
    dateKey: z.string(),
    weightKg: z.number(),
    bodyFatPct: z.number(),
    leanMassKg: z.number(),
    fatMassKg: z.number(),
    bodyEntryId: zId.nullable(),
  }),
  plan: zGoalPlan,
  tdeeOverride: z.number().nullable(),
  createdAt: zIso,
  updatedAt: zIso,
  completedAt: zIso.nullable(),
});
export type GoalDTO = z.infer<typeof zGoal>;

export const zGoalInput = z.object({
  targetBodyFatPct: z.number().min(2).max(60),
  profile: zGoalProfile.default("optimal"),
});
export type GoalInput = z.infer<typeof zGoalInput>;
export const zGoalUpdate = zGoalInput.partial();

export const zGoalProgress = z.object({
  daysElapsed: z.number().int(),
  weeksElapsed: z.number().int(),
  weekIndexInPlan: z.number().int(),
  expectedWeightKg: z.number(),
  actualWeightKg: z.number().nullable(),
  expectedBodyFatPct: z.number(),
  actualBodyFatPct: z.number().nullable(),
  deficitBankedKcal: z.number(),
  deficitPlannedKcal: z.number(),
  percentComplete: z.number(),
  kgToGo: z.number(),
  bfToGo: z.number(),
  onTrack: zOnTrack,
  projectedDate: z.string().nullable(),
  weeksRemainingPlan: z.number().int(),
  weeksRemainingProjected: z.number().nullable(),
  currentWeek: zRoadmapWeek.nullable(),
});
export type GoalProgress = z.infer<typeof zGoalProgress>;

export const zGoalView = z.object({ goal: zGoal.nullable(), progress: zGoalProgress.nullable() });
export type GoalView = z.infer<typeof zGoalView>;

export const zGoalPreview = z.object({ plan: zGoalPlan, warnings: z.array(zGoalWarning) });
export type GoalPreview = z.infer<typeof zGoalPreview>;

export const zRecalibration = z.object({
  tdeeFormula: z.number(),
  tdeeObserved: z.number().nullable(),
  tdeeUsed: z.number(),
  daysUsed: z.number().int(),
  avgIntake: z.number().nullable(),
  weightDeltaKg: z.number().nullable(),
  applied: z.boolean(),
  reason: z.string().nullable(),
});
export type Recalibration = z.infer<typeof zRecalibration>;
export const zGoalRecalibrateResponse = z.object({ goal: zGoal, recalibration: zRecalibration });

export { zDateKey as zGoalDateKey };
