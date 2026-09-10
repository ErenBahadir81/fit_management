/**
 * Measured-TDEE recalibration (MacroFactor-style, 03-goal-engine.md §Recalibration).
 * Energy balance over a settled window: what you ate minus what the trend weight says you stored.
 */
import type { Recalibration } from "../schemas/goal";
import type { GoalSettings } from "../schemas/settings";
import { daysBetween, shiftKey } from "../time/index";
import { clamp, mean, round } from "../utils/index";
import { ewmaAt, ewmaTrend, type WeightPoint } from "./ewma";

export interface DayIntake {
  dateKey: string;
  kcal: number;
  /** Number of meal entries; a day with 0 counts as "not logged". */
  entries?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export function isLogged(d: DayIntake | undefined): boolean {
  if (!d) return false;
  return (d.entries ?? (d.kcal > 0 ? 1 : 0)) > 0;
}

export interface RecalibrationInput {
  /** Goal start dateKey — the settling period is measured from here. */
  startKey: string;
  tdeeFormula: number;
  /** Current estimate (goal.tdeeOverride ?? tdeeFormula). */
  tdeePrev: number;
  weighIns: WeightPoint[];
  dayIntake: DayIntake[];
  todayKey: string;
  settings: GoalSettings;
}

function refuse(input: RecalibrationInput, reason: string, extra: Partial<Recalibration> = {}): Recalibration {
  return {
    tdeeFormula: round(input.tdeeFormula, 1),
    tdeeObserved: null,
    tdeeUsed: round(input.tdeePrev, 1),
    daysUsed: 0,
    avgIntake: null,
    weightDeltaKg: null,
    applied: false,
    reason,
    ...extra,
  };
}

export function recalibrateTdee(input: RecalibrationInput): Recalibration {
  const { startKey, tdeeFormula, tdeePrev, weighIns, dayIntake, todayKey, settings } = input;
  const cfg = settings.recalibration;

  const settledFrom = shiftKey(startKey, cfg.settlingDays);
  const windowFrom = shiftKey(todayKey, -cfg.windowDays);
  const from = settledFrom > windowFrom ? settledFrom : windowFrom;
  const spanDays = daysBetween(from, todayKey);
  if (spanDays < cfg.minDays) {
    return refuse(input, `Ölçüm için en az ${cfg.minDays} gün veri gerekli (şu an ${Math.max(0, spanDays)} gün)`);
  }

  const byKey = new Map(dayIntake.map((d) => [d.dateKey, d]));
  const kcals: number[] = [];
  for (let i = 1; i <= spanDays; i++) {
    const d = byKey.get(shiftKey(from, i));
    if (isLogged(d)) kcals.push(d!.kcal);
  }
  const required = Math.floor((cfg.minIntakeDaysPerWeek * spanDays) / 7);
  if (kcals.length < required) {
    return refuse(input, `Yeterli beslenme kaydı yok (${kcals.length}/${required} gün)`);
  }

  const trend = ewmaTrend(weighIns, settings.ewma);
  const startTrend = ewmaAt(trend, from);
  const endTrend = ewmaAt(trend, todayKey);
  if (startTrend === null || endTrend === null) {
    return refuse(input, "Pencerede yeterli tartı verisi yok");
  }

  const avgIntake = mean(kcals);
  const weightDeltaKg = endTrend - startTrend;
  const observedRaw = avgIntake - (weightDeltaKg * settings.kcalPerKgFat) / spanDays;
  const [lo, hi] = cfg.sanityBounds;
  const tdeeObserved = clamp(observedRaw, lo * tdeeFormula, hi * tdeeFormula);

  const blended = tdeePrev + cfg.dampingBeta * (tdeeObserved - tdeePrev);
  const tdeeUsed = clamp(blended, tdeePrev - cfg.maxWeeklyChangeKcal, tdeePrev + cfg.maxWeeklyChangeKcal);

  return {
    tdeeFormula: round(tdeeFormula, 1),
    tdeeObserved: round(tdeeObserved, 1),
    tdeeUsed: round(tdeeUsed, 1),
    daysUsed: spanDays,
    avgIntake: round(avgIntake, 1),
    weightDeltaKg: round(weightDeltaKg, 3),
    applied: true,
    reason: null,
  };
}
