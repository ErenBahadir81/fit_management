import { clamp, round } from "./utils";

export type Gender = "male" | "female";

export interface NavyInput {
  gender: Gender;
  heightCm: number;
  neckCm: number;
  waistCm: number;
  hipCm?: number; // kadınlar için zorunlu
}

/**
 * US Navy vücut yağ oranı (metrik). Sonuç yüzde olarak döner.
 * Geçersiz ölçümlerde null döner.
 */
export function navyBodyFat(i: NavyInput): number | null {
  const { gender, heightCm, neckCm, waistCm, hipCm } = i;
  if (!heightCm || !neckCm || !waistCm) return null;

  if (gender === "male") {
    const d = waistCm - neckCm;
    if (d <= 0 || heightCm <= 0) return null;
    const bf =
      495 /
        (1.0324 - 0.19077 * Math.log10(d) + 0.15456 * Math.log10(heightCm)) -
      450;
    return clamp(round(bf, 1), 2, 60);
  } else {
    if (!hipCm) return null;
    const d = waistCm + hipCm - neckCm;
    if (d <= 0 || heightCm <= 0) return null;
    const bf =
      495 /
        (1.29579 -
          0.35004 * Math.log10(d) +
          0.221 * Math.log10(heightCm)) -
      450;
    return clamp(round(bf, 1), 2, 60);
  }
}

export interface BodyComposition {
  fatMassKg: number;
  leanMassKg: number;
}

export function bodyComposition(weightKg: number, bodyFatPct: number): BodyComposition {
  const fat = (weightKg * bodyFatPct) / 100;
  return {
    fatMassKg: round(fat, 1),
    leanMassKg: round(weightKg - fat, 1),
  };
}

/** Sağlık aralığı etiketleri (yaklaşık, görsel amaçlı) */
export function bodyFatCategory(gender: Gender, bf: number): string {
  const ranges =
    gender === "male"
      ? [
          [6, "Yarışma"],
          [14, "Atletik"],
          [18, "Fit"],
          [25, "Ortalama"],
          [100, "Yüksek"],
        ]
      : [
          [14, "Yarışma"],
          [21, "Atletik"],
          [25, "Fit"],
          [32, "Ortalama"],
          [100, "Yüksek"],
        ];
  for (const [max, label] of ranges) {
    if (bf <= (max as number)) return label as string;
  }
  return "—";
}
