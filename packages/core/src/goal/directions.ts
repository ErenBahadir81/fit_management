/**
 * T7 — the two new plan directions. Same inputs and the same `GoalPlan` shape as the cut engine
 * (`./plan`), so the roadmap screen, charts, weekly report and progress bars work unchanged.
 *
 * Bulk:   each week adds the literature lean-gain rate for the level (tapering near the FFMI
 *         ceiling) plus the fat that comes with it; calories = TDEE + the energy to build both.
 * Recomp: a small fixed deficit (recompDeficitPct of TDEE); a reduced lean-gain rate is paid for
 *         out of fat stores, so fat falls a little faster than the deficit alone would explain
 *         and bodyweight drifts down only slowly.
 *
 * Constants: `settings.muscle` (docs/research/muscle-gain-science.md). Pure and deterministic.
 */
import { ffmi } from "../body/ffmi";
import type { GoalProfile } from "../schemas/common";
import type { GoalPlan, GoalWarning, Macros, RoadmapWeek, TrainingLevel } from "../schemas/goal";
import type { GoalSettings } from "../schemas/settings";
import { shiftKey } from "../time/index";
import { clamp, round } from "../utils/index";
import { goalMilestones, goalSummaryTr } from "./milestones";
import { inferTrainingLevel, levelAfterWeeks, muscleGainRate, recompLeanRate } from "./muscle";
import type { GoalEngineInput } from "./plan";
import { bmrFor, macrosFor, tdeeFor } from "./tdee";

/** Protein by bodyweight, fat as a share of calories, carbs fill the rest (Morton 2018 / Helms). */
export function bulkMacrosFor(weightKg: number, dailyCalories: number, settings: GoalSettings): Macros {
  const proteinG = settings.muscle.bulkProteinGPerKg * weightKg;
  const fatG = (settings.fatPctOfCalories * dailyCalories) / 9;
  const carbsG = Math.max(50, (dailyCalories - 4 * proteinG - 9 * fatG) / 4);
  return { calories: round(dailyCalories, 0), protein: round(proteinG, 0), carbs: round(carbsG, 0), fat: round(fatG, 0) };
}

interface Start {
  fatMassKg: number;
  leanMassKg: number;
  bmr: ReturnType<typeof bmrFor>;
  tdeeFormula: number;
  tdee0: number;
  level: TrainingLevel;
  ffmi0: number;
}

function startOf(input: GoalEngineInput): Start {
  const { sex, weightKg, bodyFatPct, heightCm, settings } = input;
  const fatMassKg = (weightKg * bodyFatPct) / 100;
  const leanMassKg = weightKg - fatMassKg;
  const bmr = bmrFor({ sex, weightKg, heightCm, leanMassKg, age: input.age ?? null, settings });
  const tdeeFormula = tdeeFor(bmr.bmr, input.activityLevel, settings);
  const ffmi0 = ffmi(leanMassKg, heightCm);
  return {
    fatMassKg,
    leanMassKg,
    bmr,
    tdeeFormula,
    tdee0: input.tdeeOverride ?? tdeeFormula,
    level: input.trainingLevel ?? inferTrainingLevel(sex, ffmi0, settings),
    ffmi0,
  };
}

interface Finish {
  input: GoalEngineInput;
  start: Start;
  roadmap: RoadmapWeek[];
  end: { weightKg: number; fatMassKg: number; leanMassKg: number };
  cumulativeDeficitKcal: number;
  maintenanceMacros: Macros;
  warnings: Set<GoalWarning>;
  /** Milestone total in the direction's unit (kg gained for bulk, BF points for recomp). */
  milestoneTotal: number;
}

