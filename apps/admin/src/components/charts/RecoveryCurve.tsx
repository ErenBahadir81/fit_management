"use client";

import { useId, useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { recoveredFraction } from "@fitfloow/core";
import { num } from "@/lib/format";
import { usePrefersReducedMotion } from "@/lib/theme";
import { CHART, ChartTooltip, axisProps } from "./chart-kit";

/**
 * Recovery curve preview: 0 % right after training, 70 % at half the full-recovery time,
 * 100 % at full recovery. The shape comes from core's `recoveredFraction`, the same curve
 * the mobile readiness rings use.
 */
export function recoveryAt(hoursSince: number, fullRecoveryHours: number): number {
  return recoveredFraction(hoursSince, fullRecoveryHours) * 100;
}

export function RecoveryCurve({ fullRecoveryHours, color = CHART.brand, height = 120 }: { fullRecoveryHours: number; color?: string; height?: number }) {
  const uid = useId().replace(/:/g, "");
  const reduced = usePrefersReducedMotion();

  const data = useMemo(() => {
    const steps = 24;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const hours = (fullRecoveryHours / steps) * i;
      return { hours: Math.round(hours * 10) / 10, readiness: Math.round(recoveryAt(hours, fullRecoveryHours) * 10) / 10 };
    });
  }, [fullRecoveryHours]);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`rc-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="hours" tickFormatter={(v: number) => `${num(v)}s`} minTickGap={20} {...axisProps} />
          {/* The %100 label needs the full width: a negative left margin used to slice its first characters off. */}
          <YAxis domain={[0, 100]} ticks={[0, 70, 100]} tickFormatter={(v: number) => `%${v}`} width={42} {...axisProps} />
          <Tooltip
            cursor={{ stroke: CHART.grid }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <ChartTooltip
                  title={`${num(payload[0].payload.hours, 1)} saat sonra`}
                  rows={[{ label: "Hazır", value: `%${num(payload[0].payload.readiness, 0)}`, color }]}
                />
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="readiness"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#rc-${uid})`}
            isAnimationActive={!reduced}
            animationDuration={reduced ? 0 : 350}
            dot={false}
          />
          <ReferenceDot x={Math.round((fullRecoveryHours / 2) * 10) / 10} y={70} r={3} fill={color} stroke="var(--ff-surface)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
