/**
 * Safe weekly fat-loss rate (03-goal-engine.md step 4) and the daily calorie target with floors (step 6).
 */
import type { Gender, GoalProfile } from "../schemas/common";
import type { GoalSettings, RateBand } from "../schemas/settings";
import { round } from "../utils/index";

/** Which of the four caps produced the final rate. */
export type RateLimit = "table" | "absolute" | "alpert" | "relative";

/**
 * Band lookup: `bfMin <= bf < bfMax`. Values outside the table clamp to the first/last band
 * so the engine never fails on an extreme measurement.
 */
export function rateBandFor(sex: Gender, bodyFatPct: number, table: RateBand[]): RateBand {
  const bands = table.filter((b) => b.sex === sex).sort((a, b) => a.bfMin - b.bfMin);
  if (bands.length === 0) throw new Error(`rateTable has no bands for ${sex}`);
  const hit = bands.find((b) => bodyFatPct >= b.bfMin && bodyFatPct < b.bfMax);
  if (hit) return hit;
  return bodyFatPct < bands[0].bfMin ? bands[0] : bands[bands.length - 1];
}

export interface RateInput {
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
  limitedBy: RateLimit;
  band: RateBand;
  caps: { table: number; absolute: number; alpert: number; relative: number };
}

/** The smallest of the four caps wins; `limitedBy` records which one. */
export function safeWeeklyRate(input: RateInput): RateResult {
  const { sex, weightKg, fatMassKg, bodyFatPct, tdee, profile, settings } = input;
  const band = rateBandFor(sex, bodyFatPct, settings.rateTable);
  const pct =
    profile === "conservative" ? band.conservativePctBwPerWeek : profile === "aggressive" ? band.aggressivePctBwPerWeek : band.optimalPctBwPerWeek;

  const caps = {
    table: (weightKg * pct) / 100,
    absolute: band.maxKgPerWeek,
    alpert: (Math.max(0, fatMassKg) * settings.alpertKcalPerKgFatPerDay * settings.alpertSafetyFactor * 7) / settings.kcalPerKgFat,
    relative: (settings.maxRelativeDeficitPct * Math.max(0, tdee) * 7) / settings.kcalPerKgFat,
  };

  const order: RateLimit[] = ["table", "absolute", "alpert", "relative"];
  let limitedBy: RateLimit = "table";
  let rate = caps.table;
  for (const k of order) {
    if (caps[k] < rate) {
      rate = caps[k];
      limitedBy = k;
    }
  }
  return { rateKgPerWeek: Math.max(0, round(rate, 4)), limitedBy, band, caps };
}

export interface DailyTargetInput {
  rateKgPerWeek: number;
  tdee: number;
  bmr: number;
  sex: Gender;
  settings: GoalSettings;
}

export interface DailyTargetResult {
  dailyCalorieTarget: number;
  /** Possibly reduced when the calorie floor binds. */
  rateKgPerWeek: number;
  weeklyDeficitKcal: number;
  floor: number;
  floorLimited: boolean;
}

/** `floor = max(sex floor, bmr × minBmrFactor, tdee × minTdeeFactor)`; hitting it lowers the rate. */
export function dailyTargetFor(input: DailyTargetInput): DailyTargetResult {
  const { rateKgPerWeek, tdee, bmr, sex, settings } = input;
  const floor = Math.max(settings.calorieFloor[sex], bmr * settings.minBmrFactor, tdee * settings.minTdeeFactor);
  const raw = tdee - (rateKgPerWeek * settings.kcalPerKgFat) / 7;
  // The relative-deficit cap (30 % of TDEE) and the minTdeeFactor floor (70 %) are exact
  // complements, so compare with a tolerance to avoid a spurious FLOOR_LIMITED from float noise.
  if (raw >= floor - 1e-6) {
    const daily = round(raw, 0);
    return {
      dailyCalorieTarget: daily,
      rateKgPerWeek: round(rateKgPerWeek, 4),
      weeklyDeficitKcal: round((tdee - daily) * 7, 0),
      floor: round(floor, 2),
      floorLimited: false,
    };
  }
  const daily = round(floor, 0);
  const adjusted = Math.max(0, ((tdee - floor) * 7) / settings.kcalPerKgFat);
  return {
    dailyCalorieTarget: daily,
    rateKgPerWeek: round(adjusted, 4),
    weeklyDeficitKcal: round(Math.max(0, (tdee - daily) * 7), 0),
    floor: round(floor, 2),
    floorLimited: true,
  };
}
