import { cn } from "@/lib/utils";

export interface BarProps {
  value: number; // 0..100
  color?: string;
  track?: string;
  height?: number;
  className?: string;
  rounded?: boolean;
}

export function Bar({
  value,
  color = "var(--primary)",
  track = "var(--surface-2)",
  height = 8,
  className,
  rounded = true,
}: BarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cn("w-full overflow-hidden", rounded && "rounded-full", className)}
      style={{ height, background: track }}
    >
      <div
        className={cn("h-full", rounded && "rounded-full")}
        style={{
          width: `${clamped}%`,
          background: color,
          transition: "width 0.6s cubic-bezier(0.22,1,0.36,1)",
        }}
      />
    </div>
  );
}
