"use client";

import { createContext, forwardRef, useContext, useId } from "react";
import { cx } from "@/lib/cx";

interface FieldContext {
  id: string;
  errorId: string;
  hintId: string;
  invalid: boolean;
  describedBy?: string;
}

const Ctx = createContext<FieldContext | null>(null);

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  /** Hide the label visually but keep it for screen readers. */
  srOnlyLabel?: boolean;
  children: React.ReactNode;
}

export function Field({ label, hint, error, required, className, srOnlyLabel, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <Ctx.Provider value={{ id, errorId, hintId, invalid: Boolean(error), describedBy }}>
      <div className={cx("flex flex-col gap-1.5", className)}>
        <label htmlFor={id} className={cx("text-[13px] font-medium text-ink", srOnlyLabel && "sr-only")}>
          {label}
          {required && (
            <span className="text-danger ml-0.5" aria-hidden>
              *
            </span>
          )}
        </label>
        {children}
        {hint && !error && (
          <p id={hintId} className="text-xs text-subtle leading-relaxed">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-danger leading-relaxed">
            {error}
          </p>
        )}
      </div>
    </Ctx.Provider>
  );
}

function useField() {
  return useContext(Ctx);
}

const controlBase =
  "w-full bg-surface text-ink placeholder:text-subtle border rounded-lg transition-[border-color,background-color] duration-[140ms] ease-out disabled:opacity-60 disabled:cursor-not-allowed";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  const f = useField();
  return (
    <input
      ref={ref}
      id={f?.id ?? rest.id}
      aria-invalid={f?.invalid || undefined}
      aria-describedby={f?.describedBy}
      className={cx(controlBase, "h-9 px-3 text-sm", f?.invalid ? "border-danger" : "border-line hover:border-line-strong", className)}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref
) {
  const f = useField();
  return (
    <textarea
      ref={ref}
      id={f?.id ?? rest.id}
      aria-invalid={f?.invalid || undefined}
      aria-describedby={f?.describedBy}
      className={cx(controlBase, "min-h-20 px-3 py-2 text-sm leading-relaxed resize-y", f?.invalid ? "border-danger" : "border-line hover:border-line-strong", className)}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref
) {
  const f = useField();
  return (
    <div className="relative">
      <select
        ref={ref}
        id={f?.id ?? rest.id}
        aria-invalid={f?.invalid || undefined}
        aria-describedby={f?.describedBy}
        className={cx(
          controlBase,
          "h-9 pl-3 pr-8 text-sm appearance-none cursor-pointer",
          f?.invalid ? "border-danger" : "border-line hover:border-line-strong",
          className
        )}
        {...rest}
      >
        {children}
      </select>
      <svg aria-hidden viewBox="0 0 12 12" className="pointer-events-none absolute right-2.5 top-1/2 size-3 -translate-y-1/2 text-subtle">
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
});

/** Numeric input with a unit suffix — used all over the settings forms. */
export const NumberInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { unit?: string }>(function NumberInput(
  { className, unit, ...rest },
  ref
) {
  const f = useField();
  return (
    <div className="relative">
      <input
        ref={ref}
        type="number"
        inputMode="decimal"
        id={f?.id ?? rest.id}
        aria-invalid={f?.invalid || undefined}
        aria-describedby={f?.describedBy}
        className={cx(
          controlBase,
          "h-9 pl-3 text-sm tnum [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          unit ? "pr-12" : "pr-3",
          f?.invalid ? "border-danger" : "border-line hover:border-line-strong",
          className
        )}
        {...rest}
      />
      {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-subtle">{unit}</span>}
    </div>
  );
});

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  size = "md",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-[140ms] ease-out disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" ? "h-4 w-7" : "h-5 w-9",
        checked ? "bg-brand border-transparent" : "bg-surface-3 border-line"
      )}
    >
      <span
        className={cx(
          "block rounded-full bg-white transition-transform duration-[140ms] ease-out",
          size === "sm" ? "size-3 translate-x-0.5" : "size-4 translate-x-0.5",
          checked && (size === "sm" ? "translate-x-3.5" : "translate-x-4.5")
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-[6px] font-medium transition-colors duration-[140ms] ease-out",
              size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-[13px]",
              active ? "bg-surface text-ink border border-line" : "text-muted hover:text-ink border border-transparent"
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
