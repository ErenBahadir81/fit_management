import { cx } from "@/lib/cx";

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("ff-card overflow-hidden", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  eyebrow?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="ff-eyebrow mb-1">{eyebrow}</p>}
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("p-5", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("flex items-center justify-between gap-3 border-t border-line bg-surface-2 px-5 py-3", className)}>{children}</div>;
}

/** Section heading used between cards on a page. */
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.07em] text-subtle">{children}</h2>
      {action}
    </div>
  );
}
