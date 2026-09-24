import { z } from "zod";
import { patchOf, zActivityLevel, zDateKey, zGoalProfile, zId, zIso, zMood, zOnTrack } from "./common";

/**
 * T7 — one plan type, three directions.
 *  - `cut`: lose fat down to a target body-fat %, lean mass defended (the original engine).
 *  - `bulk`: gain lean mass at the literature rate for the training level, with the fat that comes with it.
 *  - `recomp`: small deficit, weight roughly flat, fat down and lean up at the same time.
 */
export const zGoalDirection = z.enum(["cut", "bulk", "recomp"]);
export type GoalDirection = z.infer<typeof zGoalDirection>;

/** Resistance-training experience; drives the muscle-gain rate (Aragon / McDonald models). */
export const zTrainingLevel = z.enum(["beginner", "intermediate", "advanced"]);
export type TrainingLevel = z.infer<typeof zTrainingLevel>;

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
  /**
   * T7 — lean mass at the start/end of the week. Optional so plans stored before T7 still parse;
   * `normalizeGoalPlan` fills them in.
   */
  startLeanMassKg: z.number().optional(),
  endLeanMassKg: z.number().optional(),
});
/**
 * One simulated week. Sign conventions (same in every direction, so `tdee = dailyCalorieTarget +
 * weeklyDeficitKcal / 7` always holds):
 *  - `weeklyDeficitKcal` / `cumulativeDeficitKcal` are energy *deficits*; a bulk week has a negative
 *    value (a surplus).
 *  - `rateKgPerWeek` is the *size* of the week's weight change (always ≥ 0); the plan's `direction`
 *    says which way it goes.
 */
export type RoadmapWeek = z.infer<typeof zRoadmapWeek>;

export const zGoalWarning = z.enum([
  "TARGET_ABOVE_CURRENT",
  "TARGET_TOO_LOW",
  "FLOOR_LIMITED",
  "LONG_HORIZON",
  "NO_BODY_ENTRY",
  "ALPERT_LIMITED",
  /* T7 */
  /** Bulk would push body fat past the lean-bulk ceiling (men 20 %, women 30 %): cut or recomp first. */
  "BULK_BF_CEILING",
  /** The lean-mass target reaches FFMI levels rarely seen without drugs; the rate tapers hard. */
  "NEAR_NATURAL_LIMIT",
  /** Recomposition is slow for this training level; a dedicated cut or bulk will get there sooner. */
  "RECOMP_SLOW",
  /** Recomp target is at or above the current body fat — nothing to recompose towards. */
  "TARGET_NOT_BELOW_CURRENT",
]);
export type GoalWarning = z.infer<typeof zGoalWarning>;

/** C4 — a quarter of the way, half way, three quarters, done. */
export const zGoalMilestone = z.object({
  /** 0.25 / 0.5 / 0.75 / 1 of the total weight to lose. */
  fraction: z.number(),
  dateKey: z.string(),
  weightKg: z.number(),
  bodyFatPct: z.number(),
  /** e.g. "4 hafta sonra" */
  etaLabelTr: z.string(),
});
export type GoalMilestone = z.infer<typeof zGoalMilestone>;

export const zGoalPlan = z.object({
  /** T7 — defaults to `cut` so plans stored before directions existed still parse. */
  direction: zGoalDirection.default("cut"),
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
  milestones: z.array(zGoalMilestone).default([]),
  /** One sentence: "17 Ocak'ta ~78 kg ve %12 yağ oranındasın — 14 hafta, günde 1.850 kcal." */
  summaryTr: z.string().default(""),
  warnings: z.array(zGoalWarning),
  /* T7 — lean-mass side of the plan (all directions). */
  /** Lean mass at the end of the plan. */
  targetLeanMassKg: z.number().optional(),
  /** Lean mass gained over the plan (≤ 0 on a cut, where lean mass is defended, not built). */
  leanGainKg: z.number().optional(),
  /** Fat mass gained over the plan (bulk) — negative when fat is lost. */
  fatGainKg: z.number().optional(),
  /** FFMI at the start / end (Kouri 1995, height-normalised). null when height is unknown. */
  ffmiStart: z.number().nullable().optional(),
  ffmiEnd: z.number().nullable().optional(),
  /** Training level the muscle-gain rate was taken from (bulk / recomp). */
  trainingLevel: zTrainingLevel.nullable().optional(),
});
export type GoalPlan = z.infer<typeof zGoalPlan>;

/** T7 — what one-tap acceptance of an adjustment changed; stored on the goal and drawn on charts. */
export const zGoalAdjustmentAction = z.enum([
  /** Re-plan from today with the same target: the date moves (earlier when ahead, later when behind). */
  "replan",
  /** Tighten the target (cut: 1 point lower body fat; bulk: more lean mass) keeping the pace. */
  "tighten",
  /** Lower daily calories (a bigger deficit on a cut, a smaller surplus on a bulk). */
  "lowerCalories",
  /** Raise daily calories (bigger surplus on a bulk, smaller deficit when a cut/recomp runs too fast). */
  "raiseCalories",
  /** Goal reached: close it. */
  "complete",
]);
export type GoalAdjustmentAction = z.infer<typeof zGoalAdjustmentAction>;

