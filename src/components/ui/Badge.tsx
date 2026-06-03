import { cn } from "@/lib/utils";

export interface BadgeProps {
  children: React.ReactNode;
  color?: string;
  soft?: boolean;
  className?: string;
}

export function Badge({ children, color = "var(--muted)", soft = true, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        className
      )}
      style={
        soft
          ? { color, background: `color-mix(in srgb, ${color} 14%, transparent)` }
          : { color: "#fff", background: color }
      }
    >
      {children}
    </span>
  );
}

export function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: color }}
    />
  );
}
