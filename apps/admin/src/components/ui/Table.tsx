"use client";

import { forwardRef, useCallback, useState } from "react";
import { cx } from "@/lib/cx";

/** Horizontal scroll container — the page body itself must never scroll sideways. */
export function TableWrap({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("ff-scroll-x relative", className)}>{children}</div>;
}

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return <table className={cx("w-full min-w-[44rem] border-collapse text-left text-[13px]", className)}>{children}</table>;
}

export function THead({ children, sticky = true }: { children: React.ReactNode; sticky?: boolean }) {
  return (
    <thead
      className={cx(
        "text-[11px] uppercase tracking-[0.07em] text-subtle",
        sticky && "sticky top-0 z-10 bg-surface/85 backdrop-blur-sm supports-[backdrop-filter]:bg-surface/70"
      )}
    >
      {children}
    </thead>
  );
}

export function TH({
  children,
  align = "left",
  className,
  width,
  sortable,
  sorted,
  onSort,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  width?: string;
  sortable?: boolean;
  sorted?: "asc" | "desc" | null;
  onSort?: () => void;
}) {
  const content = sortable ? (
    <button
      type="button"
      onClick={onSort}
      className="inline-flex items-center gap-1 uppercase tracking-[0.07em] transition-colors hover:text-ink"
      aria-label={`${typeof children === "string" ? children : ""} sütununa göre sırala`}
    >
      {children}
      <span aria-hidden className={cx("text-[9px]", sorted ? "text-brand-text" : "text-subtle/60")}>
        {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "◆"}
      </span>
    </button>
  ) : (
    children
  );
  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
      className={cx(
        "border-b border-line px-4 py-2.5 font-semibold",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {content}
    </th>
  );
}

export const TR = forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }>(function TR(
  { className, interactive, children, ...rest },
  ref
) {
  return (
    <tr
      ref={ref}
      className={cx(
        "border-b border-line last:border-0 transition-colors duration-[120ms]",
        interactive && "cursor-pointer hover:bg-surface-2 focus-within:bg-surface-2",
        className
      )}
      {...rest}
    >
      {children}
    </tr>
  );
});

export function TD({
  children,
  align = "left",
  className,
  numeric,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center"; numeric?: boolean }) {
  return (
    <td
      className={cx(
        "px-4 py-2.5 align-middle text-ink",
        align === "right" && "text-right",
        align === "center" && "text-center",
        numeric && "tnum",
        className
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

/**
 * Click-to-edit table cell. Enter commits, Escape reverts, blur commits —
 * the fastest way to fix one number in a dense table.
 */
export function InlineEdit({
  value,
  onCommit,
  type = "text",
  suffix,
  align = "left",
  className,
  min,
  max,
  step,
  label,
}: {
  value: string | number;
  onCommit: (next: string) => void;
  type?: "text" | "number";
  suffix?: string;
  align?: "left" | "right";
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  // Stable identity: an inline arrow ref would re-run (and re-select) on every keystroke.
  const focusOnMount = useCallback((el: HTMLInputElement | null) => {
    el?.focus();
    el?.select();
  }, []);

  const startEditing = () => {
    setDraft(String(value));
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    if (draft !== String(value)) onCommit(draft);
  };

  if (editing) {
    return (
      <input
        // A callback ref focuses on mount — no effect needed for a one-shot DOM action.
        ref={focusOnMount}
        aria-label={label}
        type={type}
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(String(value));
            setEditing(false);
          }
        }}
        className={cx(
          "h-7 w-full rounded-md border border-brand bg-surface px-2 text-[13px] tnum outline-none",
          align === "right" && "text-right",
          className
        )}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={`${label}: ${value}. Düzenlemek için tıkla`}
      onClick={startEditing}
      className={cx(
        "group inline-flex h-7 w-full items-center rounded-md border border-transparent px-2 text-[13px] tnum transition-colors",
        "hover:border-line hover:bg-surface-2",
        align === "right" && "justify-end",
        className
      )}
    >
      <span>{value}</span>
      {suffix && <span className="ml-0.5 text-subtle">{suffix}</span>}
    </button>
  );
}
