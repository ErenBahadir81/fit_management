"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { cx } from "@/lib/cx";
import { Button } from "./Button";
import { Floo } from "@/components/floo/Floo";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("ff-skeleton", className)} aria-hidden />;
}

/** Shimmering table body — same row height as the real table so nothing jumps. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  const widths = ["w-32", "w-20", "w-24", "w-16", "w-28", "w-12", "w-20"];
  return (
    <tbody aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-line last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <Skeleton className={cx("h-3.5", widths[(r + c) % widths.length])} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx("space-y-2.5", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cx("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  compact,
  mascot = true,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  compact?: boolean;
  mascot?: boolean;
}) {
  return (
    <div className={cx("flex flex-col items-center justify-center text-center", compact ? "px-6 py-10" : "px-6 py-16")}>
      {icon ? (
        <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-subtle">{icon}</div>
      ) : mascot ? (
        <Floo mood="sleepy" size={compact ? 48 : 64} className="mb-4" />
      ) : null}
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Bir şeyler ters gitti",
  error,
  onRetry,
  compact,
}: {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const message =
    (error as { message?: string } | undefined)?.message ?? "Veri alınamadı. Bağlantını kontrol edip tekrar dene.";
  return (
    <div className={cx("flex flex-col items-center justify-center text-center", compact ? "px-6 py-10" : "px-6 py-16")}>
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-danger/25 bg-danger-soft text-danger">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{message}</p>
      {onRetry && (
        <Button className="mt-4" size="sm" onClick={onRetry} icon={<RotateCw className="size-3.5" />}>
          Tekrar dene
        </Button>
      )}
    </div>
  );
}

/** Inline banner for non-blocking problems (validation summaries, warnings). */
export function Callout({
  tone = "warn",
  title,
  children,
}: {
  tone?: "warn" | "danger" | "info" | "success";
  title?: string;
  children: React.ReactNode;
}) {
  const tones = {
    warn: "border-warn/30 bg-warn-soft text-warn",
    danger: "border-danger/30 bg-danger-soft text-danger",
    info: "border-info/30 bg-info-soft text-info",
    success: "border-success/30 bg-success-soft text-success",
  } as const;
  return (
    <div className={cx("rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed", tones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={cx(title && "mt-1", "text-ink/85")}>{children}</div>
    </div>
  );
}
