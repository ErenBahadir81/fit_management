"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cx } from "@/lib/cx";
import { useIsClient } from "@/lib/theme";
import { dialogPop, drawerSlide, overlayFade } from "@/lib/motion";
import { Button, IconButton } from "./Button";

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Escape closes, Tab cycles inside, focus returns where it came from. */
function useModalBehaviour(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>("[data-autofocus]") ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  return ref;
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" } as const;

export function Dialog({ open, onClose, title, description, children, footer, size = "md" }: DialogProps) {
  const mounted = useIsClient();
  const ref = useModalBehaviour(open, onClose);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            variants={overlayFade}
            initial="hidden"
            animate="show"
            exit="exit"
            className="absolute inset-0 bg-overlay backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            variants={dialogPop}
            initial="hidden"
            animate="show"
            exit="exit"
            className={cx(
              "relative flex max-h-[86vh] w-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop",
              SIZES[size]
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
                {description && <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>}
              </div>
              <IconButton label="Kapat" size="sm" onClick={onClose}>
                <X className="size-4" aria-hidden />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function Drawer({ open, onClose, title, description, children, footer, width = "md" }: Omit<DialogProps, "size"> & { width?: "md" | "lg" }) {
  const mounted = useIsClient();
  const ref = useModalBehaviour(open, onClose);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            variants={overlayFade}
            initial="hidden"
            animate="show"
            exit="exit"
            className="absolute inset-0 bg-overlay backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            variants={drawerSlide}
            initial="hidden"
            animate="show"
            exit="exit"
            className={cx(
              "absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-surface shadow-pop",
              width === "lg" ? "sm:w-[36rem]" : "sm:w-[26rem]"
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
                {description && <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>}
              </div>
              <IconButton label="Kapat" size="sm" onClick={onClose}>
                <X className="size-4" aria-hidden />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Sil",
  danger = true,
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
}) {
  const confirm = useCallback(() => onConfirm(), [onConfirm]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Vazgeç
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={confirm} loading={pending} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-muted">{message}</p>
    </Dialog>
  );
}
