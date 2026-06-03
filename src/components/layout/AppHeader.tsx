import { cn } from "@/lib/utils";

export function AppHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 bg-bg/85 backdrop-blur-xl border-b border-border/70",
        className
      )}
    >
      <div className="mx-auto max-w-app px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[13px] text-muted truncate -mt-0.5">{subtitle}</p>
          )}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}
