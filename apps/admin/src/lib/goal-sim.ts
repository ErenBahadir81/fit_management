/**
 * Local goal-engine simulator for the admin panel.
 *
 * `@fitfloow/core/goal` is still an empty stub while B3 builds it, so the rate-table
 * simulator on /goals-settings computes the plan client-side. The implementation follows
 * docs/plan/03-goal-engine.md step for step and returns the exact `GoalPlan` DTO, so the
 * day core exports `computeGoalPlan` this module becomes a one-line re-export.
 */
import {
  MIN_SAFE_BODY_FAT,
  clamp,
  round,
  shiftKey,
  type ActivityLevel,
  type Gender,
  type GoalPlan,
  type GoalProfile,
  type GoalSettings,
  type GoalWarning,
  type Macros,
  type RateBand,
  type RoadmapWeek,
} from "@fitfloow/core";

export interface GoalSimInput {
  sex: Gender;
  weightKg: number;
  bodyFatPct: number;
  heightCm: number;
  age?: number | null;
  activityLevel: ActivityLevel;
  targetBodyFatPct: number;
  profile: GoalProfile;
  startKey: string;
  settings: GoalSettings;
  tdeeOverride?: number | null;
}

export type RateLimiter = "table" | "absolute" | "alpert" | "relative" | "none";

export interface RateState {
  sex: Gender;
  weightKg: number;
  fatMassKg: number;
  bodyFatPct: number;
  tdee: number;
  profile: GoalProfile;
  settings: GoalSettings;
}

export interface RateResult {
  rateKgPerWeek: number;
  limitedBy: RateLimiter;
  band: RateBand | null;
  caps: { table: number; absolute: number; alpert: number; relative: number };
}

const PROFILE_FIELD = {
  conservative: "conservativePctBwPerWeek",
  optimal: "optimalPctBwPerWeek",
  aggressive: "aggressivePctBwPerWeek",
} as const satisfies Record<GoalProfile, keyof RateBand>;

/** Band lookup: `bfMin` inclusive, `bfMax` exclusive (the top band swallows 100). */
export function findBand(bands: RateBand[], sex: Gender, bodyFatPct: number): RateBand | null {
  const list = bands.filter((b) => b.sex === sex).sort((a, b) => a.bfMin - b.bfMin);
  if (list.length === 0) return null;
  for (const b of list) if (bodyFatPct >= b.bfMin && bodyFatPct < b.bfMax) return b;
  return bodyFatPct >= list[list.length - 1].bfMax ? list[list.length - 1] : list[0];
}

/** Step 4 — four caps, the smallest wins. */
export function rateForState(state: RateState): RateResult {
  const { settings, sex, weightKg, fatMassKg, bodyFatPct, tdee, profile } = state;
  const band = findBand(settings.rateTable, sex, bodyFatPct);
  const pctPerWeek = band ? (band[PROFILE_FIELD[profile]] as number) : 0.5;

  const caps = {
    table: (weightKg * pctPerWeek) / 100,
    absolute: band ? band.maxKgPerWeek : Number.POSITIVE_INFINITY,
    alpert: (fatMassKg * settings.alpertKcalPerKgFatPerDay * settings.alpertSafetyFactor * 7) / settings.kcalPerKgFat,
    relative: (settings.maxRelativeDeficitPct * tdee * 7) / settings.kcalPerKgFat,
  };

  let limitedBy: RateLimiter = "table";
  let rate = caps.table;
  for (const key of ["absolute", "alpert", "relative"] as const) {
    if (caps[key] < rate) {
      rate = caps[key];
      limitedBy = key;
    }
  }
  if (!Number.isFinite(rate) || rate <= 0) return { rateKgPerWeek: 0, limitedBy: "none", band, caps };
  return { rateKgPerWeek: rate, limitedBy, band, caps };
}

type LeannessBand = "lean" | "mid" | "high";

function leannessBand(settings: GoalSettings, sex: Gender, bodyFatPct: number): LeannessBand {
  const b = settings.leannessBands[sex];
  if (bodyFatPct < b.lo) return "lean";
  if (bodyFatPct < b.hi) return "mid";
  return "high";
}

function fatFraction(settings: GoalSettings, band: LeannessBand): number {
  // A leaner dieter loses proportionally more lean mass → smaller fat fraction.
  return band === "lean" ? settings.fatFractionOfLoss.low : band === "mid" ? settings.fatFractionOfLoss.mid : settings.fatFractionOfLoss.high;
}

function proteinGrams(settings: GoalSettings, band: LeannessBand, leanMassKg: number, weightKg: number): number {
  const perLean =
    band === "lean" ? settings.protein.leanGPerKgLean : band === "mid" ? settings.protein.midGPerKgLean : settings.protein.highGPerKgLean;
  return Math.max(perLean * leanMassKg, settings.protein.floorGPerKgBodyweight * weightKg);
}

export function katchBmr(leanMassKg: number): number {
  return 370 + 21.6 * leanMassKg;
}

