/**
 * T7 — Fat-free mass index (Kouri, Pope, Katz & Oliva 1995, Clin J Sport Med 5:223–228).
 *
 *   FFMI      = lean kg / height m²
 *   FFMI_norm = FFMI + 6.1 × (1.8 − height m)      ← the value people quote and the one we show
 *
 * Bands are literature averages (docs/research/muscle-gain-science.md). The women's scale sits
 * ≈ 3.5 points below the men's (population means ≈ 15 vs 18.5–19; practical ceiling ≈ 21.5 vs 25).
 */
import type { Gender } from "../schemas/common";
import type { FfmiBand } from "../schemas/assessment";
import { clamp, round } from "../utils/index";

/** Height-normalisation constant from Kouri 1995 (derived on men; commonly used for both sexes). */
export const FFMI_HEIGHT_SLOPE = 6.1;
export const FFMI_REFERENCE_HEIGHT_M = 1.8;

/** Raw FFMI. Returns 0 for a non-positive height rather than Infinity. */
export function ffmiRaw(leanMassKg: number, heightCm: number): number {
  const h = heightCm / 100;
  if (!(h > 0) || !(leanMassKg > 0)) return 0;
  return leanMassKg / (h * h);
}

/** Height-normalised FFMI. */
export function ffmi(leanMassKg: number, heightCm: number): number {
  const raw = ffmiRaw(leanMassKg, heightCm);
  if (raw === 0) return 0;
  return raw + FFMI_HEIGHT_SLOPE * (FFMI_REFERENCE_HEIGHT_M - heightCm / 100);
}

/** Lean mass (kg) at which the normalised FFMI equals `target` for this height. */
export function leanMassForFfmi(targetFfmi: number, heightCm: number): number {
  const h = heightCm / 100;
  if (!(h > 0)) return 0;
  return Math.max(0, (targetFfmi - FFMI_HEIGHT_SLOPE * (FFMI_REFERENCE_HEIGHT_M - h)) * h * h);
}

/**
 * Upper edges of the bands (value < edge → that band), per sex. The last band is open-ended.
 * Men: <18 low · 18–20 average · 20–22 good · 22–25 advanced · ≥25 near the natural limit.
 * Women: <14.5 low · 14.5–16.5 average · 16.5–18.5 good · 18.5–21.5 advanced · ≥21.5 near limit.
 */
export const FFMI_BAND_EDGES: Record<Gender, [number, number, number, number]> = {
  male: [18, 20, 22, 25],
  female: [14.5, 16.5, 18.5, 21.5],
};

const BANDS: FfmiBand[] = ["low", "average", "good", "advanced", "nearLimit"];

export const FFMI_BAND_TR: Record<FfmiBand, string> = {
  low: "Düşük kas kütlesi",
  average: "Ortalama",
  good: "İyi",
  advanced: "İleri seviye",
  nearLimit: "Doğal sınıra yakın",
};

export function ffmiBand(sex: Gender, value: number): FfmiBand {
  const edges = FFMI_BAND_EDGES[sex];
  for (let i = 0; i < edges.length; i++) if (value < edges[i]) return BANDS[i];
  return "nearLimit";
}

/**
 * 0–100 gauge position: the "low" edge minus 3 points maps to 0, the natural ceiling to 100.
 * Lets a progress ring show "how much of your muscular potential is built".
 */
export function ffmiGauge(sex: Gender, value: number, ceiling: number): number {
  const floor = FFMI_BAND_EDGES[sex][0] - 3;
  if (ceiling <= floor) return 0;
  return round(clamp(((value - floor) / (ceiling - floor)) * 100, 0, 100), 0);
}
