"use client";

import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef, ReactNode } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  suffix?: ReactNode;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, hint, suffix, error, className, id, ...props }, ref) => {
    return (
      <label className="block">
        {label && (
          <span className="block text-sm font-medium text-ink mb-1.5">
            {label}
          </span>
        )}
        <div
          className={cn(
            "flex items-center gap-2 rounded-2xl border bg-surface px-4 h-12",
            "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15",
            error ? "border-fatigued" : "border-border"
          )}
        >
          <input
            ref={ref}
            id={id}
            className={cn(
              "flex-1 bg-transparent outline-none text-[15px] placeholder:text-muted/70 min-w-0",
              className
            )}
            {...props}
          />
          {suffix && <span className="text-sm text-muted shrink-0">{suffix}</span>}
        </div>
        {error ? (
          <span className="block text-xs text-fatigued mt-1">{error}</span>
        ) : hint ? (
          <span className="block text-xs text-muted mt-1">{hint}</span>
        ) : null}
      </label>
    );
  }
);
Input.displayName = "Input";
