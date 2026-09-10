"use client";

import { motion } from "motion/react";
import { cx } from "@/lib/cx";
import { itemEnter } from "@/lib/motion";
import { Skeleton } from "./States";

export function StatTile({
  label,
  value,
  hint,
  icon,
  accent = false,
  chart,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: boolean;
  chart?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <motion.div variants={itemEnter} className="ff-card relative flex min-w-0 flex-col justify-between overflow-hidden p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="ff-eyebrow truncate">{label}</p>
        {icon && <span className={cx("shrink-0", accent ? "text-brand" : "text-subtle")}>{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <p className={cx("mt-2.5 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tnum", accent ? "text-brand-text" : "text-ink")}>
          {value}
        </p>
      )}
      {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
      {chart && <div className="pointer-events-none mt-3 h-7 opacity-80">{chart}</div>}
    </motion.div>
  );
}

/** Label/value pair used inside detail cards. */
export function DataRow({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0", className)}>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-[13px] font-medium tnum text-ink">{value}</dd>
    </div>
  );
}

/** Horizontal progress bar with an optional target band (used by the volume matrix). */
export function MeterBar({
  value,
  max,
  min,
  color = "var(--ff-brand)",
  className,
  label,
}: {
  value: number;
  max: number;
  min?: number;
  color?: string;
  className?: string;
  label?: string;
}) {
  const scale = Math.max(max * 1.35, value * 1.05, 1);
  const pct = Math.min(100, (value / scale) * 100);
  const minPct = min !== undefined ? Math.min(100, (min / scale) * 100) : null;
  const maxPct = Math.min(100, (max / scale) * 100);

  return (
    <div
      className={cx("relative h-2 w-full overflow-hidden rounded-full bg-surface-3", className)}
      role="meter"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-label={label}
    >
      {/* target band */}
      <span
        aria-hidden
        className="absolute inset-y-0 bg-line"
        style={{ left: `${minPct ?? 0}%`, width: `${Math.max(0, maxPct - (minPct ?? 0))}%` }}
      />
      <span aria-hidden className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ease-out" style={{ width: `${pct}%`, background: color }} />
      <span aria-hidden className="absolute inset-y-0 w-px bg-ink/40" style={{ left: `${maxPct}%` }} />
    </div>
  );
}