function finish(f: Finish): GoalPlan {
  const { input, start, roadmap, end, warnings } = f;
  const { weightKg, heightCm, startDate } = input;
  const profile: GoalProfile = input.profile ?? "optimal";
  const estimatedWeeks = roadmap.length;
  if (estimatedWeeks >= input.settings.maxWeeks || estimatedWeeks > 52) warnings.add("LONG_HORIZON");
  const weightChange = Math.abs(end.weightKg - weightKg);
  const avgWeightKg = (weightKg + end.weightKg) / 2;
  const base = {
    direction: input.direction ?? "cut",
    fatToLoseKg: round(Math.max(0, start.fatMassKg - end.fatMassKg), 2),
    totalLossKg: round(weightChange, 2),
    targetWeightKg: round(end.weightKg, 2),
    totalDeficitKcal: round(f.cumulativeDeficitKcal, 0),
    avgWeightKg: round(avgWeightKg, 2),
    pctChange: round(avgWeightKg > 0 ? (weightChange / avgWeightKg) * 100 : 0, 2),
    leanMassKg: round(start.leanMassKg, 2),
    fatMassKg: round(start.fatMassKg, 2),
    bmr: round(start.bmr.bmr, 1),
    bmrMifflin: start.bmr.mifflin === null ? null : round(start.bmr.mifflin, 1),
    tdeeFormula: round(start.tdeeFormula, 1),
    tdee: round(start.tdee0, 1),
    activityLevel: input.activityLevel,
    profile,
    initialRateKgPerWeek: roadmap[0]?.rateKgPerWeek ?? 0,
    initialDailyCalorieTarget: roadmap[0]?.dailyCalorieTarget ?? round(start.tdee0, 0),
    macros: roadmap[0]?.macros ?? f.maintenanceMacros,
    estimatedWeeks,
    startKey: startDate,
    targetDate: shiftKey(startDate, 7 * estimatedWeeks),
    roadmap,
    warnings: [...warnings],
    targetLeanMassKg: round(end.leanMassKg, 2),
    leanGainKg: round(end.leanMassKg - start.leanMassKg, 2),
    fatGainKg: round(end.fatMassKg - start.fatMassKg, 2),
    ffmiStart: heightCm > 0 ? round(start.ffmi0, 1) : null,
    ffmiEnd: heightCm > 0 ? round(ffmi(end.leanMassKg, heightCm), 1) : null,
    trainingLevel: start.level,
  };
  return {
    ...base,
    milestones: goalMilestones(roadmap, f.milestoneTotal, base.direction),
    summaryTr: goalSummaryTr(base),
  };
}

function week(
  i: number,
  startDate: string,
  from: { weightKg: number; fatMassKg: number },
  to: { weightKg: number; fatMassKg: number },
  dailyCalorieTarget: number,
  tdeeWeek: number,
  cumulativeDeficitKcal: number,
  macros: Macros
): RoadmapWeek {
  const bf = (s: { weightKg: number; fatMassKg: number }) => (s.fatMassKg / s.weightKg) * 100;
  return {
    weekIndex: i + 1,
    startKey: shiftKey(startDate, 7 * i),
    endKey: shiftKey(startDate, 7 * i + 6),
    startWeightKg: round(from.weightKg, 2),
    endWeightKg: round(to.weightKg, 2),
    startBfPct: round(bf(from), 2),
    endBfPct: round(bf(to), 2),
    rateKgPerWeek: round(Math.abs(to.weightKg - from.weightKg), 3),
    weeklyDeficitKcal: round((tdeeWeek - dailyCalorieTarget) * 7, 0),
    dailyCalorieTarget,
    cumulativeDeficitKcal: round(cumulativeDeficitKcal, 0),
    macros,
    startLeanMassKg: round(from.weightKg - from.fatMassKg, 2),
    endLeanMassKg: round(to.weightKg - to.fatMassKg, 2),
  };
}

/** Lean bulk toward `targetLeanGainKg`. */
export function computeBulkPlan(input: GoalEngineInput): GoalPlan {
  const { sex, heightCm, startDate, settings } = input;
  const start = startOf(input);
  const profile: GoalProfile = input.profile ?? "optimal";
  const warnings = new Set<GoalWarning>();
  const target = Math.max(0, input.targetLeanGainKg ?? 0);
  const m = settings.muscle;

  const state = { weightKg: input.weightKg, fatMassKg: start.fatMassKg, leanMassKg: start.leanMassKg };
  const roadmap: RoadmapWeek[] = [];
  let cumLean = 0;
  let cumDeficit = 0;
  if (input.bodyFatPct >= m.bulkBfCeiling[sex]) warnings.add("BULK_BF_CEILING");

  for (let i = 0; i < settings.maxWeeks; i++) {
    const remaining = target - cumLean;
    if (remaining <= 0.005) break;
    const ffmiNow = ffmi(state.leanMassKg, heightCm);
    const rate = muscleGainRate({
      sex,
      weightKg: state.weightKg,
      ffmi: ffmiNow,
      level: levelAfterWeeks(start.level, i),
      profile,
      settings,
    });
    if (rate.leanKgPerWeek < 0.001) break;
    const scale = Math.min(1, remaining / rate.leanKgPerWeek);
    const lean = rate.leanKgPerWeek * scale;
    const fat = rate.fatKgPerWeek * scale;
    const surplusPerDay = (rate.weeklySurplusKcal * scale) / 7;

    // Maintenance rises with the tissue added (same per-kg term the cut engine uses in reverse).
    // A measured TDEE already reflects the current body, so it is used as-is, like on a cut.
    const gained = state.weightKg - input.weightKg;
    const tdeeWeek = input.tdeeOverride ? start.tdee0 : start.tdee0 + settings.adaptation.kcalPerDayPerKgLost * gained;
    const daily = round(tdeeWeek + surplusPerDay, 0);

    const from = { weightKg: state.weightKg, fatMassKg: state.fatMassKg };
    state.leanMassKg += lean;
    state.fatMassKg += fat;
    state.weightKg = state.leanMassKg + state.fatMassKg;
    cumLean += lean;
    cumDeficit += (tdeeWeek - daily) * 7;
    roadmap.push(week(i, startDate, from, state, daily, tdeeWeek, cumDeficit, bulkMacrosFor(from.weightKg, daily, settings)));
    if ((state.fatMassKg / state.weightKg) * 100 >= m.bulkBfCeiling[sex]) warnings.add("BULK_BF_CEILING");
  }

  const endFfmi = ffmi(state.leanMassKg, heightCm);
  if (heightCm > 0 && endFfmi >= m.ffmiCeiling[sex] - 1) warnings.add("NEAR_NATURAL_LIMIT");

  return finish({
    input: { ...input, direction: "bulk" },
    start,
    roadmap,
    end: state,
    cumulativeDeficitKcal: cumDeficit,
    maintenanceMacros: bulkMacrosFor(input.weightKg, start.tdee0, settings),
    warnings,
    milestoneTotal: state.weightKg - input.weightKg,
  });
}

