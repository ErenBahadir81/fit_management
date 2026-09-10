"use client";

import { useMemo, useState } from "react";
import type { DayDTO, MuscleDTO } from "@fitfloow/core";
import { cx } from "@/lib/cx";
import { num } from "@/lib/format";
import { VOLUME_STATUS_TR, templateVolume, totalPlannedSets, type VolumeStatus } from "@/lib/volume";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Segmented } from "@/components/ui/Field";
import { MeterBar } from "@/components/ui/Stat";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/Table";

const STATUS_TONE: Record<VolumeStatus, Tone> = { under: "warn", in: "success", over: "danger", none: "neutral" };

/**
 * Live weekly volume matrix: muscles × days. Targets are per week, so a cycle that is not
 * seven days long is normalised (sets × 7 / cycle length) before the status is decided.
 */
export function VolumeMatrix({ days, muscles }: { days: DayDTO[]; muscles: MuscleDTO[] }) {
  const [basis, setBasis] = useState<"week" | "cycle">("week");
  const rows = useMemo(() => templateVolume(days, muscles), [days, muscles]);
  const visible = rows.filter((r) => r.cycleSets > 0 || r.target.max > 0);
  const maxCell = Math.max(1, ...rows.flatMap((r) => r.byDay));

  const counts = rows.reduce(
    (acc, r) => {
      acc[r.status] += 1;
      return acc;
    },
    { under: 0, in: 0, over: 0, none: 0 } as Record<VolumeStatus, number>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="success" dot>
            {counts.in} hedefte
          </Badge>
          <Badge tone="warn" dot>
            {counts.under} eksik
          </Badge>
          <Badge tone="danger" dot>
            {counts.over} fazla
          </Badge>
          <span className="text-subtle">· toplam {num(totalPlannedSets(days))} planlı set</span>
        </div>
        <Segmented
          size="sm"
          label="Hacim tabanı"
          value={basis}
          onChange={setBasis}
          options={[
            { value: "week", label: "Haftalık" },
            { value: "cycle", label: "Döngü" },
          ]}
        />
      </div>

      <TableWrap>
        <Table className="min-w-[52rem]">
          <THead>
            <tr>
              <TH width="11rem">Kas</TH>
              {days.map((d, i) => (
                <TH key={`${d.order}-${i}`} align="center" width="3.25rem">
                  <span title={d.title}>G{i + 1}</span>
                </TH>
              ))}
              <TH align="right" width="5rem">
                {basis === "week" ? "Hafta" : "Döngü"}
              </TH>
              <TH width="10rem">Hedef</TH>
              <TH align="right" width="6rem">
                Durum
              </TH>
            </tr>
          </THead>
          <tbody>
            {visible.map((row) => {
              const value = basis === "week" ? row.weeklySets : row.cycleSets;
              return (
                <TR key={row.key}>
                  <TD>
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: row.color }} />
                      <span className="truncate font-medium">{row.name}</span>
                    </span>
                  </TD>
                  {row.byDay.map((sets, i) => (
                    <TD key={i} align="center" numeric className="px-1">
                      <span
                        className={cx(
                          "inline-flex h-6 w-8 items-center justify-center rounded-md text-[12px]",
                          sets > 0 ? "text-ink" : "text-subtle/40"
                        )}
                        style={sets > 0 ? { background: `color-mix(in oklab, ${row.color} ${Math.round((sets / maxCell) * 55 + 10)}%, transparent)` } : undefined}
                      >
                        {sets > 0 ? num(sets, sets % 1 === 0 ? 0 : 1) : "·"}
                      </span>
                    </TD>
                  ))}
                  <TD align="right" numeric className="font-medium">
                    {num(value, value % 1 === 0 ? 0 : 1)}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <MeterBar
                        value={row.weeklySets}
                        min={row.target.min}
                        max={row.target.max}
                        color={row.color}
                        label={`${row.name} haftalık hacim`}
                        className="flex-1"
                      />
                      <span className="w-12 shrink-0 text-right text-[11px] tnum text-subtle">
                        {row.target.min ?? 0}–{row.target.max}
                      </span>
                    </div>
                  </TD>
                  <TD align="right">
                    <Badge tone={STATUS_TONE[row.status]}>{VOLUME_STATUS_TR[row.status]}</Badge>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
