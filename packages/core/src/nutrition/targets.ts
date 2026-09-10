import { round } from "../utils/index";
import type { DietTargetDTO } from "../schemas/nutrition";
import type { MacroTarget } from "./totals";

/** Used when the user has neither an active goal nor a body measurement. */
export const DEFAULT_DIET_TARGET: DietTargetDTO = {
  mode: "auto",
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
  derivedFrom: "default",
};

/** Maintenance defaults — moderate protein, 25 % of calories from fat. */
export const MAINTENANCE_PROTEIN_G_PER_KG_LEAN = 2.0;
export const MAINTENANCE_FAT_PCT = 0.25;

/** Katch-McArdle resting metabolic rate: 370 + 21.6 × fat-free mass (kg). */
export function katchMcArdleBmr(leanMassKg: number): number {
  if (!Number.isFinite(leanMassKg) || leanMassKg <= 0) return 0;
  return round(370 + 21.6 * leanMassKg);
}

/** Split `calories` into macros: protein fixed, fat a share of calories, carbs take the remainder. */
export function macrosFromCalories(calories: number, proteinG: number, fatPctOfCalories: number): MacroTarget {
  const kcal = Math.max(0, round(calories));
  const protein = Math.max(0, round(proteinG));
  const fat = Math.max(0, round((kcal * fatPctOfCalories) / 9));
  const carbs = Math.max(0, round((kcal - protein * 4 - fat * 9) / 4));
  return { calories: kcal, protein, carbs, fat };
}

export interface MaintenanceInput {
  leanMassKg: number;
  activityMultiplier: number;
  proteinGPerKgLean?: number;
  fatPctOfCalories?: number;
}

/** Maintenance calories + macros from body composition; null when lean mass is unknown. */
export function maintenanceTarget(input: MaintenanceInput): MacroTarget | null {
  const bmr = katchMcArdleBmr(input.leanMassKg);
  if (bmr === 0) return null;
  const mult = Number.isFinite(input.activityMultiplier) && input.activityMultiplier > 0 ? input.activityMultiplier : 1.2;
  const calories = round(bmr * mult);
  const protein = (input.proteinGPerKgLean ?? MAINTENANCE_PROTEIN_G_PER_KG_LEAN) * input.leanMassKg;
  return macrosFromCalories(calories, protein, input.fatPctOfCalories ?? MAINTENANCE_FAT_PCT);
}

export interface AutoTargetInput {
  /** Macros of the active goal's current roadmap week (or the plan's headline macros). */
  goalMacros?: MacroTarget | null;
  maintenance?: MaintenanceInput | null;
}

/**
 * The auto-mode decision: active goal → its macros; else body composition → maintenance;
 * else the flat defaults. Pure so the route stays a two-query lookup.
 */
export function autoDietTarget(input: AutoTargetInput): DietTargetDTO {
  const g = input.goalMacros;
  if (g && Number.isFinite(g.calories) && g.calories > 0) {
    return {
      mode: "auto",
      calories: round(g.calories),
      protein: round(g.protein ?? 0),
      carbs: round(g.carbs ?? 0),
      fat: round(g.fat ?? 0),
      derivedFrom: "goal",
    };
  }
  const m = input.maintenance ? maintenanceTarget(input.maintenance) : null;
  if (m) return { mode: "auto", ...m, derivedFrom: "maintenance" };
  return { ...DEFAULT_DIET_TARGET };
}

export interface RoadmapSpan {
  weekIndex: number;
  startKey: string;
  endKey: string;
}

/**
 * The roadmap week covering `dateKey`, clamped to the plan's ends (before the plan → week 1,
 * after it → the last week) so a target is always available.
 */
export function pickRoadmapWeek<T extends RoadmapSpan>(roadmap: readonly T[], dateKey: string): T | null {
  if (!roadmap || roadmap.length === 0) return null;
  const hit = roadmap.find((w) => w.startKey <= dateKey && dateKey <= w.endKey);
  if (hit) return hit;
  if (dateKey < roadmap[0].startKey) return roadmap[0];
  return roadmap[roadmap.length - 1];
}
