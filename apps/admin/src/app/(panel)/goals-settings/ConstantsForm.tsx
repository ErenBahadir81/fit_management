"use client";

import type { GoalSettings } from "@fitfloow/core";
import { NumberInput } from "@/components/ui/Field";

interface FieldSpec {
  label: string;
  hint?: string;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  digits?: number;
  get: (g: GoalSettings) => number;
  set: (g: GoalSettings, v: number) => GoalSettings;
}

interface Section {
  title: string;
  description: string;
  fields: FieldSpec[];
}

/** Declarative so every constant gets the same label / hint / unit treatment. */
export const SECTIONS: Section[] = [
  {
    title: "Enerji sabitleri",
    description: "Yağdan enerji dönüşümü ve güvenlik tavanları. Kaynaklar docs/research/fat-loss-science.md.",
    fields: [
      {
        label: "kcal / kg yağ",
        hint: "Wishnofsky 7700; brief 7000 kullanıyordu.",
        unit: "kcal",
        min: 6000,
        max: 9500,
        step: 100,
        get: (g) => g.kcalPerKgFat,
        set: (g, v) => ({ ...g, kcalPerKgFat: v }),
      },
      {
        label: "Alpert katsayısı",
        hint: "Yağ dokusundan günlük maksimum enerji (kcal/kg yağ/gün).",
        unit: "kcal",
        min: 30,
        max: 120,
        step: 0.1,
        digits: 1,
        get: (g) => g.alpertKcalPerKgFatPerDay,
        set: (g, v) => ({ ...g, alpertKcalPerKgFatPerDay: v }),
      },
      {
        label: "Alpert güvenlik payı",
        hint: "0,75 = tavanın %75'i kullanılır.",
        min: 0.3,
        max: 1,
        step: 0.05,
        digits: 2,
        get: (g) => g.alpertSafetyFactor,
        set: (g, v) => ({ ...g, alpertSafetyFactor: v }),
      },
      {
        label: "Maksimum göreli açık",
        hint: "TDEE'nin en fazla bu oranı kadar açık.",
        min: 0.1,
        max: 0.5,
        step: 0.05,
        digits: 2,
        get: (g) => g.maxRelativeDeficitPct,
        set: (g, v) => ({ ...g, maxRelativeDeficitPct: v }),
      },
    ],
  },
  {
    title: "Kalori tabanı",
    description: "Etkin taban = max(cinsiyet tabanı, BMR × çarpan, TDEE × çarpan).",
    fields: [
      { label: "Erkek tabanı", unit: "kcal", min: 800, step: 50, get: (g) => g.calorieFloor.male, set: (g, v) => ({ ...g, calorieFloor: { ...g.calorieFloor, male: v } }) },
      { label: "Kadın tabanı", unit: "kcal", min: 800, step: 50, get: (g) => g.calorieFloor.female, set: (g, v) => ({ ...g, calorieFloor: { ...g.calorieFloor, female: v } }) },
      { label: "BMR çarpanı", min: 0.5, max: 1.5, step: 0.05, digits: 2, get: (g) => g.minBmrFactor, set: (g, v) => ({ ...g, minBmrFactor: v }) },
      { label: "TDEE çarpanı", min: 0.4, max: 1, step: 0.05, digits: 2, get: (g) => g.minTdeeFactor, set: (g, v) => ({ ...g, minTdeeFactor: v }) },
    ],
  },
  {
    title: "Kompozisyon",
    description: "Kaybın ne kadarının yağ olduğu ve yağsız kütle koruma varsayımları.",
    fields: [
      { label: "Yağ oranı — yüksek yağ", hint: "BF yüksek bantta kaybın yağ payı.", min: 0.5, max: 1, step: 0.05, digits: 2, get: (g) => g.fatFractionOfLoss.high, set: (g, v) => ({ ...g, fatFractionOfLoss: { ...g.fatFractionOfLoss, high: v } }) },
      { label: "Yağ oranı — orta", min: 0.5, max: 1, step: 0.05, digits: 2, get: (g) => g.fatFractionOfLoss.mid, set: (g, v) => ({ ...g, fatFractionOfLoss: { ...g.fatFractionOfLoss, mid: v } }) },
      { label: "Yağ oranı — yağsız", min: 0.5, max: 1, step: 0.05, digits: 2, get: (g) => g.fatFractionOfLoss.low, set: (g, v) => ({ ...g, fatFractionOfLoss: { ...g.fatFractionOfLoss, low: v } }) },
      { label: "Katch-McArdle ağırlığı", hint: "Yaş biliniyorsa BMR karışımındaki payı.", min: 0, max: 1, step: 0.05, digits: 2, get: (g) => g.bmrBlendKatchWeight, set: (g, v) => ({ ...g, bmrBlendKatchWeight: v }) },
    ],
  },
  {
    title: "Makrolar",
    description: "Protein yağsız kütleye göre, yağ kalorinin yüzdesi olarak; karbonhidrat kalanı alır.",
    fields: [
      { label: "Protein — yağsız bant", unit: "g/kg", min: 1, max: 4, step: 0.1, digits: 1, get: (g) => g.protein.leanGPerKgLean, set: (g, v) => ({ ...g, protein: { ...g.protein, leanGPerKgLean: v } }) },
      { label: "Protein — orta bant", unit: "g/kg", min: 1, max: 4, step: 0.1, digits: 1, get: (g) => g.protein.midGPerKgLean, set: (g, v) => ({ ...g, protein: { ...g.protein, midGPerKgLean: v } }) },
      { label: "Protein — yüksek bant", unit: "g/kg", min: 1, max: 4, step: 0.1, digits: 1, get: (g) => g.protein.highGPerKgLean, set: (g, v) => ({ ...g, protein: { ...g.protein, highGPerKgLean: v } }) },
      { label: "Protein tabanı", hint: "Vücut ağırlığı başına alt sınır.", unit: "g/kg", min: 0.8, max: 3, step: 0.1, digits: 1, get: (g) => g.protein.floorGPerKgBodyweight, set: (g, v) => ({ ...g, protein: { ...g.protein, floorGPerKgBodyweight: v } }) },
      { label: "Yağ payı", hint: "Günlük kalorinin yüzdesi.", min: 0.15, max: 0.4, step: 0.01, digits: 2, get: (g) => g.fatPctOfCalories, set: (g, v) => ({ ...g, fatPctOfCalories: v }) },
    ],
  },
  {
    title: "Yağsızlık bantları",
    description: "Protein ve yağ payı hesaplarında kullanılan yağ oranı eşikleri.",
    fields: [
      { label: "Erkek alt eşik", unit: "%", min: 0, max: 60, step: 1, get: (g) => g.leannessBands.male.lo, set: (g, v) => ({ ...g, leannessBands: { ...g.leannessBands, male: { ...g.leannessBands.male, lo: v } } }) },
      { label: "Erkek üst eşik", unit: "%", min: 0, max: 60, step: 1, get: (g) => g.leannessBands.male.hi, set: (g, v) => ({ ...g, leannessBands: { ...g.leannessBands, male: { ...g.leannessBands.male, hi: v } } }) },
      { label: "Kadın alt eşik", unit: "%", min: 0, max: 60, step: 1, get: (g) => g.leannessBands.female.lo, set: (g, v) => ({ ...g, leannessBands: { ...g.leannessBands, female: { ...g.leannessBands.female, lo: v } } }) },
      { label: "Kadın üst eşik", unit: "%", min: 0, max: 60, step: 1, get: (g) => g.leannessBands.female.hi, set: (g, v) => ({ ...g, leannessBands: { ...g.leannessBands, female: { ...g.leannessBands.female, hi: v } } }) },
    ],
  },
  {
    title: "Aktivite çarpanları",
    description: "TDEE = BMR × çarpan.",
    fields: [
      { label: "Hareketsiz", min: 1, max: 2.5, step: 0.025, digits: 3, get: (g) => g.activityMultipliers.sedentary ?? 1.2, set: (g, v) => ({ ...g, activityMultipliers: { ...g.activityMultipliers, sedentary: v } }) },
      { label: "Az hareketli", min: 1, max: 2.5, step: 0.025, digits: 3, get: (g) => g.activityMultipliers.light ?? 1.375, set: (g, v) => ({ ...g, activityMultipliers: { ...g.activityMultipliers, light: v } }) },
      { label: "Orta", min: 1, max: 2.5, step: 0.025, digits: 3, get: (g) => g.activityMultipliers.moderate ?? 1.55, set: (g, v) => ({ ...g, activityMultipliers: { ...g.activityMultipliers, moderate: v } }) },
      { label: "Aktif", min: 1, max: 2.5, step: 0.025, digits: 3, get: (g) => g.activityMultipliers.active ?? 1.725, set: (g, v) => ({ ...g, activityMultipliers: { ...g.activityMultipliers, active: v } }) },
      { label: "Çok aktif", min: 1, max: 2.5, step: 0.025, digits: 3, get: (g) => g.activityMultipliers.veryActive ?? 1.9, set: (g, v) => ({ ...g, activityMultipliers: { ...g.activityMultipliers, veryActive: v } }) },
    ],
  },
  {
    title: "Trend ve kalibrasyon",
    description: "EWMA yumuşatması ve ölçülen TDEE'ye göre yeniden kalibrasyon.",
    fields: [
      { label: "EWMA alfa", min: 0.02, max: 1, step: 0.01, digits: 2, get: (g) => g.ewma.alpha, set: (g, v) => ({ ...g, ewma: { ...g.ewma, alpha: v } }) },
      { label: "Seyrek alfa", hint: "Haftada 5'ten az tartımda.", min: 0.02, max: 1, step: 0.01, digits: 2, get: (g) => g.ewma.sparseAlpha, set: (g, v) => ({ ...g, ewma: { ...g.ewma, sparseAlpha: v } }) },
      { label: "Aykırı tartım eşiği", unit: "kg", min: 0.5, max: 10, step: 0.5, digits: 1, get: (g) => g.ewma.outlierRejectKg, set: (g, v) => ({ ...g, ewma: { ...g.ewma, outlierRejectKg: v } }) },
      { label: "Kalibrasyon penceresi", unit: "gün", min: 7, max: 56, step: 1, get: (g) => g.recalibration.windowDays, set: (g, v) => ({ ...g, recalibration: { ...g.recalibration, windowDays: Math.round(v) } }) },
      { label: "Minimum gün", unit: "gün", min: 7, max: 56, step: 1, get: (g) => g.recalibration.minDays, set: (g, v) => ({ ...g, recalibration: { ...g.recalibration, minDays: Math.round(v) } }) },
      { label: "Oturma süresi", hint: "Hedef başladıktan sonra atlanan gün.", unit: "gün", min: 0, max: 21, step: 1, get: (g) => g.recalibration.settlingDays, set: (g, v) => ({ ...g, recalibration: { ...g.recalibration, settlingDays: Math.round(v) } }) },
      { label: "Sönümleme β", min: 0, max: 1, step: 0.05, digits: 2, get: (g) => g.recalibration.dampingBeta, set: (g, v) => ({ ...g, recalibration: { ...g.recalibration, dampingBeta: v } }) },
      { label: "Haftalık maks değişim", unit: "kcal", min: 0, max: 1000, step: 25, get: (g) => g.recalibration.maxWeeklyChangeKcal, set: (g, v) => ({ ...g, recalibration: { ...g.recalibration, maxWeeklyChangeKcal: v } }) },
    ],
  },
  {
    title: "Adaptasyon ve limitler",
    description: "Ölçülen TDEE yokken kullanılan a-priori metabolik adaptasyon.",
    fields: [
      { label: "kcal/gün / kayıp kg", min: 0, max: 60, step: 1, get: (g) => g.adaptation.kcalPerDayPerKgLost, set: (g, v) => ({ ...g, adaptation: { ...g.adaptation, kcalPerDayPerKgLost: v } }) },
      { label: "Haftalık adaptif %", min: 0, max: 0.02, step: 0.001, digits: 3, get: (g) => g.adaptation.adaptivePctPerWeek, set: (g, v) => ({ ...g, adaptation: { ...g.adaptation, adaptivePctPerWeek: v } }) },
      { label: "Adaptif tavan", min: 0, max: 0.3, step: 0.01, digits: 2, get: (g) => g.adaptation.adaptiveCapPct, set: (g, v) => ({ ...g, adaptation: { ...g.adaptation, adaptiveCapPct: v } }) },
      { label: "Maksimum plan süresi", unit: "hafta", min: 4, max: 208, step: 1, get: (g) => g.maxWeeks, set: (g, v) => ({ ...g, maxWeeks: Math.round(v) }) },
      { label: "Yağ ölçüm belirsizliği", hint: "Navy mezura SEE; UI'da ± olarak gösterilir.", unit: "%", min: 0, max: 10, step: 0.1, digits: 1, get: (g) => g.bodyFatUncertaintyPct, set: (g, v) => ({ ...g, bodyFatUncertaintyPct: v }) },
    ],
  },
];

export function ConstantsForm({ goal, onChange }: { goal: GoalSettings; onChange: (next: GoalSettings) => void }) {
  return (
    <div className="divide-y divide-line">
      {SECTIONS.map((section) => (
        <section key={section.title} className="px-5 py-5">
          <h3 className="text-[13px] font-semibold text-ink">{section.title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{section.description}</p>
          <div className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            {section.fields.map((field) => (
              <label key={field.label} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink">{field.label}</span>
                <NumberInput
                  aria-label={field.label}
                  unit={field.unit}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={String(field.get(goal))}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    if (!Number.isFinite(raw)) return;
                    onChange(field.set(goal, raw));
                  }}
                />
                {field.hint && <span className="text-[11px] leading-relaxed text-subtle">{field.hint}</span>}
              </label>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
