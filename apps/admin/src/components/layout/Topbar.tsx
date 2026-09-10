"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, KeyRound, LogOut, Menu, Monitor, Moon, Search, Sun } from "lucide-react";
import type { UserDTO } from "@fitfloow/core";
import { cx } from "@/lib/cx";
import { fast } from "@/lib/motion";
import { initials } from "@/lib/format";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { api } from "@/lib/api";
import { Kbd } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/Button";
import { breadcrumbFor } from "./nav";

export function Topbar({
  user,
  onOpenPalette,
  onOpenMobileNav,
  leaf,
}: {
  user: UserDTO;
  onOpenPalette: () => void;
  onOpenMobileNav: () => void;
  leaf?: string;
}) {
  const pathname = usePathname();
  const trail = breadcrumbFor(pathname, leaf);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md sm:px-6">
      <IconButton label="Menüyü aç" className="lg:hidden" onClick={onOpenMobileNav}>
        <Menu className="size-4" aria-hidden />
      </IconButton>

      <nav aria-label="Konum" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1 text-[13px]">
          {trail.map((crumb, i) => {
            const last = i === trail.length - 1;
            return (
              <li key={crumb.href} className="flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-subtle" aria-hidden />}
                {last ? (
                  <span aria-current="page" className="truncate font-medium text-ink">
                    {crumb.label}
                  </span>
                ) : (
                  <Link href={crumb.href} className="truncate rounded text-muted transition-colors hover:text-ink">
                    {crumb.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <button
        type="button"
        onClick={onOpenPalette}
        className="hidden h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-subtle transition-colors hover:border-line-strong hover:text-muted sm:flex"
      >
        <Search className="size-3.5" aria-hidden />
        <span className="pr-6">Ara…</span>
        <span className="flex items-center gap-0.5">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <IconButton label="Ara" className="sm:hidden" onClick={onOpenPalette}>
        <Search className="size-4" aria-hidden />
      </IconButton>

      <ThemeToggle />
      <UserMenu user={user} />
    </header>
  );
}

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: React.ReactNode }> = [
  { value: "light", label: "Açık", icon: <Sun className="size-3.5" aria-hidden /> },
  { value: "dark", label: "Koyu", icon: <Moon className="size-3.5" aria-hidden /> },
  { value: "system", label: "Sistem", icon: <Monitor className="size-3.5" aria-hidden /> },
];

export function ThemeToggle() {
  const { mode, resolved, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose(ref, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <IconButton label={`Tema: ${THEME_OPTIONS.find((o) => o.value === mode)?.label ?? "Sistem"}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {resolved === "dark" ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
      </IconButton>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: fast }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } }}
            role="menu"
            aria-label="Tema seçimi"
            className="absolute right-0 top-11 z-40 w-40 overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-pop"
          >
            {THEME_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={mode === o.value}
                onClick={() => {
                  setMode(o.value);
                  setOpen(false);
                }}
                className={cx(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                  mode === o.value ? "bg-brand-soft text-brand-text" : "text-ink hover:bg-surface-2"
                )}
              >
                {o.icon}
                {o.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu({ user }: { user: UserDTO }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useOutsideClose(ref, () => setOpen(false));

  const signOut = async () => {
    setSigningOut(true);
    try {
      await api.auth.logout();
    } catch {
      /* the cookie may already be gone — leaving is still the right outcome */
    }
    router.push("/login");
    router.refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${user.displayName} hesap menüsü`}
        className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-[11px] font-semibold text-ink transition-colors hover:border-line-strong"
      >
        {initials(user.displayName)}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: fast }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } }}
            role="menu"
            className="absolute right-0 top-11 z-40 w-56 overflow-hidden rounded-lg border border-line bg-surface shadow-pop"
          >
            <div className="border-b border-line px-3 py-2.5">
              <p className="truncate text-[13px] font-medium text-ink">{user.displayName}</p>
              <p className="mt-0.5 truncate text-xs text-subtle">
                @{user.username} · {user.role === "admin" ? "Yönetici" : "Kullanıcı"}
              </p>
            </div>
            <div className="p-1">
              <Link
                href="/settings"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-ink transition-colors hover:bg-surface-2"
              >
                <KeyRound className="size-3.5 text-subtle" aria-hidden />
                Parola değiştir
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                disabled={signingOut}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-danger transition-colors hover:bg-danger-soft disabled:opacity-60"
              >
                <LogOut className="size-3.5" aria-hidden />
                {signingOut ? "Çıkılıyor…" : "Çıkış yap"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function useOutsideClose(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, onClose]);
}