/** Recomposition toward `targetBodyFatPct` at a small deficit. */
export function computeRecompPlan(input: GoalEngineInput): GoalPlan {
  const { sex, heightCm, startDate, settings, bodyFatPct } = input;
  const start = startOf(input);
  const warnings = new Set<GoalWarning>();
  const target = input.targetBodyFatPct ?? bodyFatPct;
  const m = settings.muscle;
  if (start.level === "advanced") warnings.add("RECOMP_SLOW");
  const reachable = target < bodyFatPct - 0.005;
  if (!reachable) warnings.add("TARGET_NOT_BELOW_CURRENT");

  const state = { weightKg: input.weightKg, fatMassKg: start.fatMassKg, leanMassKg: start.leanMassKg };
  const roadmap: RoadmapWeek[] = [];
  let cumDeficit = 0;
  const t = target / 100;

  if (reachable) {
    for (let i = 0; i < settings.maxWeeks; i++) {
      const bfNow = state.fatMassKg / state.weightKg;
      if (bfNow <= t + 0.00005) break;
      const tdeeWeek = start.tdee0;
      const bmrWeek = bmrFor({ sex, weightKg: state.weightKg, heightCm, leanMassKg: state.leanMassKg, age: input.age ?? null, settings });
      const floor = Math.max(settings.calorieFloor[sex], bmrWeek.bmr * settings.minBmrFactor, tdeeWeek * settings.minTdeeFactor);
      const wanted = tdeeWeek - Math.min(tdeeWeek * m.recompDeficitPct, m.recompMaxDeficitKcal);
      const dailyRaw = Math.max(floor, wanted);
      if (dailyRaw > wanted + 1e-6) warnings.add("FLOOR_LIMITED");

      const leanFull = recompLeanRate({
        sex,
        weightKg: state.weightKg,
        ffmi: ffmi(state.leanMassKg, heightCm),
        level: levelAfterWeeks(start.level, i),
        settings,
      });
      const deficitWeek = Math.max(0, (tdeeWeek - dailyRaw) * 7);
      // Building lean tissue costs energy that, at a deficit, can only come from fat stores.
      const fatFull = (deficitWeek + leanFull * m.kcalPerKgLeanGain) / settings.kcalPerKgFat;
      if (fatFull + leanFull < 1e-4) break;
      // Last week: only the fraction that lands exactly on the target.
      //   (fat − f·fl) / (weight − f·fl + f·lean) = t  →  f = (fat − t·weight) / (fl·(1 − t) + t·lean)
      const denom = fatFull * (1 - t) + t * leanFull;
      const frac = denom > 0 ? clamp((state.fatMassKg - t * state.weightKg) / denom, 0, 1) : 1;
      const daily = round(dailyRaw, 0);

      const from = { weightKg: state.weightKg, fatMassKg: state.fatMassKg };
      state.fatMassKg -= fatFull * frac;
      state.leanMassKg += leanFull * frac;
      state.weightKg = state.fatMassKg + state.leanMassKg;
      cumDeficit += (tdeeWeek - daily) * 7;
      const macros = macrosFor({ sex, weightKg: from.weightKg, leanMassKg: state.leanMassKg, bodyFatPct: (from.fatMassKg / from.weightKg) * 100, dailyCalories: daily, settings });
      roadmap.push(week(i, startDate, from, state, daily, tdeeWeek, cumDeficit, macros));
    }
  }

  return finish({
    input: { ...input, direction: "recomp" },
    start,
    roadmap,
    end: state,
    cumulativeDeficitKcal: cumDeficit,
    maintenanceMacros: macrosFor({ sex, weightKg: input.weightKg, leanMassKg: start.leanMassKg, bodyFatPct, dailyCalories: start.tdee0, settings }),
    warnings,
    milestoneTotal: reachable ? bodyFatPct - (state.fatMassKg / state.weightKg) * 100 : 0,
  });
}
