"use client";

import { Card, CardBody, Ring, Bar, Button } from "@/components/ui";
import { clamp, fmtNum } from "@/lib/utils";
import type { DietTargetDTO } from "@/lib/types";
import { MACROS, type Totals } from "./meta";
import { Target } from "lucide-react";

export function DaySummary({
  totals,
  target,
  onEditTarget,
}: {
  totals: Totals;
  target: DietTargetDTO;
  onEditTarget: () => void;
}) {
  const calTarget = target.calories || 0;
  const consumed = totals.calories;
  const pct = calTarget > 0 ? clamp((consumed / calTarget) * 100, 0, 100) : 0;
  const over = calTarget > 0 && consumed > calTarget;
  const remaining = calTarget - consumed;

  return (
    <Card>
      <CardBody className="p-5">
        <div className="flex items-center gap-5">
          <Ring
            value={pct}
            size={128}
            stroke={12}
            color={over ? "var(--fatigued)" : "var(--primary)"}
          >
            <span className="text-[26px] font-extrabold leading-none tabular-nums">
              {fmtNum(consumed, 0)}
            </span>
            <span className="text-xs text-muted mt-1">/ {fmtNum(calTarget, 0)} kcal</span>
          </Ring>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted">
              {over ? "Hedef aşıldı" : "Kalan"}
            </p>
            <p
              className="text-2xl font-extrabold leading-tight tabular-nums"
              style={{ color: over ? "var(--fatigued)" : "var(--ink)" }}
            >
              {over ? `+${fmtNum(-remaining, 0)}` : fmtNum(remaining, 0)}
              <span className="text-base font-bold text-muted ml-1">kcal</span>
            </p>
            <p className="text-xs text-muted mt-0.5">
              Hedef {fmtNum(calTarget, 0)} kcal
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3.5">
          {MACROS.map((m) => {
            const value = totals[m.key];
            const goal = target[m.key] || 0;
            const ratio = goal > 0 ? clamp((value / goal) * 100, 0, 100) : 0;
            return (
              <div key={m.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold text-ink">{m.label}</span>
                  <span className="text-sm text-muted tabular-nums">
                    <span className="font-bold text-ink">{fmtNum(value, 0)}</span>
                    {" / "}
                    {fmtNum(goal, 0)} g
                  </span>
                </div>
                <Bar value={ratio} color={m.color} height={9} />
              </div>
            );
          })}
        </div>

        <Button
          variant="soft"
          size="md"
          fullWidth
          className="mt-5"
          onClick={onEditTarget}
        >
          <Target size={18} /> Hedefleri Düzenle
        </Button>
      </CardBody>
    </Card>
  );
}
