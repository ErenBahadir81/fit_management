/**
 * Energy expenditure and macronutrient math for the goal engine (03-goal-engine.md steps 5–6).
 * Everything is pure and driven by admin-editable `GoalSettings`.
 */
import type { ActivityLevel, Gender } from "../schemas/common";
import type { Macros } from "../schemas/goal";
import type { GoalSettings } from "../schemas/settings";
import { round } from "../utils/index";

/** Leanness band used for protein targets and the fat share of weight lost. */
export type LeannessBand = "lean" | "mid" | "high";

/** `lean` below `lo`, `mid` below `hi`, otherwise `high` (thresholds are per sex). */
export function leannessBandFor(sex: Gender, bodyFatPct: number, settings: GoalSettings): LeannessBand {
  const b = settings.leannessBands[sex];
  if (bodyFatPct < b.lo) return "lean";
  if (bodyFatPct < b.hi) return "mid";
  return "high";
}

/**
 * Fraction of lost weight assumed to be fat. Leaner dieters give up more lean tissue,
 * so the `lean` band maps to `fatFractionOfLoss.low`.
 */
export function fatFractionFor(sex: Gender, bodyFatPct: number, settings: GoalSettings): number {
  const band = leannessBandFor(sex, bodyFatPct, settings);
  if (band === "lean") return settings.fatFractionOfLoss.low;
  if (band === "mid") return settings.fatFractionOfLoss.mid;
  return settings.fatFractionOfLoss.high;
}

export interface BmrInput {
  sex: Gender;
  weightKg: number;
  heightCm: number;
  leanMassKg: number;
  age?: number | null;
  settings: GoalSettings;
}

export interface BmrResult {
  /** Blended value actually used downstream. */
  bmr: number;
  katch: number;
  /** null when age is unknown (Mifflin needs it). */
  mifflin: number | null;
}

/** Katch-McArdle from lean mass, blended with Mifflin-St Jeor when age is known. */
export function bmrFor(input: BmrInput): BmrResult {
  const { sex, weightKg, heightCm, leanMassKg, age, settings } = input;
  const katch = 370 + 21.6 * leanMassKg;
  if (age === null || age === undefined || !Number.isFinite(age) || age <= 0) {
    return { bmr: katch, katch, mifflin: null };
  }
  const mifflin = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
  const w = settings.bmrBlendKatchWeight;
  return { bmr: w * katch + (1 - w) * mifflin, katch, mifflin };
}

export function tdeeFor(bmr: number, activityLevel: ActivityLevel, settings: GoalSettings): number {
  const mult = settings.activityMultipliers[activityLevel] ?? settings.activityMultipliers.moderate ?? 1.55;
  return bmr * mult;
}

export interface MacrosInput {
  sex: Gender;
  weightKg: number;
  leanMassKg: number;
  bodyFatPct: number;
  dailyCalories: number;
  settings: GoalSettings;
}

/** Protein by leanness band (g/kg lean, floored by g/kg bodyweight), fat as a share of calories, carbs fill the rest. */
export function macrosFor(input: MacrosInput): Macros {
  const { sex, weightKg, leanMassKg, bodyFatPct, dailyCalories, settings } = input;
  const band = leannessBandFor(sex, bodyFatPct, settings);
  const perKgLean =
    band === "lean" ? settings.protein.leanGPerKgLean : band === "mid" ? settings.protein.midGPerKgLean : settings.protein.highGPerKgLean;
  const proteinG = Math.max(perKgLean * leanMassKg, settings.protein.floorGPerKgBodyweight * weightKg);
  const fatG = (settings.fatPctOfCalories * dailyCalories) / 9;
  const carbsG = Math.max(50, (dailyCalories - 4 * proteinG - 9 * fatG) / 4);
  return {
    calories: round(dailyCalories, 0),
    protein: round(proteinG, 0),
    carbs: round(carbsG, 0),
    fat: round(fatG, 0),
  };
}
