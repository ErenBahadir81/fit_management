/**
 * The goal engine: target body-fat % → kg of fat to lose, safe weekly rate, daily calories,
 * macros and a week-by-week roadmap. Implements docs/plan/03-goal-engine.md steps 1–7.
 * Pure and deterministic: the same input always yields the same plan.
 */
import { MIN_SAFE_BODY_FAT } from "../navy/index";
import type { ActivityLevel, Gender, GoalProfile } from "../schemas/common";
import type { GoalPlan, GoalWarning, Macros, RoadmapWeek } from "../schemas/goal";
import type { GoalSettings } from "../schemas/settings";
import { shiftKey } from "../time/index";
import { round } from "../utils/index";
import { dailyTargetFor, safeWeeklyRate } from "./rate";
import { bmrFor, fatFractionFor, macrosFor, tdeeFor } from "./tdee";

export interface GoalEngineInput {
  sex: Gender;
  weightKg: number;
  bodyFatPct: number;
  heightCm: number;
  /** Optional — without it the BMR blend falls back to Katch-McArdle alone. */
  age?: number | null;
  activityLevel: ActivityLevel;
  targetBodyFatPct: number;
  profile?: GoalProfile;
  /** dateKey the plan starts on (week 1 covers startDate … startDate + 6). */
  startDate: string;
  settings: GoalSettings;
  /** Measured TDEE from recalibration; disables the a-priori adaptation when present. */
  tdeeOverride?: number | null;
}

/** Weight at which the current lean mass equals `targetBodyFatPct` of bodyweight. */
function weightAtTargetBf(leanMassKg: number, targetBodyFatPct: number): number {
  return leanMassKg / (1 - targetBodyFatPct / 100);
}

