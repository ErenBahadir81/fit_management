"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CornerDownLeft, Moon, Search, Sun } from "lucide-react";
import { cx } from "@/lib/cx";
import { dialogPop, overlayFade } from "@/lib/motion";
import { useIsClient, useTheme } from "@/lib/theme";
import { Kbd } from "@/components/ui/Badge";
import { NAV } from "./nav";

export interface Command {
  id: string;
  label: string;
  group: string;
  keywords?: string[];
  shortcut?: string;
  icon?: React.ReactNode;
  run: () => void;
}

/** Türkçe-aware, diacritic-insensitive matching so "gogus" finds "Göğüs". */
export function fold(s: string): string {
  return s
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function filterCommands(commands: Command[], query: string): Command[] {
  const q = fold(query);
  if (!q) return commands;
  return commands.filter((c) => fold([c.label, c.group, ...(c.keywords ?? [])].join(" ")).includes(q));
}

export function CommandPalette({
  open,
  onOpenChange,
  extraCommands,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extraCommands?: Command[];
}) {
  const isClient = useIsClient();
  if (!isClient) return null;

  return createPortal(
    // Mounting the inner panel only while open keeps query/selection state fresh
    // on every open without resetting it from an effect.
    <AnimatePresence>{open && <PaletteInner onClose={() => onOpenChange(false)} extraCommands={extraCommands} />}</AnimatePresence>,
    document.body
  );
}

function PaletteInner({ onClose, extraCommands }: { onClose: () => void; extraCommands?: Command[] }) {
  const router = useRouter();
  const { setMode, resolved } = useTheme();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const commands = useMemo<Command[]>(() => {
    const navCommands: Command[] = NAV.flatMap((group) =>
      group.items.map((item) => ({
        id: `nav:${item.href}`,
        label: item.label,
        group: group.label,
        keywords: item.keywords,
        icon: <item.icon className="size-4" aria-hidden />,
        run: () => router.push(item.href),
      }))
    );
    const themeCommands: Command[] = [
      {
        id: "theme:toggle",
        label: resolved === "dark" ? "Açık temaya geç" : "Koyu temaya geç",
        group: "Görünüm",
        keywords: ["tema", "dark", "light", "theme"],
        icon: resolved === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />,
        run: () => setMode(resolved === "dark" ? "light" : "dark"),
      },
      {
        id: "theme:system",
        label: "Sistem temasını kullan",
        group: "Görünüm",
        keywords: ["system", "otomatik", "tema"],
        icon: <Moon className="size-4" aria-hidden />,
        run: () => setMode("system"),
      },
    ];
    return [...navCommands, ...(extraCommands ?? []), ...themeCommands];
  }, [router, setMode, resolved, extraCommands]);

  const results = useMemo(() => filterCommands(commands, query), [commands, query]);
  const active = Math.min(index, Math.max(0, results.length - 1));

  const onQueryChange = useCallback((value: string) => {
    setQuery(value);
    setIndex(0);
  }, []);

  const runAt = useCallback(
    (i: number) => {
      const chosen = results[i];
      if (!chosen) return;
      chosen.run();
      onClose();
    },
    [results, onClose]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex(results.length === 0 ? 0 : (active + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex(results.length === 0 ? 0 : (active - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(active);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const grouped = useMemo(() => {
    const out: Array<{ group: string; items: Array<{ command: Command; flatIndex: number }> }> = [];
    results.forEach((command, flatIndex) => {
      const last = out[out.length - 1];
      if (last && last.group === command.group) last.items.push({ command, flatIndex });
      else out.push({ group: command.group, items: [{ command, flatIndex }] });
    });
    return out;
  }, [results]);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]">
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
        variants={dialogPop}
        initial="hidden"
        animate="show"
        exit="exit"
        role="dialog"
        aria-modal="true"
        aria-label="Komut paleti"
        onKeyDown={onKeyDown}
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-subtle" aria-hidden />
          <input
            ref={(el) => el?.focus()}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls="command-list"
            aria-label="Komut ara"
            placeholder="Sayfa ara veya komut çalıştır…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-subtle"
          />
          <Kbd>ESC</Kbd>
        </div>

        <ul id="command-list" ref={listRef} role="listbox" aria-label="Komutlar" className="max-h-[22rem] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">Eşleşen komut yok.</li>}
          {grouped.map((g) => (
            <li key={g.group}>
              <p className="ff-eyebrow px-3 pb-1 pt-2">{g.group}</p>
              <ul>
                {g.items.map(({ command, flatIndex }) => {
                  const isActive = flatIndex === active;
                  return (
                    <li key={command.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        data-active={isActive}
                        onMouseMove={() => setIndex(flatIndex)}
                        onClick={() => runAt(flatIndex)}
                        className={cx(
                          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors duration-[120ms]",
                          isActive ? "bg-brand-soft text-brand-text" : "text-ink hover:bg-surface-2"
                        )}
                      >
                        <span className={cx("shrink-0", isActive ? "text-brand-text" : "text-subtle")}>{command.icon}</span>
                        <span className="flex-1 truncate">{command.label}</span>
                        {command.shortcut && <Kbd>{command.shortcut}</Kbd>}
                        {isActive && <CornerDownLeft className="size-3.5 shrink-0 opacity-70" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2 px-4 py-2 text-[11px] text-subtle">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> gezin
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> aç
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd> aç / kapat
          </span>
        </div>
      </motion.div>
    </div>
  );
}

/** ⌘K / Ctrl+K anywhere in the panel. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}
