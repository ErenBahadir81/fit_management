/**
 * T7 — natural muscle-gain rate. Literature averages (docs/research/muscle-gain-science.md):
 *
 *   lean kg / week = bodyweight × leanGainPctBwPerMonth[level] / 100 / 4.345
 *                    × (female ? femaleRateFactor : 1) × profile.lean × taper(FFMI)
 *
 * `taper` is 1 until the FFMI is within `ffmiTaperWindow` points of the natural ceiling, then falls
 * linearly to `taperFloor` at the ceiling — gains slow as potential is used up (McDonald / Casey Butt).
 * The level itself advances with time spent training (McDonald's year-by-year model), so a long
 * beginner bulk turns into an intermediate one after a year.
 */
import type { Gender, GoalProfile } from "../schemas/common";
import type { TrainingLevel } from "../schemas/goal";
import type { GoalSettings } from "../schemas/settings";
import { clamp } from "../utils/index";

export const WEEKS_PER_MONTH = 4.345;
const WEEKS_PER_YEAR = 52;
const LEVELS: TrainingLevel[] = ["beginner", "intermediate", "advanced"];

export const TRAINING_LEVEL_TR: Record<TrainingLevel, string> = {
  beginner: "Yeni başlayan",
  intermediate: "Orta seviye",
  advanced: "İleri seviye",
};

/** Level from FFMI when the user has not said (untrained people sit in the low/average bands). */
export function inferTrainingLevel(sex: Gender, ffmiValue: number, settings: GoalSettings): TrainingLevel {
  const t = settings.muscle.levelFfmi[sex];
  if (ffmiValue >= t.advanced) return "advanced";
  if (ffmiValue >= t.intermediate) return "intermediate";
  return "beginner";
}

/** Level after `weeks` more weeks of training: one step per year, capped at advanced. */
export function levelAfterWeeks(level: TrainingLevel, weeks: number): TrainingLevel {
  const i = LEVELS.indexOf(level) + Math.floor(Math.max(0, weeks) / WEEKS_PER_YEAR);
  return LEVELS[Math.min(i, LEVELS.length - 1)];
}

/** 1 far from the ceiling, falling linearly to `taperFloor` at it (and beyond). */
export function ffmiTaper(sex: Gender, ffmiValue: number, settings: GoalSettings): number {
  const m = settings.muscle;
  const ceiling = m.ffmiCeiling[sex];
  const start = ceiling - m.ffmiTaperWindow;
  if (ffmiValue <= start) return 1;
  const t = (ffmiValue - start) / m.ffmiTaperWindow;
  return clamp(1 - t * (1 - m.taperFloor), m.taperFloor, 1);
}

export interface MuscleRateInput {
  sex: Gender;
  weightKg: number;
  ffmi: number;
  level: TrainingLevel;
  profile?: GoalProfile;
  settings: GoalSettings;
}

export interface MuscleRateResult {
  leanKgPerWeek: number;
  fatKgPerWeek: number;
  /** kcal/week the plan must eat above maintenance to build that. */
  weeklySurplusKcal: number;
  taper: number;
}

/** Lean and fat gain per week on a bulk, plus the weekly surplus that pays for them. */
export function muscleGainRate(input: MuscleRateInput): MuscleRateResult {
  const { sex, weightKg, level, settings } = input;
  const m = settings.muscle;
  const profile = m.bulkProfiles[input.profile ?? "optimal"];
  const taper = ffmiTaper(sex, input.ffmi, settings);
  const sexFactor = sex === "female" ? m.femaleRateFactor : 1;
  const leanKgPerWeek = Math.max(0, (weightKg * m.leanGainPctBwPerMonth[level]) / 100 / WEEKS_PER_MONTH) * sexFactor * profile.lean * taper;
  // Near the ceiling the same surplus buys less muscle, so the fat share rises as the taper bites.
  const fatKgPerWeek = leanKgPerWeek * m.fatPerLeanKg[level] * profile.fat / Math.max(taper, m.taperFloor || 0.1);
  const weeklySurplusKcal = leanKgPerWeek * m.kcalPerKgLeanGain + fatKgPerWeek * m.kcalPerKgFatGain;
  return { leanKgPerWeek, fatKgPerWeek, weeklySurplusKcal, taper };
}

/** Lean kg a recomp can add per week: the bulk rate scaled down by the level's recomp factor. */
export function recompLeanRate(input: Omit<MuscleRateInput, "profile">): number {
  const base = muscleGainRate({ ...input, profile: "optimal" });
  return base.leanKgPerWeek * input.settings.muscle.recompLeanFactor[input.level];
}
