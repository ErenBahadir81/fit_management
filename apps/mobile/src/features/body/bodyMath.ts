/**
 * Pure helpers for the Body tab: live US-Navy preview, measurement validation copy, chart
 * point mapping and the optimistic cache patches for a quick weigh-in. No I/O, fully tested.
 */
import { BODY_FAT_CATEGORY_TR, bodyComposition, bodyFatCategory, navyBodyFat, round, type BodyFatCategory, type BodySummary, type BodyTrends, type Gender, type WeighInDTO } from "@fitfloow/core";
import type { TrendPoint } from "../../charts/chartMath";

/** ±% shown next to the Navy estimate (03-goal-engine.md `bodyFatUncertaintyPct`). */
export const BF_UNCERTAINTY = 3.5;
/** Client-side EWMA alpha for the optimistic point (server recomputes on refetch). */
const EWMA_ALPHA = 0.1;

export interface MeasureDraft {
  gender: Gender;
  heightCm: number;
  neckCm: number;
  waistCm: number;
  hipCm: number | null;
  weightKg: number;
}

export interface NavyPreview {
  bodyFatPct: number | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  category: BodyFatCategory | null;
  categoryLabel: string | null;
  error: string | null;
}

/** Human copy for an invalid draft (schema bounds from `zBodyEntryInput`), null when valid. */
export function measurementError(d: MeasureDraft): string | null {
  if (!(d.heightCm >= 100 && d.heightCm <= 250)) return "Boy 100–250 cm arasında olmalı";
  if (!(d.weightKg >= 25 && d.weightKg <= 400)) return "Kilo 25–400 kg arasında olmalı";
  if (!(d.neckCm >= 20 && d.neckCm <= 80)) return "Boyun 20–80 cm arasında olmalı";
  if (d.waistCm <= d.neckCm) return "Bel çevresi boyundan büyük olmalı";
  if (!(d.waistCm >= 40 && d.waistCm <= 250)) return "Bel 40–250 cm arasında olmalı";
  if (d.gender === "female") {
    if (d.hipCm == null) return "Kalça ölçüsü gerekli";
    if (!(d.hipCm >= 50 && d.hipCm <= 250)) return "Kalça 50–250 cm arasında olmalı";
  }
  return null;
}

/** Live preview for the measurement sheet: bf %, fat / lean kg and the category, or an error. */
export function navyPreview(d: MeasureDraft): NavyPreview {
  const error = measurementError(d);
  const empty: NavyPreview = { bodyFatPct: null, fatMassKg: null, leanMassKg: null, category: null, categoryLabel: null, error };
  if (error) return empty;
  const bf = navyBodyFat({ gender: d.gender, heightCm: d.heightCm, neckCm: d.neckCm, waistCm: d.waistCm, hipCm: d.hipCm });
  if (bf === null) return { ...empty, error: "Bu ölçülerle hesaplanamıyor" };
  const comp = bodyComposition(d.weightKg, bf);
  const category = bodyFatCategory(d.gender, bf);
  return { bodyFatPct: bf, fatMassKg: comp.fatMassKg, leanMassKg: comp.leanMassKg, category, categoryLabel: BODY_FAT_CATEGORY_TR[category], error: null };
}

export const RANGES = [
  { days: 30, label: "30 g" },
  { days: 90, label: "90 g" },
  { days: 180, label: "180 g" },
  { days: 365, label: "1 yıl" },
] as const;
export type RangeDays = (typeof RANGES)[number]["days"];

/** `/body/trends` points → chart rows (raw scale weight + EWMA trend). */
export function trendPoints(trends: BodyTrends): TrendPoint[] {
  return trends.points.map((p) => ({ dateKey: p.dateKey, raw: p.weightKg, ewma: p.weightEwma }));
}

function ewmaAtOrBefore(points: BodyTrends["points"], dateKey: string): number | null {
  let v: number | null = null;
  for (const p of points) {
    if (p.dateKey > dateKey) break;
    if (p.weightEwma !== null) v = p.weightEwma;
  }
  return v;
}

/** Add / replace the weigh-in for `dateKey` and continue the trend line — the chart moves before the server answers. */
export function optimisticTrends(trends: BodyTrends, dateKey: string, weightKg: number): BodyTrends {
  const others = trends.points.filter((p) => p.dateKey !== dateKey);
  const existing = trends.points.find((p) => p.dateKey === dateKey);
  const prevEwma = ewmaAtOrBefore(others, dateKey);
  const weightEwma = prevEwma === null ? weightKg : round(prevEwma + EWMA_ALPHA * (weightKg - prevEwma), 2);
  const point: BodyTrends["points"][number] = {
    dateKey,
    weightKg,
    weightEwma,
    bodyFatPct: existing?.bodyFatPct ?? null,
    leanMassKg: existing?.leanMassKg ?? null,
    waistCm: existing?.waistCm ?? null,
  };
  const points = [...others, point].sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
  const last = [...points].reverse().find((p) => p.weightEwma !== null)?.weightEwma ?? null;
  const deltaFrom = (back: number) => {
    const key = shiftKeyLocal(dateKey, -back);
    const at = ewmaAtOrBefore(points.filter((p) => p.dateKey < dateKey), key);
    return last !== null && at !== null ? round(last - at, 2) : trends.summary.weightDelta7d;
  };
  return {
    points,
    summary: { ...trends.summary, ewmaLatest: last, weightDelta7d: deltaFrom(7), weightDelta30d: deltaFrom(30) },
  };
}

/** Optimistic summary for the hero: latest weigh-in + moved trend weight. */
export function optimisticSummary(summary: BodySummary, weighIn: WeighInDTO): BodySummary {
  const prev = summary.ewmaWeightKg;
  const ewmaWeightKg = prev === null ? weighIn.weightKg : round(prev + EWMA_ALPHA * (weighIn.weightKg - prev), 2);
  return { ...summary, latestWeighIn: weighIn, ewmaWeightKg };
}

/** Prefill for the quick weigh-in stepper: last weigh-in → trend weight → latest entry → 75. */
export function weighInDefault(summary: BodySummary | undefined): number {
  const v = summary?.latestWeighIn?.weightKg ?? summary?.ewmaWeightKg ?? summary?.latest?.weightKg ?? 75;
  return round(v, 1);
}

// Local, dependency-free date shift (keys are always YYYY-MM-DD; UTC noon avoids DST edges).
function shiftKeyLocal(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d, 12) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
