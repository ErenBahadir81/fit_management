"use client";

import { Search, X } from "lucide-react";
import { cx } from "@/lib/cx";

export function SearchInput({
  value,
  onChange,
  placeholder = "Ara…",
  className,
  label = "Ara",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cx("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            e.stopPropagation();
            onChange("");
          }
        }}
        className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-8 text-sm text-ink outline-none transition-colors placeholder:text-subtle hover:border-line-strong [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          aria-label="Aramayı temizle"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-subtle transition-colors hover:text-ink"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