export const zGoalAdjustmentKind = z.enum([
  /**
   * Progressing faster than planned (cut: losing faster; bulk: gaining faster → more fat; recomp:
   * body fat falling faster, or lean mass falling — the deficit is too big for muscle).
   */
  "ahead",
  /** Progressing slower than planned (recomp: body fat falling slower than planned). */
  "behind",
  /** Trend flat (cut/bulk: weight for two weeks; recomp: body fat not falling). */
  "stalled",
  /** Target reached before the plan says. */
  "reached",
]);
export type GoalAdjustmentKind = z.infer<typeof zGoalAdjustmentKind>;

/** The numbers a person compares before tapping. */
export const zGoalPlanSnapshot = z.object({
  dailyCalorieTarget: z.number(),
  estimatedWeeks: z.number().int(),
  targetDate: z.string(),
  targetWeightKg: z.number(),
  targetBodyFatPct: z.number(),
  targetLeanGainKg: z.number().nullable(),
});
export type GoalPlanSnapshot = z.infer<typeof zGoalPlanSnapshot>;

export const zGoalAdjustmentOption = z.object({
  action: zGoalAdjustmentAction,
  /** Button label, e.g. "Kaloriyi 150 kcal düşür". */
  labelTr: z.string(),
  recommended: z.boolean(),
  /** The plan after accepting, previewed with the real engine. null for `complete`. */
  after: zGoalPlanSnapshot.nullable(),
  /** What the API will feed back into the engine; not for display. */
  change: z.object({
    tdeeOverride: z.number().nullable().optional(),
    targetBodyFatPct: z.number().optional(),
    targetLeanGainKg: z.number().optional(),
  }),
});
export type GoalAdjustmentOption = z.infer<typeof zGoalAdjustmentOption>;

/**
 * T7 — a proposal Floo makes; never applied silently. Accepting one option re-plans the goal and
 * records a `GoalAdjustment`. The id is deterministic (goal + kind + plan start + week), so the same
 * situation yields the same id until the user answers it.
 */
export const zGoalAdjustmentProposal = z.object({
  id: z.string(),
  kind: zGoalAdjustmentKind,
  direction: zGoalDirection,
  /** Trend minus the plan's expected trend, kg (positive = heavier than planned). */
  deviationKg: z.number(),
  /**
   * Recomp: body fat on the measurement trend minus the plan, points, at the latest reading
   * (positive = fatter than planned). What a recomp proposal is based on; null otherwise.
   */
  deviationBfPts: z.number().nullable().default(null),
  /** Recomp: lean mass on the measurement trend minus the plan, kg (negative = less than planned); null otherwise. */
  deviationLeanKg: z.number().nullable().default(null),
  mood: zMood,
  /** Floo trigger key for the mascot queue (T1/T2), e.g. "goal.adjust.ahead". */
  trigger: z.string(),
  titleTr: z.string(),
  /** Floo's balloon: why, in one or two short sentences. */
  messageTr: z.string(),
  before: zGoalPlanSnapshot,
  options: z.array(zGoalAdjustmentOption).min(1),
});
export type GoalAdjustmentProposal = z.infer<typeof zGoalAdjustmentProposal>;

/** An answered proposal, kept on the goal (chart markers, cool-down). */
export const zGoalAdjustment = z.object({
  id: z.string(),
  kind: zGoalAdjustmentKind,
  status: z.enum(["accepted", "dismissed"]),
  action: zGoalAdjustmentAction.nullable(),
  dateKey: z.string(),
  at: zIso,
  before: zGoalPlanSnapshot,
  after: zGoalPlanSnapshot.nullable(),
});
export type GoalAdjustment = z.infer<typeof zGoalAdjustment>;

/**
 * T7 — the instant reaction to a new weigh-in or measurement: a line for Floo's queue plus the
 * numbers for the progress bars. Always present while a goal is active.
 */
