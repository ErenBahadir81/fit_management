/**
 * T7 — "where you are now": FFMI + body fat, read together, turned into a goal recommendation.
 * Produced by `assessBody` / `recommendGoal` in `core/body`; served by `GET /goals/assessment`.
 */
import { z } from "zod";
import { zGender } from "./common";
import { zGoalDirection, zTrainingLevel } from "./goal";

export const zFfmiBand = z.enum(["low", "average", "good", "advanced", "nearLimit"]);
export type FfmiBand = z.infer<typeof zFfmiBand>;

export const zBodyFatBand = z.enum(["essential", "athletic", "fit", "average", "high"]);

export const zGoalRecommendation = z.object({
  direction: zGoalDirection,
  /** Cut/recomp: the suggested target body fat. */
  targetBodyFatPct: z.number().nullable(),
  /** Bulk: the suggested lean mass to gain, kg. */
  targetLeanGainKg: z.number().nullable(),
  /** One or two sentences Floo says, e.g. "FFMI 18,5: kas kütlen düşük; önce kas kazanmak öncelikli." */
  reasonTr: z.string(),
  /** Other sensible directions, most sensible first (the UI offers them as a switch). */
  alternatives: z.array(zGoalDirection),
});
export type GoalRecommendation = z.infer<typeof zGoalRecommendation>;

export const zBodyAssessment = z.object({
  sex: zGender,
  weightKg: z.number(),
  heightCm: z.number(),
  bodyFatPct: z.number(),
  leanMassKg: z.number(),
  fatMassKg: z.number(),
  /** Raw FFMI = lean kg / height m². */
  ffmiRaw: z.number(),
  /** Height-normalised FFMI (Kouri 1995): raw + 6.1 × (1.8 − height m). The one to show. */
  ffmi: z.number(),
  ffmiBand: zFfmiBand,
  ffmiBandTr: z.string(),
  /** 0–100 position between the band floor of "low" and the natural ceiling, for a gauge. */
  ffmiGauge: z.number(),
  /** FFMI rarely exceeded without drugs for this sex. */
  ffmiCeiling: z.number(),
  /** Lean kg still available before the ceiling (≥ 0). */
  leanToCeilingKg: z.number(),
  bodyFatBand: zBodyFatBand,
  bodyFatBandTr: z.string(),
  trainingLevel: zTrainingLevel,
  /** true when the level came from FFMI rather than from the user. */
  trainingLevelInferred: z.boolean(),
  /** "Yağ %24, FFMI 21: yağ vermek öncelikli." */
  summaryTr: z.string(),
  recommendation: zGoalRecommendation,
});
export type BodyAssessment = z.infer<typeof zBodyAssessment>;

export const zGoalAssessmentResponse = z.object({ assessment: zBodyAssessment });
