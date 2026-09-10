"use client";

import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardDTO } from "@fitfloow/core";
import { dateShort, int } from "@/lib/format";
import { usePrefersReducedMotion } from "@/lib/theme";
import { CHART, ChartLegend, ChartTooltip, axisProps } from "./chart-kit";

type Point = DashboardDTO["series"][number];

const SERIES = [
  { key: "workouts" as const, label: "Antrenman", color: CHART.brand },
  { key: "meals" as const, label: "Öğün", color: CHART.info },
  { key: "scans" as const, label: "Tarama", color: CHART.success },
];

export function ActivityChart({ data }: { data: Point[] }) {
  const uid = useId().replace(/:/g, "");
  const reduced = usePrefersReducedMotion();

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <ChartLegend items={SERIES.map((s) => ({ label: s.label, color: s.color }))} />
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <defs>
              {SERIES.map((s) => (
                <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="dateKey" tickFormatter={(v: string) => dateShort(v)} minTickGap={24} {...axisProps} />
            <YAxis width={40} allowDecimals={false} {...axisProps} />
            <Tooltip
              cursor={{ stroke: CHART.grid, strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    title={dateShort(String(label))}
                    rows={SERIES.map((s) => ({
                      label: s.label,
                      color: s.color,
                      value: int(payload.find((p) => p.dataKey === s.key)?.value as number),
                    }))}
                  />
                ) : null
              }
            />
            {SERIES.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={1.75}
                fill={`url(#${uid}-${s.key})`}
                isAnimationActive={!reduced}
                animationDuration={reduced ? 0 : 400}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Tiny inline trend line for the KPI tiles — no axes, no tooltip, pure shape. */
export function Sparkline({ values, color = CHART.brand, className }: { values: number[]; color?: string; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(2)},${(h - ((v - min) / range) * (h - 4) - 2).toFixed(2)}`);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
