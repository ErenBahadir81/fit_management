/**
 * T7 — body composition beyond body fat: FFMI and the assessment that turns it into a goal
 * recommendation. Pure, no I/O (docs/plan/11-muscle-gain-engine.md).
 */
export { ffmi, ffmiRaw, ffmiBand, ffmiGauge, leanMassForFfmi, FFMI_BAND_EDGES, FFMI_BAND_TR, FFMI_HEIGHT_SLOPE, FFMI_REFERENCE_HEIGHT_M } from "./ffmi";
export {
  assessBody,
  recommendGoal,
  suggestedLeanGainKg,
  GOAL_BF_THRESHOLDS,
  FEMALE_BF_OFFSET,
  SUGGESTED_CUT_TARGET,
  SUGGESTED_MINI_CUT_TARGET,
  SUGGESTED_BULK_WEEKS,
  pctToTr,
} from "./assessment";
export type { AssessmentInput } from "./assessment";
