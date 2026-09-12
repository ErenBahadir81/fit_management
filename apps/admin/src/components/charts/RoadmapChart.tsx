"use client";

import { useId } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RoadmapWeek } from "@fitfloow/core";
import { int, num } from "@/lib/format";
import { usePrefersReducedMotion } from "@/lib/theme";
import { CHART, ChartLegend, ChartTooltip, axisProps } from "./chart-kit";

/**
 * Goal roadmap: trend weight falling week by week (area, left axis) against the daily
 * calorie target the plan asks for that week (line, right axis).
 */
export function RoadmapChart({
  roadmap,
  targetWeightKg,
  height = 260,
}: {
  roadmap: RoadmapWeek[];
  targetWeightKg?: number;
  height?: number;
}) {
  const uid = useId().replace(/:/g, "");
  const reduced = usePrefersReducedMotion();

  const data = roadmap.map((w) => ({
    week: w.weekIndex,
    weight: w.endWeightKg,
    bf: w.endBfPct,
    kcal: w.dailyCalorieTarget,
  }));

  if (data.length === 0) return null;

  const weights = data.map((d) => d.weight);
  const lo = Math.min(...weights, targetWeightKg ?? Infinity);
  const hi = Math.max(...weights);
  const pad = Math.max(0.6, (hi - lo) * 0.15);

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <ChartLegend
          items={[
            { label: "Tahmini kilo (kg)", color: CHART.brand },
            { label: "Günlük hedef (kcal)", color: CHART.warn },
          ]}
        />
      </div>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`rm-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.brand} stopOpacity={0.26} />
                <stop offset="100%" stopColor={CHART.brand} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="week" tickFormatter={(v: number) => `${v}. hf`} minTickGap={20} {...axisProps} />
            {/* Three-digit weights need the whole axis width; a negative left margin clipped the leading digit. */}
            <YAxis yAxisId="kg" domain={[Math.floor(lo - pad), Math.ceil(hi + pad)]} width={38} tickFormatter={(v: number) => num(v)} {...axisProps} />
            <YAxis yAxisId="kcal" orientation="right" width={48} tickFormatter={(v: number) => int(v)} {...axisProps} />
            <Tooltip
              cursor={{ stroke: CHART.grid }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    title={`${payload[0].payload.week}. hafta`}
                    rows={[
                      { label: "Kilo", value: `${num(payload[0].payload.weight, 1)} kg`, color: CHART.brand },
                      { label: "Yağ", value: `%${num(payload[0].payload.bf, 1)}` },
                      { label: "Günlük", value: `${int(payload[0].payload.kcal)} kcal`, color: CHART.warn },
                    ]}
                  />
                ) : null
              }
            />
            {targetWeightKg !== undefined && (
              <ReferenceLine
                yAxisId="kg"
                y={targetWeightKg}
                stroke={CHART.success}
                strokeDasharray="4 4"
                label={{ value: `hedef ${num(targetWeightKg, 1)} kg`, position: "insideTopRight", fontSize: 10, fill: CHART.success }}
              />
            )}
            <Area
              yAxisId="kg"
              type="monotone"
              dataKey="weight"
              stroke={CHART.brand}
              strokeWidth={1.75}
              fill={`url(#rm-${uid})`}
              isAnimationActive={!reduced}
              animationDuration={reduced ? 0 : 400}
              dot={false}
            />
            <Line
              yAxisId="kcal"
              type="stepAfter"
              dataKey="kcal"
              stroke={CHART.warn}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              dot={false}
              isAnimationActive={!reduced}
              animationDuration={reduced ? 0 : 400}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
