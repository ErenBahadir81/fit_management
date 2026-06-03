"use client";

import { useEffect, useState } from "react";
import { Sheet, Button, NumberStepper } from "@/components/ui";
import { Flame, Drumstick, Egg, Target } from "lucide-react";
import { apiSend } from "@/lib/fetcher";
import type { DietTargetDTO } from "@/lib/types";

interface Row {
  key: keyof DietTargetDTO;
  label: string;
  icon: typeof Flame;
  color: string;
  step: number;
  max: number;
  suffix: string;
}

const ROWS: Row[] = [
  {
    key: "calories",
    label: "Kalori",
    icon: Flame,
    color: "var(--primary)",
    step: 50,
    max: 6000,
    suffix: "kcal",
  },
  {
    key: "protein",
    label: "Protein",
    icon: Drumstick,
    color: "var(--ready)",
    step: 5,
    max: 600,
    suffix: "g",
  },
  {
    key: "carbs",
    label: "Karbonhidrat",
    icon: Egg,
    color: "var(--recovering)",
    step: 5,
    max: 800,
    suffix: "g",
  },
  {
    key: "fat",
    label: "Yağ",
    icon: Target,
    color: "var(--primary)",
    step: 5,
    max: 400,
    suffix: "g",
  },
];

export function TargetSheet({
  open,
  onClose,
  target,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  target: DietTargetDTO;
  onSaved: () => void | Promise<void>;
}) {
  const [values, setValues] = useState<DietTargetDTO>(target);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sheet açıldığında mevcut hedeflerle doldur.
  useEffect(() => {
    if (open) {
      setValues(target);
      setError(null);
      setSaving(false);
    }
  }, [open, target]);

  function set(key: keyof DietTargetDTO, v: number) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiSend("/api/diet/target", "PUT", values);
      await onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Kaydedilemedi");
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Günlük Hedefler"
      subtitle="Kalori ve makro hedeflerini belirle"
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={saving}
          onClick={save}
        >
          Kaydet
        </Button>
      }
    >
      <div className="py-1">
        <div className="rounded-2xl border border-border divide-y divide-border">
          {ROWS.map((row) => {
            const Icon = row.icon;
            return (
              <div
                key={row.key}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div
                  className="h-9 w-9 grid place-items-center rounded-xl shrink-0"
                  style={{
                    background: `color-mix(in srgb, ${row.color} 14%, transparent)`,
                    color: row.color,
                  }}
                >
                  <Icon size={18} />
                </div>
                <span className="text-sm font-semibold text-ink flex-1">
                  {row.label}
                </span>
                <NumberStepper
                  value={values[row.key]}
                  onChange={(v) => set(row.key, v)}
                  min={0}
                  max={row.max}
                  step={row.step}
                  suffix={row.suffix}
                />
              </div>
            );
          })}
        </div>

        {error && (
          <p className="text-xs text-fatigued font-medium px-1 mt-3">{error}</p>
        )}
      </div>
    </Sheet>
  );
}