export function computeGoalPlan(input: GoalEngineInput): GoalPlan {
  const { sex, weightKg, bodyFatPct, heightCm, activityLevel, targetBodyFatPct, startDate, settings } = input;
  const profile: GoalProfile = input.profile ?? "optimal";
  const age = input.age ?? null;
  const tdeeOverride = input.tdeeOverride ?? null;
  const warnings = new Set<GoalWarning>();

  /* Step 1 — body composition */
  const fatMassKg = (weightKg * bodyFatPct) / 100;
  const leanMassKg = weightKg - fatMassKg;

  /* Step 2 — how much fat to lose with lean mass preserved */
  const targetWeightKg = weightAtTargetBf(leanMassKg, targetBodyFatPct);
  const rawFatToLose = weightKg - targetWeightKg;
  const reachable = rawFatToLose > 0.005;
  if (!reachable) warnings.add("TARGET_ABOVE_CURRENT");
  if (targetBodyFatPct < MIN_SAFE_BODY_FAT[sex]) warnings.add("TARGET_TOO_LOW");
  const fatToLoseKg = reachable ? rawFatToLose : 0;

  /* Step 3 — total energy */
  const totalDeficitKcal = fatToLoseKg * settings.kcalPerKgFat;

  /* Step 5 — energy expenditure (BMR blend → TDEE) */
  const bmr0 = bmrFor({ sex, weightKg, heightCm, leanMassKg, age, settings });
  const tdeeFormula = tdeeFor(bmr0.bmr, activityLevel, settings);
  const tdee0 = tdeeOverride ?? tdeeFormula;

  /* Steps 4, 6, 7 — week-by-week simulation */
  const roadmap: RoadmapWeek[] = [];
  const state = { weightKg, fatMassKg, leanMassKg, bodyFatPct };
  let cumulativeDeficitKcal = 0;
  let cumulativeLossKg = 0;
  let hitHorizon = false;

  if (reachable) {
    for (let i = 0; i < settings.maxWeeks; i++) {
      // Weight still to lose so that (fat − Δw·ff) / (weight − Δw) = target, i.e. accounting for
      // the lean tissue that goes with it. With ff = 1 this collapses to the step-2 formula.
      const ff = fatFractionFor(sex, state.bodyFatPct, settings);
      const denom = ff - targetBodyFatPct / 100;
      const remainingKg = denom > 0.01 ? (state.fatMassKg - (targetBodyFatPct * state.weightKg) / 100) / denom : 0;
      if (remainingKg <= 0.005 || state.bodyFatPct <= targetBodyFatPct + 0.005) break;

      // a-priori metabolic adaptation (skipped when a measured TDEE is in force)
      const adaptivePart = tdeeOverride
        ? 0
        : Math.min(settings.adaptation.adaptivePctPerWeek * i, settings.adaptation.adaptiveCapPct) * tdee0;
      const massPart = tdeeOverride ? 0 : settings.adaptation.kcalPerDayPerKgLost * cumulativeLossKg;
      const tdeeWeek = Math.max(tdee0 * 0.5, tdee0 - adaptivePart - massPart);

      const bmrWeek = bmrFor({ sex, weightKg: state.weightKg, heightCm, leanMassKg: state.leanMassKg, age, settings });
      const rate = safeWeeklyRate({
        sex,
        weightKg: state.weightKg,
        fatMassKg: state.fatMassKg,
        bodyFatPct: state.bodyFatPct,
        tdee: tdeeWeek,
        profile,
        settings,
      });
      const day = dailyTargetFor({ rateKgPerWeek: rate.rateKgPerWeek, tdee: tdeeWeek, bmr: bmrWeek.bmr, sex, settings });
      if (day.floorLimited) warnings.add("FLOOR_LIMITED");
      if (i === 0 && rate.limitedBy === "alpert") warnings.add("ALPERT_LIMITED");
      if (day.rateKgPerWeek <= 0.0005) break; // cannot progress without breaking the calorie floor

      const lossKg = Math.min(day.rateKgPerWeek, remainingKg);
      const fatLost = lossKg * ff;

      const startWeightKg = state.weightKg;
      const startBfPct = state.bodyFatPct;
      state.weightKg -= lossKg;
      state.fatMassKg -= fatLost;
      state.leanMassKg = state.weightKg - state.fatMassKg;
      state.bodyFatPct = (state.fatMassKg / state.weightKg) * 100;
      cumulativeLossKg += lossKg;
      cumulativeDeficitKcal += day.weeklyDeficitKcal;

      roadmap.push({
        weekIndex: i + 1,
        startKey: shiftKey(startDate, 7 * i),
        endKey: shiftKey(startDate, 7 * i + 6),
        startWeightKg: round(startWeightKg, 2),
        endWeightKg: round(state.weightKg, 2),
        startBfPct: round(startBfPct, 2),
        endBfPct: round(state.bodyFatPct, 2),
        rateKgPerWeek: round(lossKg, 3),
        weeklyDeficitKcal: round(day.weeklyDeficitKcal, 0),
        dailyCalorieTarget: day.dailyCalorieTarget,
        cumulativeDeficitKcal: round(cumulativeDeficitKcal, 0),
        macros: macrosFor({
          sex,
          weightKg: startWeightKg,
          leanMassKg: state.leanMassKg + (lossKg - fatLost),
          bodyFatPct: startBfPct,
          dailyCalories: day.dailyCalorieTarget,
          settings,
        }),
      });
      if (i === settings.maxWeeks - 1) hitHorizon = true;
    }
  }

  const estimatedWeeks = roadmap.length;
  if (hitHorizon || estimatedWeeks > 52) warnings.add("LONG_HORIZON");

  const maintenanceMacros: Macros = macrosFor({ sex, weightKg, leanMassKg, bodyFatPct, dailyCalories: tdee0, settings });
  const totalLossKg = roadmap.length > 0 ? cumulativeLossKg : 0;
  const avgWeightKg = (weightKg + (reachable ? targetWeightKg : weightKg)) / 2;

  return {
    fatToLoseKg: round(fatToLoseKg, 2),
    totalLossKg: round(totalLossKg, 2),
    targetWeightKg: round(reachable ? targetWeightKg : weightKg, 2),
    totalDeficitKcal: round(totalDeficitKcal, 0),
    avgWeightKg: round(avgWeightKg, 2),
    pctChange: round(avgWeightKg > 0 ? (totalLossKg / avgWeightKg) * 100 : 0, 2),
    leanMassKg: round(leanMassKg, 2),
    fatMassKg: round(fatMassKg, 2),
    bmr: round(bmr0.bmr, 1),
    bmrMifflin: bmr0.mifflin === null ? null : round(bmr0.mifflin, 1),
    tdeeFormula: round(tdeeFormula, 1),
    tdee: round(tdee0, 1),
    activityLevel,
    profile,
    initialRateKgPerWeek: roadmap[0]?.rateKgPerWeek ?? 0,
    initialDailyCalorieTarget: roadmap[0]?.dailyCalorieTarget ?? round(tdee0, 0),
    macros: roadmap[0]?.macros ?? maintenanceMacros,
    estimatedWeeks,
    startKey: startDate,
    targetDate: shiftKey(startDate, 7 * estimatedWeeks),
    roadmap,
    warnings: [...warnings],
  };
}

/** TDEE implied by a roadmap week (daily target + the week's deficit spread over 7 days). */
export function tdeeForWeek(plan: GoalPlan, weekIndex: number): number {
  const w = plan.roadmap[weekIndex - 1];
  return w ? w.dailyCalorieTarget + w.weeklyDeficitKcal / 7 : plan.tdee;
}
