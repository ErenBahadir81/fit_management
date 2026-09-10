"use client";

import { cx } from "@/lib/cx";

/** Chart tokens resolve to the same CSS variables as the rest of the UI, so charts re-theme. */
export const CHART = {
  grid: "var(--ff-line)",
  axis: "var(--ff-text-subtle)",
  brand: "var(--ff-brand)",
  info: "var(--ff-info)",
  success: "var(--ff-success)",
  warn: "var(--ff-warn)",
  danger: "var(--ff-danger)",
  muted: "var(--ff-text-muted)",
} as const;

export const axisProps = {
  stroke: CHART.axis,
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: CHART.axis },
} as const;

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

export function ChartTooltip({ title, rows, className }: { title: string; rows: TooltipRow[]; className?: string }) {
  return (
    <div className={cx("rounded-lg border border-line bg-surface px-3 py-2 shadow-pop", className)}>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-subtle">{title}</p>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-[12px]">
            {r.color && <span aria-hidden className="size-2 shrink-0 rounded-[3px]" style={{ background: r.color }} />}
            <span className="text-muted">{r.label}</span>
            <span className="ml-auto font-medium tnum text-ink">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartLegend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-[11px] text-muted">
          <span aria-hidden className="size-2 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
