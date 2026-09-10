"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Info, RotateCw, X } from "lucide-react";
import { cx } from "@/lib/cx";
import { useIsClient } from "@/lib/theme";
import { toastSlide } from "@/lib/motion";

export type ToastTone = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

type ToastInput = Omit<ToastItem, "id">;

interface ToastApi {
  push: (t: ToastInput) => number;
  success: (title: string, description?: string) => number;
  error: (title: string, description?: string, retry?: () => void) => number;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="size-4 text-success" aria-hidden />,
  error: <AlertTriangle className="size-4 text-danger" aria-hidden />,
  info: <Info className="size-4 text-info" aria-hidden />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const mounted = useIsClient();
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = ++seq.current;
      const item: ToastItem = { id, duration: input.tone === "error" ? 7000 : 4000, ...input };
      setItems((prev) => [...prev.slice(-3), item]);
      if (item.duration && item.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), item.duration)
        );
      }
      return id;
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      dismiss,
      success: (title, description) => push({ tone: "success", title, description }),
      error: (title, description, retry) =>
        push({ tone: "error", title, description, action: retry ? { label: "Tekrar dene", onClick: retry } : undefined }),
    }),
    [push, dismiss]
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div
            aria-live="polite"
            aria-atomic="false"
            className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
          >
            <AnimatePresence initial={false}>
              {items.map((t) => (
                <motion.div
                  key={t.id}
                  layout
                  variants={toastSlide}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className={cx(
                    "pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface px-3.5 py-3 shadow-pop",
                    t.tone === "error" ? "border-danger/30" : "border-line"
                  )}
                >
                  <span className="mt-0.5">{ICONS[t.tone]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink">{t.title}</p>
                    {t.description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.description}</p>}
                    {t.action && (
                      <button
                        type="button"
                        onClick={() => {
                          t.action?.onClick();
                          dismiss(t.id);
                        }}
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-text hover:underline"
                      >
                        <RotateCw className="size-3" aria-hidden />
                        {t.action.label}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Bildirimi kapat"
                    onClick={() => dismiss(t.id)}
                    className="-mr-1 -mt-1 rounded p-1 text-subtle transition-colors hover:text-ink"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>,
          document.body
        )}
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