export function mifflinBmr(sex: Gender, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

/** Step 5 — BMR blend. Mifflin only participates when age is known. */
export function blendedBmr(input: {
  settings: GoalSettings;
  sex: Gender;
  leanMassKg: number;
  weightKg: number;
  heightCm: number;
  age?: number | null;
}): { bmr: number; bmrKatch: number; bmrMifflin: number | null } {
  const bmrKatch = katchBmr(input.leanMassKg);
  if (input.age === null || input.age === undefined) return { bmr: bmrKatch, bmrKatch, bmrMifflin: null };
  const bmrMifflin = mifflinBmr(input.sex, input.weightKg, input.heightCm, input.age);
  const w = input.settings.bmrBlendKatchWeight;
  return { bmr: w * bmrKatch + (1 - w) * bmrMifflin, bmrKatch, bmrMifflin };
}

export function macrosFor(settings: GoalSettings, calories: number, proteinG: number): Macros {
  const fatG = (settings.fatPctOfCalories * calories) / 9;
  const carbsG = Math.max(50, (calories - 4 * proteinG - 9 * fatG) / 4);
  return { calories: round(calories, 0), protein: round(proteinG, 0), carbs: round(carbsG, 0), fat: round(fatG, 0) };
}

interface DailyTarget {
  dailyCalorieTarget: number;
  rateKgPerWeek: number;
  weeklyDeficitKcal: number;
  floorLimited: boolean;
}

/** Step 6 — daily target for a week at rate `r`, pushed back up by the floor when needed. */
function dailyTargetFor(settings: GoalSettings, sex: Gender, rate: number, tdee: number, bmr: number): DailyTarget {
  const weeklyDeficit = rate * settings.kcalPerKgFat;
  let daily = tdee - weeklyDeficit / 7;
  const floor = Math.max(settings.calorieFloor[sex], bmr * settings.minBmrFactor, tdee * settings.minTdeeFactor);
  let floorLimited = false;
  let effectiveRate = rate;
  if (daily < floor) {
    daily = floor;
    effectiveRate = Math.max(0, ((tdee - floor) * 7) / settings.kcalPerKgFat);
    floorLimited = true;
  }
  return {
    dailyCalorieTarget: daily,
    rateKgPerWeek: effectiveRate,
    weeklyDeficitKcal: effectiveRate * settings.kcalPerKgFat,
    floorLimited,
  };
}

/** Target weight that keeps the current lean mass at the requested body-fat percentage. */
export function targetWeightFor(leanMassKg: number, targetBodyFatPct: number): number {
  return leanMassKg / (1 - targetBodyFatPct / 100);
}

export function computeGoalPlan(input: GoalSimInput): GoalPlan {
  const { settings, sex, heightCm, activityLevel, profile, startKey } = input;
  const weight0 = input.weightKg;
  const bf0 = clamp(input.bodyFatPct, 0, 100);
  const target = clamp(input.targetBodyFatPct, 0, 100);
  const warnings = new Set<GoalWarning>();

  const fatMass0 = (weight0 * bf0) / 100;
  const leanMass0 = weight0 - fatMass0;
  const targetWeight0 = targetWeightFor(leanMass0, target);
  const fatToLose = Math.max(0, weight0 - targetWeight0);

  if (target >= bf0) warnings.add("TARGET_ABOVE_CURRENT");
  if (target < MIN_SAFE_BODY_FAT[sex]) warnings.add("TARGET_TOO_LOW");

  const activityMultiplier = settings.activityMultipliers[activityLevel] ?? 1.55;
  const { bmr: bmr0, bmrMifflin } = blendedBmr({ settings, sex, leanMassKg: leanMass0, weightKg: weight0, heightCm, age: input.age });
  const tdeeFormula = bmr0 * activityMultiplier;
  const tdee0 = input.tdeeOverride ?? tdeeFormula;

  const roadmap: RoadmapWeek[] = [];
  const state = { weight: weight0, fatMass: fatMass0, leanMass: leanMass0, bf: bf0 };
  let tdee = tdee0;
  let adaptivePctApplied = 0;
  let cumulativeDeficit = 0;
  let initialRate = 0;
  let initialDaily = tdee0;
  let initialMacros: Macros = macrosFor(settings, tdee0, proteinGrams(settings, leannessBand(settings, sex, bf0), leanMass0, weight0));

  if (fatToLose > 0.005) {
    for (let i = 0; i < settings.maxWeeks; i++) {
      if (state.bf <= target + 0.005) break;

      const lean = leannessBand(settings, sex, state.bf);
      const bmrWeek = blendedBmr({ settings, sex, leanMassKg: state.leanMass, weightKg: state.weight, heightCm, age: input.age }).bmr;
      const { rateKgPerWeek: rawRate } = rateForState({
        sex,
        weightKg: state.weight,
        fatMassKg: state.fatMass,
        bodyFatPct: state.bf,
        tdee,
        profile,
        settings,
      });
      const day = dailyTargetFor(settings, sex, rawRate, tdee, bmrWeek);
      if (day.floorLimited) warnings.add("FLOOR_LIMITED");
      if (day.rateKgPerWeek <= 0.001) break;

      const remaining = Math.max(0, state.weight - targetWeightFor(state.leanMass, target));
      const lossKg = Math.min(day.rateKgPerWeek, remaining);
      if (lossKg <= 0.001) break;

      const proteinG = proteinGrams(settings, lean, state.leanMass, state.weight);
      const macros = macrosFor(settings, day.dailyCalorieTarget, proteinG);
      const weeklyDeficit = lossKg * settings.kcalPerKgFat;
      cumulativeDeficit += weeklyDeficit;

      const startWeight = state.weight;
      const startBf = state.bf;
      const fatLost = lossKg * fatFraction(settings, lean);
      state.weight = startWeight - lossKg;
      state.fatMass = Math.max(0, state.fatMass - fatLost);
      state.leanMass = state.weight - state.fatMass;
      state.bf = state.weight > 0 ? (state.fatMass / state.weight) * 100 : 0;

      roadmap.push({
        weekIndex: i + 1,
        startKey: shiftKey(startKey, i * 7),
        endKey: shiftKey(startKey, (i + 1) * 7),
        startWeightKg: round(startWeight, 2),
        endWeightKg: round(state.weight, 2),
        startBfPct: round(startBf, 2),
        endBfPct: round(state.bf, 2),
        rateKgPerWeek: round(lossKg, 3),
        weeklyDeficitKcal: round(weeklyDeficit, 0),
        dailyCalorieTarget: round(day.dailyCalorieTarget, 0),
        cumulativeDeficitKcal: round(cumulativeDeficit, 0),
        macros,
      });

      if (i === 0) {
        initialRate = lossKg;
        initialDaily = day.dailyCalorieTarget;
        initialMacros = macros;
      }

      // A-priori metabolic adaptation, only while no measured TDEE is available.
      if (input.tdeeOverride === null || input.tdeeOverride === undefined) {
        const step = Math.max(0, Math.min(settings.adaptation.adaptivePctPerWeek, settings.adaptation.adaptiveCapPct - adaptivePctApplied));
        adaptivePctApplied += step;
        tdee = Math.max(bmrWeek, tdee - settings.adaptation.kcalPerDayPerKgLost * lossKg - step * tdee0);
      }
    }
  }

  if (roadmap.length > 52) warnings.add("LONG_HORIZON");
  const totalLoss = round(weight0 - (roadmap.length > 0 ? roadmap[roadmap.length - 1].endWeightKg : weight0), 2);
  const avgWeight = (weight0 + targetWeight0) / 2;

  return {
    fatToLoseKg: round(fatToLose, 2),
    totalLossKg: totalLoss,
    targetWeightKg: round(targetWeight0, 2),
    totalDeficitKcal: round(fatToLose * settings.kcalPerKgFat, 0),
    avgWeightKg: round(avgWeight, 2),
    pctChange: avgWeight > 0 ? round(((weight0 - targetWeight0) / avgWeight) * 100, 2) : 0,
    leanMassKg: round(leanMass0, 2),
    fatMassKg: round(fatMass0, 2),
    bmr: round(bmr0, 0),
    bmrMifflin: bmrMifflin === null ? null : round(bmrMifflin, 0),
    tdeeFormula: round(tdeeFormula, 0),
    tdee: round(tdee0, 0),
    activityLevel,
    profile,
    initialRateKgPerWeek: round(initialRate, 3),
    initialDailyCalorieTarget: round(initialDaily, 0),
    macros: initialMacros,
    estimatedWeeks: roadmap.length,
    startKey,
    targetDate: roadmap.length > 0 ? roadmap[roadmap.length - 1].endKey : startKey,
    roadmap,
    warnings: [...warnings],
  };
}

export const RATE_LIMITER_TR: Record<RateLimiter, string> = {
  table: "Oran tablosu",
  absolute: "Bant üst sınırı",
  alpert: "Alpert yağ mobilizasyonu",
  relative: "Göreli açık sınırı",
  none: "—",
};

export const GOAL_WARNING_TR: Record<GoalWarning, string> = {
  TARGET_ABOVE_CURRENT: "Hedef, mevcut yağ oranının üstünde — kaybedilecek yağ yok.",
  TARGET_TOO_LOW: "Hedef temel yağ sınırının altında; sağlık riski taşır.",
  FLOOR_LIMITED: "Kalori tabanına takıldı; haftalık hız düşürüldü.",
  LONG_HORIZON: "Plan bir yılı aşıyor; ara hedef önerilir.",
  NO_BODY_ENTRY: "Ölçüm kaydı yok; plan varsayılan değerlerle hesaplandı.",
  ALPERT_LIMITED: "Yağ mobilizasyon tavanı (Alpert) hızı sınırlıyor.",
};
