import { clamp, round } from "../utils/index";
import type { Gender } from "../schemas/common";

export type { Gender };

export interface NavyInput {
  gender: Gender;
  heightCm: number;
  neckCm: number;
  waistCm: number;
  hipCm?: number | null; // required for women
}

/**
 * US Navy body-fat % (metric). Returns null for invalid measurements.
 *  male:   495 / (1.0324 − 0.19077·log10(waist − neck) + 0.15456·log10(height)) − 450
 *  female: 495 / (1.29579 − 0.35004·log10(waist + hip − neck) + 0.22100·log10(height)) − 450
 */
export function navyBodyFat(i: NavyInput): number | null {
  const { gender, heightCm, neckCm, waistCm, hipCm } = i;
  if (!heightCm || !neckCm || !waistCm || heightCm <= 0) return null;
  if (gender === "male") {
    const d = waistCm - neckCm;
    if (d <= 0) return null;
    const bf = 495 / (1.0324 - 0.19077 * Math.log10(d) + 0.15456 * Math.log10(heightCm)) - 450;
    return Number.isFinite(bf) ? clamp(round(bf, 1), 2, 60) : null;
  }
  if (!hipCm) return null;
  const d = waistCm + hipCm - neckCm;
  if (d <= 0) return null;
  const bf = 495 / (1.29579 - 0.35004 * Math.log10(d) + 0.221 * Math.log10(heightCm)) - 450;
  return Number.isFinite(bf) ? clamp(round(bf, 1), 2, 60) : null;
}

export interface BodyComposition {
  fatMassKg: number;
  leanMassKg: number;
}

export function bodyComposition(weightKg: number, bodyFatPct: number): BodyComposition {
  const fat = (weightKg * bodyFatPct) / 100;
  return { fatMassKg: round(fat, 1), leanMassKg: round(weightKg - fat, 1) };
}

export type BodyFatCategory = "essential" | "athletic" | "fit" | "average" | "high";

export const BODY_FAT_CATEGORY_TR: Record<BodyFatCategory, string> = {
  essential: "Yarışma",
  athletic: "Atletik",
  fit: "Fit",
  average: "Ortalama",
  high: "Yüksek",
};

/** ACE-style bands. */
export function bodyFatCategory(gender: Gender, bf: number): BodyFatCategory {
  const bands: Array<[number, BodyFatCategory]> =
    gender === "male"
      ? [
          [6, "essential"],
          [14, "athletic"],
          [18, "fit"],
          [25, "average"],
          [100, "high"],
        ]
      : [
          [14, "essential"],
          [21, "athletic"],
          [25, "fit"],
          [32, "average"],
          [100, "high"],
        ];
  for (const [max, label] of bands) if (bf <= max) return label;
  return "high";
}

/** Essential-fat floor used to reject dangerous goal targets. */
export const MIN_SAFE_BODY_FAT: Record<Gender, number> = { male: 5, female: 12 };
