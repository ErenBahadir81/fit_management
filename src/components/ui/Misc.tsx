import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent",
        className
      )}
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex justify-center py-20">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

export function SectionTitle({
  title,
  action,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between mb-2.5 px-0.5", className)}>
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-6">
      {icon && (
        <div className="h-14 w-14 grid place-items-center rounded-2xl bg-surface-2 text-muted mb-3">
          {icon}
        </div>
      )}
      <p className="font-semibold text-ink">{title}</p>
      {desc && <p className="text-sm text-muted mt-1 max-w-[16rem]">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  color,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs text-muted font-medium truncate">{label}</div>
      <div
        className="text-xl font-bold leading-tight tabular-nums truncate"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted mt-0.5 truncate">{sub}</div>}
    </div>
  );
}
