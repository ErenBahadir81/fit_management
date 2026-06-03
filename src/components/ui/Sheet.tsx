"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect } from "react";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Sheet({ open, onClose, title, subtitle, children, footer }: SheetProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] items-end justify-center">
      <div
        className="absolute inset-0 bg-ink/40 animate-fade-in"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full max-w-app bg-surface rounded-t-3xl shadow-sheet",
          "animate-sheet-up flex flex-col max-h-[92dvh]"
        )}
      >
        <div className="pt-3 flex justify-center shrink-0">
          <div className="h-1.5 w-10 rounded-full bg-border" />
        </div>
        {(title || subtitle) && (
          <div className="px-5 pt-2 pb-3 flex items-start justify-between gap-3 shrink-0">
            <div>
              {title && <h2 className="text-lg font-bold leading-tight">{title}</h2>}
              {subtitle && (
                <p className="text-sm text-muted mt-0.5">{subtitle}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="tap h-9 w-9 -mr-1 grid place-items-center rounded-full bg-surface-2 text-muted"
              aria-label="Kapat"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div
          className={cn(
            "px-5 overflow-y-auto no-scrollbar flex-1",
            footer ? "pb-2" : "pb-[max(env(safe-area-inset-bottom),1rem)]"
          )}
        >
          {children}
        </div>
        {footer && (
          <div className="px-5 pt-3 pb-5 pad-safe-b border-t border-border shrink-0 bg-surface rounded-b-none">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
