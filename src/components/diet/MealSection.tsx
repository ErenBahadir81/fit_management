"use client";

import { useState } from "react";
import { Card, Spinner } from "@/components/ui";
import { Plus, Trash2, Coffee, Sun, Moon, Egg } from "lucide-react";
import { fmtNum } from "@/lib/utils";
import type { DietItemDTO } from "@/lib/types";
import type { MealMeta } from "./meta";

const ICONS: Record<MealMeta["iconKey"], typeof Coffee> = {
  coffee: Coffee,
  sun: Sun,
  moon: Moon,
  egg: Egg,
};

/** Bir öğüne ait kalori alttoplamı. */
function mealCalories(items: DietItemDTO[]): number {
  return items.reduce((s, it) => s + it.calories, 0);
}

function ItemRow({
  item,
  onDelete,
}: {
  item: DietItemDTO;
  onDelete: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await onDelete();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink truncate">
          {item.name}
          {item.qty !== 1 && (
            <span className="text-muted font-medium ml-1">
              ×{fmtNum(item.qty, 1)}
            </span>
          )}
        </p>
        <p className="text-xs text-muted tabular-nums mt-0.5">
          P {fmtNum(item.protein, 0)}g · K {fmtNum(item.carbs, 0)}g · Y{" "}
          {fmtNum(item.fat, 0)}g
        </p>
      </div>
      <span className="text-sm font-bold text-ink tabular-nums shrink-0">
        {fmtNum(item.calories, 0)}
        <span className="text-[11px] text-muted font-medium ml-0.5">kcal</span>
      </span>
      <button
        onClick={remove}
        disabled={busy}
        aria-label={`${item.name} sil`}
        className="tap h-9 w-9 grid place-items-center rounded-full bg-surface-2 text-muted shrink-0 disabled:opacity-50"
      >
        {busy ? <Spinner className="h-4 w-4" /> : <Trash2 size={16} />}
      </button>
    </div>
  );
}

export function MealSection({
  meta,
  items,
  onAdd,
  onDelete,
}: {
  meta: MealMeta;
  /** Bu öğüne ait öğeler; her biri items[] içindeki gerçek (global) indexi taşır. */
  items: { item: DietItemDTO; index: number }[];
  onAdd: () => void;
  onDelete: (globalIndex: number) => void | Promise<void>;
}) {
  const Icon = ICONS[meta.iconKey];
  const subtotal = mealCalories(items.map((x) => x.item));

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-9 w-9 grid place-items-center rounded-xl bg-primary-soft text-primary shrink-0">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink leading-tight">
            {meta.label}
          </p>
          <p className="text-xs text-muted tabular-nums">
            {fmtNum(subtotal, 0)} kcal
          </p>
        </div>
        <button
          onClick={onAdd}
          className="tap h-9 px-3 inline-flex items-center gap-1 rounded-xl bg-surface-2 text-ink text-sm font-semibold shrink-0 active:opacity-80"
        >
          <Plus size={16} /> Ekle
        </button>
      </div>

      {items.length > 0 ? (
        <div className="border-t border-border divide-y divide-border">
          {items.map(({ item, index }) => (
            <ItemRow
              key={index}
              item={item}
              onDelete={() => onDelete(index)}
            />
          ))}
        </div>
      ) : (
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs text-muted/80">boş</p>
        </div>
      )}
    </Card>
  );
}
