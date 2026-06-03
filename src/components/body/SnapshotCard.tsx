"use client";

import { Card, CardBody, Ring, Badge, Stat } from "@/components/ui";
import { TrendingDown, TrendingUp } from "lucide-react";
import { bodyFatCategory } from "@/lib/navy";
import { fmtNum, round } from "@/lib/utils";
import type { BodyEntryDTO } from "@/lib/types";

/** Yağ oranını 0..100 yüzdeye eşler (Ring için, ~%50'yi tam halka kabul eder). */
function bfRingValue(bf: number): number {
  return Math.min(100, (bf / 50) * 100);
}

function Delta({
  current,
  prev,
  unit,
  /** azalış olumlu mu (yağ için true, yağsız kütle için false) */
  lowerIsBetter,
  digits = 1,
}: {
  current: number;
  prev: number;
  unit: string;
  lowerIsBetter: boolean;
  digits?: number;
}) {
  const diff = round(current - prev, digits);
  if (diff === 0) {
    return <span className="text-xs font-semibold text-muted">değişim yok</span>;
  }
  const isDown = diff < 0;
  const good = lowerIsBetter ? isDown : !isDown;
  const color = good ? "var(--ready)" : "var(--fatigued)";
  const Icon = isDown ? TrendingDown : TrendingUp;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-bold tabular-nums"
      style={{ color }}
    >
      <Icon size={13} />
      {isDown ? "" : "+"}
      {fmtNum(diff, digits)}
      {unit}
    </span>
  );
}

export function SnapshotCard({
  latest,
  prev,
}: {
  latest: BodyEntryDTO;
  prev?: BodyEntryDTO;
}) {
  const category = bodyFatCategory(latest.gender, latest.bodyFatPct);

  return (
    <Card>
      <CardBody className="p-5">
        <div className="flex items-center gap-4">
          <Ring
            value={bfRingValue(latest.bodyFatPct)}
            size={104}
            stroke={10}
            color="var(--recovering)"
          >
            <span className="text-2xl font-extrabold tabular-nums leading-none">
              %{fmtNum(latest.bodyFatPct, 1)}
            </span>
            <span className="text-[11px] text-muted font-medium mt-0.5">
              yağ oranı
            </span>
          </Ring>

          <div className="min-w-0 flex-1">
            <Badge color="var(--recovering)">{category}</Badge>
            {prev ? (
              <div className="mt-2">
                <Delta
                  current={latest.bodyFatPct}
                  prev={prev.bodyFatPct}
                  unit="%"
                  lowerIsBetter
                />
                <p className="text-[11px] text-muted mt-0.5">
                  önceki ölçüme göre
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted mt-2">İlk ölçümün</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-border">
          <div>
            <Stat label="Kilo" value={`${fmtNum(latest.weightKg, 1)} kg`} />
            {prev && (
              <div className="mt-1">
                <Delta
                  current={latest.weightKg}
                  prev={prev.weightKg}
                  unit=" kg"
                  lowerIsBetter
                />
              </div>
            )}
          </div>
          <div>
            <Stat
              label="Yağsız Kütle"
              value={`${fmtNum(latest.leanMassKg, 1)} kg`}
            />
            {prev && (
              <div className="mt-1">
                <Delta
                  current={latest.leanMassKg}
                  prev={prev.leanMassKg}
                  unit=" kg"
                  lowerIsBetter={false}
                />
              </div>
            )}
          </div>
          <div>
            <Stat
              label="Yağ Kütlesi"
              value={`${fmtNum(latest.fatMassKg, 1)} kg`}
            />
            {prev && (
              <div className="mt-1">
                <Delta
                  current={latest.fatMassKg}
                  prev={prev.fatMassKg}
                  unit=" kg"
                  lowerIsBetter
                />
              </div>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