export const zGoalFeedback = z.object({
  tone: z.enum(["positive", "neutral", "attention"]),
  mood: zMood,
  /** Floo trigger key, e.g. "goal.feedback.ahead". */
  trigger: z.string(),
  textTr: z.string(),
  /** Same as progress.onTrack, or "noData" before the first usable weigh-in. */
  status: z.enum(["ahead", "onTrack", "behind", "stalled", "noData", "reached"]),
  deviationKg: z.number().nullable(),
  /**
   * Recomp: body fat on the measurement trend minus the plan, points (positive = fatter than
   * planned); null on cut/bulk and until there are enough readings to judge.
   */
  deviationBfPts: z.number().nullable().default(null),
  /** Planned weeks left minus projected weeks left (positive = finishing earlier). */
  weeksSaved: z.number().nullable(),
  /** 0–100 bars for the UI. */
  bars: z.object({
    goal: z.number(),
    time: z.number(),
    /** Lean mass progress toward the plan's lean target (bulk/recomp); null on a cut or without data. */
    lean: z.number().nullable(),
    /** Body-fat progress toward the target (cut/recomp); null on a bulk or without data. */
    fat: z.number().nullable(),
  }),
});
export type GoalFeedback = z.infer<typeof zGoalFeedback>;

export const zGoalStatus = z.enum(["active", "completed", "abandoned"]);
export const zGoal = z.object({
  id: zId,
  status: zGoalStatus,
  /** T7 — `cut` for goals created before directions existed. */
  direction: zGoalDirection.default("cut"),
  /** Cut/recomp: the target. Bulk: the body fat the plan expects to end at (informational). */
  targetBodyFatPct: z.number(),
  /** Bulk: kg of lean mass to gain. null for cut/recomp. */
  targetLeanGainKg: z.number().nullable().default(null),
  trainingLevel: zTrainingLevel.nullable().default(null),
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
  /** T7 — answered adjustment proposals, oldest first. */
  adjustments: z.array(zGoalAdjustment).default([]),
  createdAt: zIso,
  updatedAt: zIso,
  completedAt: zIso.nullable(),
});
export type GoalDTO = z.infer<typeof zGoal>;

/**
 * Goal input. Backwards compatible: `{ targetBodyFatPct }` alone is a cut, as before.
 *  - cut:    targetBodyFatPct (below current)
 *  - bulk:   targetLeanGainKg (direction may be omitted when this is given)
 *  - recomp: targetBodyFatPct (below current)
 * `trainingLevel` feeds the muscle-gain rate; omitted → inferred from FFMI.
 */
export const zGoalInputFields = z.object({
  direction: zGoalDirection.optional(),
  targetBodyFatPct: z.number().min(2).max(60).optional(),
  targetLeanGainKg: z.number().min(0.25).max(25).optional(),
  trainingLevel: zTrainingLevel.optional(),
  profile: zGoalProfile.default("optimal"),
});

/** The direction an input asks for: explicit, else bulk when only a lean-mass target is given, else cut. */
export function goalDirectionOf(input: { direction?: GoalDirection | null; targetLeanGainKg?: number | null; targetBodyFatPct?: number | null }): GoalDirection {
  if (input.direction) return input.direction;
  if (input.targetLeanGainKg != null && input.targetBodyFatPct == null) return "bulk";
  return "cut";
}

function checkGoalTargets(v: { direction?: GoalDirection; targetBodyFatPct?: number; targetLeanGainKg?: number }, ctx: z.RefinementCtx) {
  if (!v.direction && v.targetBodyFatPct != null && v.targetLeanGainKg != null) {
    ctx.addIssue({ code: "custom", path: ["direction"], message: "İki hedef birden verildiğinde yön (direction) gerekli" });
    return;
  }
  const direction = goalDirectionOf(v);
  if (direction === "bulk" && v.targetLeanGainKg == null) {
    ctx.addIssue({ code: "custom", path: ["targetLeanGainKg"], message: "Kas kazanma hedefi için kazanılacak yağsız kütle (kg) gerekli" });
  }
  if (direction !== "bulk" && v.targetBodyFatPct == null) {
    ctx.addIssue({ code: "custom", path: ["targetBodyFatPct"], message: "Hedef yağ oranı gerekli" });
  }
}

export const zGoalInput = zGoalInputFields.superRefine(checkGoalTargets);
export type GoalInput = z.infer<typeof zGoalInput>;
/** PATCH: any subset; the merged result (with the stored goal) is validated by the service. */
export const zGoalUpdate = patchOf(zGoalInputFields);
export type GoalUpdate = z.infer<typeof zGoalUpdate>;

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

export const zGoalView = z.object({
  goal: zGoal.nullable(),
  progress: zGoalProgress.nullable(),
  /** T7 — Floo's instant reaction to the latest data; null without an active goal. */
  feedback: zGoalFeedback.nullable().default(null),
  /** T7 — a pending adjustment to show with one-tap accept; null when there is nothing to propose. */
  adjustment: zGoalAdjustmentProposal.nullable().default(null),
});
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

export const zGoalAdjustmentAnswer = z.object({ id: z.string().min(1), action: zGoalAdjustmentAction.optional() });
export type GoalAdjustmentAnswer = z.infer<typeof zGoalAdjustmentAnswer>;
export const zGoalAdjustmentResponse = z.object({ goal: zGoal, adjustment: zGoalAdjustment });

export { zDateKey as zGoalDateKey };
