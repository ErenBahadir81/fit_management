"use client";

import { useEffect, useState } from "react";
import { Sheet, Button, Input, NumberStepper, Segmented } from "@/components/ui";
import type { SegmentedOption } from "@/components/ui";
import { Flame, Coffee, Sun, Moon, Egg } from "lucide-react";
import { apiSend } from "@/lib/fetcher";
import { fmtNum } from "@/lib/utils";
import type { DietItemDTO } from "@/lib/types";
import { MEALS, type Meal } from "./meta";

const MEAL_OPTIONS: SegmentedOption<Meal>[] = MEALS.map((m) => {
  const Icon =
    m.iconKey === "coffee"
      ? Coffee
      : m.iconKey === "sun"
      ? Sun
      : m.iconKey === "moon"
      ? Moon
      : Egg;
  return { value: m.key, label: m.label, icon: <Icon size={15} /> };
});

function Field({
  label,
  value,
  onChange,
  step,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  max: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-ink">{label}</span>
      <NumberStepper
        value={value}
        onChange={onChange}
        min={0}
        max={max}
        step={step}
        suffix={suffix}
      />
    </div>
  );
}

export function AddItemSheet({
  open,
  onClose,
  meal,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Açılışta seçili öğün. */
  meal: Meal;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [calories, setCalories] = useState(0);
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);
  const [activeMeal, setActiveMeal] = useState<Meal>(meal);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sheet her açıldığında alanları sıfırla, gelen öğünü seç.
  useEffect(() => {
    if (open) {
      setName("");
      setQty(1);
      setCalories(0);
      setProtein(0);
      setCarbs(0);
      setFat(0);
      setActiveMeal(meal);
      setError(null);
      setSaving(false);
    }
  }, [open, meal]);

  const canSave = name.trim().length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const item: DietItemDTO = {
      name: name.trim(),
      qty: qty || 1,
      calories,
      protein,
      carbs,
      fat,
      meal: activeMeal,
    };
    try {
      await apiSend("/api/diet", "POST", { item });
      await onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Eklenemedi");
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Besin Ekle"
      subtitle="Öğüne yiyecek ekle"
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={saving}
          disabled={!canSave}
          onClick={save}
        >
          Ekle
        </Button>
      }
    >
      <div className="space-y-4 py-1">
        <Input
          label="Besin adı"
          placeholder="Yulaf ezmesi"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />

        <Segmented
          value={activeMeal}
          onChange={setActiveMeal}
          options={MEAL_OPTIONS}
          size="sm"
        />

        <div className="rounded-2xl border border-border divide-y divide-border">
          <div className="px-4 py-3">
            <Field
              label="Adet / porsiyon"
              value={qty}
              onChange={setQty}
              step={0.5}
              max={99}
            />
          </div>
          <div className="px-4 py-3">
            <Field
              label="Kalori"
              value={calories}
              onChange={setCalories}
              step={10}
              max={5000}
              suffix="kcal"
            />
          </div>
          <div className="px-4 py-3">
            <Field
              label="Protein"
              value={protein}
              onChange={setProtein}
              step={1}
              max={500}
              suffix="g"
            />
          </div>
          <div className="px-4 py-3">
            <Field
              label="Karbonhidrat"
              value={carbs}
              onChange={setCarbs}
              step={1}
              max={500}
              suffix="g"
            />
          </div>
          <div className="px-4 py-3">
            <Field
              label="Yağ"
              value={fat}
              onChange={setFat}
              step={1}
              max={500}
              suffix="g"
            />
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 rounded-2xl bg-primary-soft/60 border border-primary/15 px-4 py-3 text-primary">
          <Flame size={16} />
          <span className="text-sm font-bold tabular-nums">
            {fmtNum(calories, 0)} kcal
          </span>
          <span className="text-xs text-muted">
            · P {fmtNum(protein, 0)} · K {fmtNum(carbs, 0)} · Y {fmtNum(fat, 0)} g
          </span>
        </div>

        {error && (
          <p className="text-xs text-fatigued font-medium px-1">{error}</p>
        )}
      </div>
    </Sheet>
  );
}
