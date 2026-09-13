/**
 * `GET /me/energy` in plain Turkish.
 *
 * The numbers are only half the answer; the other half is *why* they are those numbers. Everything
 * here is pure so the wording is tested rather than eyeballed.
 */
import { ACTIVITY_TR, type EnergyDTO } from "@fitfloow/core";
import { fmtInt, fmtKg, fmtNumber } from "../../lib/format";
import type { Tone } from "../../theme/tokens";

export interface EnergyExplanation {
  /** One or two words for the provenance chip. */
  source: string;
  /** The sentence under the numbers. */
  body: string;
  /** What the user could do to make this number better, if anything. */
  action: "goal" | "measure" | null;
}

export function explainEnergy(e: EnergyDTO): EnergyExplanation {
  const activity = `${ACTIVITY_TR[e.activityLevel].toLocaleLowerCase("tr-TR")} (×${fmtNumber(e.activityMultiplier, 2)})`;
  const lean = e.leanMassKg === null ? null : `yağsız kütlen ${fmtKg(e.leanMassKg)}`;

  if (e.derivedFrom === "goal") {
    const gap = Math.abs(Math.round(e.dailyDeficit));
    const direction = e.dailyDeficit > 0 ? `günde ${fmtInt(gap)} kcal açık` : e.dailyDeficit < 0 ? `günde ${fmtInt(gap)} kcal fazla` : "açıksız";
    return {
      source: "Hedefinden",
      body: `Aktif hedefin bu sayıyı belirliyor: harcadığın enerjiden ${direction}. Hesap ${lean ? `${lean} ve ` : ""}${activity} hareket düzeyi üzerinden yapılıyor.`,
      action: null,
    };
  }
  if (e.derivedFrom === "maintenance") {
    return {
      source: "Ölçümünden",
      body: `Son ölçümünden hesaplanıyor: ${lean ? `${lean}, ` : ""}${activity} hareket düzeyi. Bu, kilonu yerinde tutan seviye. Hedef koyarsan sayı hedefine göre yeniden hesaplanır.`,
      action: "goal",
    };
  }
  return {
    source: "Varsayılan",
    body: `Henüz vücut ölçümün yok, bu yüzden varsayılan değerlerle çalışıyorum. Bir ölçüm eklediğin an sayı sana göre yeniden hesaplanır.`,
    action: "measure",
  };
}

export interface EnergyRow {
  key: "bmr" | "maintenance" | "delta";
  label: string;
  hint: string;
  /** Always positive; `sign` carries the direction so a surplus never reads as a negative deficit. */
  value: number;
  /** Typographic minus (U+2212), plus, or nothing. */
  sign: "−" | "+" | "";
  tone: Tone;
}

/** The three numbers, top to bottom: what you burn asleep, awake, and what the plan changes. */
export function energyRows(e: EnergyDTO): EnergyRow[] {
  const deficit = Math.round(e.dailyDeficit);
  const delta: EnergyRow =
    deficit > 0
      ? { key: "delta", label: "Günlük açık", hint: "hedefe giden fark", value: deficit, sign: "−", tone: "success" }
      : deficit < 0
        ? { key: "delta", label: "Günlük fazla", hint: "kas için eklenen", value: -deficit, sign: "+", tone: "primary" }
        : { key: "delta", label: "Koruma", hint: "açık yok", value: 0, sign: "", tone: "neutral" };
  return [
    { key: "bmr", label: "Bazal metabolizma", hint: "hiç kıpırdamasan bile", value: Math.round(e.bmr), sign: "", tone: "neutral" },
    { key: "maintenance", label: "Harcadığın enerji", hint: "hareketinle birlikte", value: Math.round(e.maintenanceCalories), sign: "", tone: "neutral" },
    delta,
  ];
}
