import { cx } from "@/lib/cx";

export type Tone = "neutral" | "brand" | "success" | "warn" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-3 text-muted border-line",
  brand: "bg-brand-soft text-brand-text border-brand-line",
  success: "bg-success-soft text-success border-success/25",
  warn: "bg-warn-soft text-warn border-warn/25",
  danger: "bg-danger-soft text-danger border-danger/25",
  info: "bg-info-soft text-info border-info/25",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        TONES[tone],
        className
      )}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Small numeric delta chip: green when falling weight/fat, red when rising. */
export function DeltaChip({ value, good = "down", suffix = "" }: { value: number | null; good?: "up" | "down"; suffix?: string }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-subtle">—</span>;
  const isGood = good === "down" ? value <= 0 : value >= 0;
  const tone: Tone = value === 0 ? "neutral" : isGood ? "success" : "danger";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return (
    <Badge tone={tone} className="tnum">
      {sign}
      {new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(Math.abs(value))}
      {suffix}
    </Badge>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1.5 font-mono text-[10px] font-medium text-muted">
      {children}
    </kbd>
  );
}
