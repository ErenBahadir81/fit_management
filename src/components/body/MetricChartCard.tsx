"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, Segmented } from "@/components/ui";
import type { SegmentedOption } from "@/components/ui";
import { MiniAreaChart } from "@/components/charts/LineChartCard";
import { TrendingDown, TrendingUp } from "lucide-react";
import { fmtNum, round } from "@/lib/utils";
import type { BodyEntryDTO } from "@/lib/types";

type Metric = "bf" | "weight" | "lean";

interface MetricConfig {
  label: string;
  unit: string;
  color: string;
  /** azalış olumlu mu */
  lowerIsBetter: boolean;
  pick: (e: BodyEntryDTO) => number;
}

const CONFIG: Record<Metric, MetricConfig> = {
  bf: {
    label: "Yağ %",
    unit: "%",
    color: "var(--recovering)",
    lowerIsBetter: true,
    pick: (e) => e.bodyFatPct,
  },
  weight: {
    label: "Kilo",
    unit: " kg",
    color: "var(--primary)",
    lowerIsBetter: true,
    pick: (e) => e.weightKg,
  },
  lean: {
    label: "Yağsız",
    unit: " kg",
    color: "var(--ready)",
    lowerIsBetter: false,
    pick: (e) => e.leanMassKg,
  },
};

const OPTIONS: SegmentedOption<Metric>[] = [
  { value: "bf", label: "Yağ %" },
  { value: "weight", label: "Kilo" },
  { value: "lean", label: "Yağsız" },
];

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
  });
}

export function MetricChartCard({ entries }: { entries: BodyEntryDTO[] }) {
  const [metric, setMetric] = useState<Metric>("bf");
  const cfg = CONFIG[metric];

  const data = useMemo(
    () =>
      entries.map((e) => ({
        label: shortDate(e.date),
        value: cfg.pick(e),
      })),
    [entries, cfg]
  );

  const first = entries[0];
  const last = entries[entries.length - 1];
  const diff =
    first && last ? round(cfg.pick(last) - cfg.pick(first), 1) : 0;
  const hasChange = entries.length > 1 && diff !== 0;
  const isDown = diff < 0;
  const good = cfg.lowerIsBetter ? isDown : !isDown;
  const deltaColor = good ? "var(--ready)" : "var(--fatigued)";
  const DeltaIcon = isDown ? TrendingDown : TrendingUp;

  return (
    <Card>
      <CardBody className="p-4">
        <Segmented value={metric} onChange={setMetric} options={OPTIONS} size="sm" />

        <div className="mt-4">
          {entries.length > 1 ? (
            <MiniAreaChart
              data={data}
              color={cfg.color}
              unit={cfg.unit}
              height={180}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-[180px] text-center px-6">
              <p className="text-sm text-muted">
                Grafik için en az iki ölçüm gerekir.
              </p>
            </div>
          )}
        </div>

        {entries.length > 1 && (
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted font-medium">
              Başlangıçtan değişim
            </span>
            {hasChange ? (
              <span
                className="inline-flex items-center gap-1 text-sm font-bold tabular-nums"
                style={{ color: deltaColor }}
              >
                <DeltaIcon size={15} />
                {isDown ? "" : "+"}
                {fmtNum(diff, 1)}
                {cfg.unit}
              </span>
            ) : (
              <span className="text-sm font-semibold text-muted">
                değişim yok
              </span>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
