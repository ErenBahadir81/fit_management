"use client";

import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";

export interface NumberStepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  suffix,
  className,
}: NumberStepperProps) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-2xl border border-border bg-surface overflow-hidden",
        className
      )}
    >
      <button
        type="button"
        onClick={() => set(value - step)}
        disabled={value <= min}
        className="tap h-11 w-11 grid place-items-center text-ink disabled:opacity-30 active:bg-surface-2"
        aria-label="Azalt"
      >
        <Minus size={18} />
      </button>
      <div className="min-w-[3.5rem] text-center font-bold tabular-nums">
        {value}
        {suffix && <span className="text-muted font-medium text-sm ml-0.5">{suffix}</span>}
      </div>
      <button
        type="button"
        onClick={() => set(value + step)}
        disabled={value >= max}
        className="tap h-11 w-11 grid place-items-center text-ink disabled:opacity-30 active:bg-surface-2"
        aria-label="Artır"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}
