"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { ACTIVITY_TR, GOAL_PROFILE_TR, type ActivityLevel, type Gender, type GoalProfile, type GoalSettings } from "@fitfloow/core";
import { GOAL_WARNING_TR, RATE_LIMITER_TR, computeGoalPlan, rateForState } from "@/lib/goal-sim";
import { date, int, kcal, kg, num } from "@/lib/format";
import { trDateKey } from "@fitfloow/core";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { NumberInput, Segmented, Select } from "@/components/ui/Field";
import { DataRow } from "@/components/ui/Stat";
import { Callout } from "@/components/ui/States";
import { RoadmapChart } from "@/components/charts/RoadmapChart";

/**
 * Live plan preview. Core's `computeGoalPlan` is not exported yet, so this runs the local
 * implementation of docs/plan/03 — see src/lib/goal-sim.ts.
 */
export function GoalSimulator({ settings }: { settings: GoalSettings }) {
  const [sex, setSex] = useState<Gender>("male");
  const [weight, setWeight] = useState("103");
  const [bodyFat, setBodyFat] = useState("10");
  const [target, setTarget] = useState("7");
  const [height, setHeight] = useState("183");
  const [age, setAge] = useState("30");
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [profile, setProfile] = useState<GoalProfile>("optimal");

  const startKey = useMemo(() => trDateKey(), []);

  const plan = useMemo(
    () =>
      computeGoalPlan({
        sex,
        weightKg: Number(weight) || 0,
        bodyFatPct: Number(bodyFat) || 0,
        heightCm: Number(height) || 175,
        age: age ? Number(age) : null,
        activityLevel: activity,
        targetBodyFatPct: Number(target) || 0,
        profile,
        startKey,
        settings,
      }),
    [sex, weight, bodyFat, height, age, activity, target, profile, startKey, settings]
  );

  const rate = useMemo(
    () =>
      rateForState({
        sex,
        weightKg: Number(weight) || 0,
        fatMassKg: ((Number(weight) || 0) * (Number(bodyFat) || 0)) / 100,
        bodyFatPct: Number(bodyFat) || 0,
        tdee: plan.tdee,
        profile,
        settings,
      }),
    [sex, weight, bodyFat, plan.tdee, profile, settings]
  );

  return (
    <Card>
      <CardHeader
        eyebrow="Canlı simülatör"
        title="Plan önizleme"
        description="Sabitleri ve oran tablosunu değiştirdikçe bu plan anında yeniden hesaplanır."
        actions={<Sparkles className="size-4 text-brand" aria-hidden />}
      />

      <div className="grid gap-5 p-5 lg:grid-cols-[16rem_1fr]">
        <div className="flex flex-col gap-3">
          <Segmented
            label="Cinsiyet"
            value={sex}
            onChange={setSex}
            options={[
              { value: "male", label: "Erkek" },
              { value: "female", label: "Kadın" },
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Kilo
              <NumberInput aria-label="Kilo" unit="kg" step={0.5} value={weight} onChange={(e) => setWeight(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Yağ oranı
              <NumberInput aria-label="Yağ oranı" unit="%" step={0.5} value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Hedef yağ
              <NumberInput aria-label="Hedef yağ oranı" unit="%" step={0.5} value={target} onChange={(e) => setTarget(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Boy
              <NumberInput aria-label="Boy" unit="cm" value={height} onChange={(e) => setHeight(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Yaş
              <NumberInput aria-label="Yaş" value={age} onChange={(e) => setAge(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Aktivite
              <Select aria-label="Aktivite seviyesi" value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)}>
                {Object.entries(ACTIVITY_TR).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <Segmented
            size="sm"
            label="Profil"
            value={profile}
            onChange={setProfile}
            options={(Object.keys(GOAL_PROFILE_TR) as GoalProfile[]).map((p) => ({ value: p, label: GOAL_PROFILE_TR[p] }))}
          />

          <dl className="mt-1">
            <DataRow label="Kaybedilecek yağ" value={kg(plan.fatToLoseKg, 2)} />
            <DataRow label="Hedef kilo" value={kg(plan.targetWeightKg)} />
            <DataRow label="BMR" value={kcal(plan.bmr)} />
            <DataRow label="TDEE" value={kcal(plan.tdee)} />
            <DataRow label="İlk hafta hızı" value={`${num(plan.initialRateKgPerWeek, 2)} kg/hf`} />
            <DataRow label="Sınırlayan" value={<Badge tone={rate.limitedBy === "table" ? "neutral" : "warn"}>{RATE_LIMITER_TR[rate.limitedBy]}</Badge>} />
          </dl>
        </div>

        <div className="min-w-0">
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Süre" value={plan.estimatedWeeks > 0 ? `${int(plan.estimatedWeeks)} hf` : "—"} hint={plan.estimatedWeeks > 0 ? date(plan.targetDate) : "hedef ulaşılmış"} />
            <Metric label="Günlük kalori" value={int(plan.initialDailyCalorieTarget)} hint="ilk hafta" accent />
            <Metric label="Protein" value={`${int(plan.macros.protein)} g`} hint={`${int(plan.macros.carbs)} k · ${int(plan.macros.fat)} y`} />
            <Metric label="Toplam açık" value={`${int(Math.round(plan.totalDeficitKcal / 1000))}k`} hint="kcal" />
          </div>

          {plan.warnings.length > 0 && (
            <div className="mb-4 flex flex-col gap-2">
              {plan.warnings.map((w) => (
                <Callout key={w} tone={w === "TARGET_TOO_LOW" ? "danger" : "warn"}>
                  {GOAL_WARNING_TR[w]}
                </Callout>
              ))}
            </div>
          )}

          {plan.roadmap.length > 0 ? (
            <RoadmapChart roadmap={plan.roadmap} targetWeightKg={plan.targetWeightKg} height={220} />
          ) : (
            <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-[13px] text-muted">
              Bu hedefle kaybedilecek yağ yok — hedef yağ oranını düşür.
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
            <CapRow label="Oran tablosu" value={rate.caps.table} active={rate.limitedBy === "table"} />
            <CapRow label="Bant tavanı" value={rate.caps.absolute} active={rate.limitedBy === "absolute"} />
            <CapRow label="Alpert" value={rate.caps.alpert} active={rate.limitedBy === "alpert"} />
            <CapRow label="Göreli açık" value={rate.caps.relative} active={rate.limitedBy === "relative"} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <p className="ff-eyebrow truncate">{label}</p>
      <p className={`mt-1 text-[1.15rem] font-semibold leading-none tracking-[-0.02em] tnum ${accent ? "text-brand-text" : "text-ink"}`}>{value}</p>
      {hint && <p className="mt-1 truncate text-[11px] text-subtle">{hint}</p>}
    </div>
  );
}

function CapRow({ label, value, active }: { label: string; value: number; active: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 border-t py-2 ${active ? "border-brand" : "border-line"}`}>
      <span className={`text-xs ${active ? "font-medium text-brand-text" : "text-subtle"}`}>{label}</span>
      <span className={`text-xs tnum ${active ? "font-medium text-brand-text" : "text-muted"}`}>
        {Number.isFinite(value) ? `${num(value, 2)} kg` : "—"}
      </span>
    </div>
  );
}
