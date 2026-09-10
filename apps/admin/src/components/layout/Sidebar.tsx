"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { PanelLeft } from "lucide-react";
import { cx } from "@/lib/cx";
import { fast } from "@/lib/motion";
import { NAV, isActive } from "./nav";

export function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
  mobile = false,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Ana gezinme"
      className={cx(
        "flex h-full flex-col border-r border-line bg-surface",
        "transition-[width] duration-200 ease-out",
        collapsed && !mobile ? "w-16" : "w-60"
      )}
    >
      <div className={cx("flex h-14 shrink-0 items-center border-b border-line", collapsed && !mobile ? "justify-center px-2" : "gap-2.5 px-4")}>
        <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5 rounded-lg" aria-label="FitFloow yönetim paneli ana sayfası">
          <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-brand text-white">
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
              <path d="M12 2c.6 3.2 2.4 4.9 4 6.6 1.6 1.7 2.6 3.3 2.6 5.4A6.6 6.6 0 0 1 12 20.6 6.6 6.6 0 0 1 5.4 14c0-2.9 2.2-4.8 3.8-7.2C10.4 5.2 11.7 3.9 12 2Z" fill="currentColor" />
            </svg>
          </span>
          {(!collapsed || mobile) && (
            <span className="flex min-w-0 flex-col leading-none">
              <span className="text-[13px] font-semibold tracking-[-0.01em] text-ink">FitFloow</span>
              <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-subtle">Yönetim</span>
            </span>
          )}
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        {NAV.map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            {(!collapsed || mobile) && <p className="ff-eyebrow px-3 pb-1.5">{group.label}</p>}
            {collapsed && !mobile && <div className="mx-3 mb-2 border-t border-line" aria-hidden />}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href} className="relative">
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      title={collapsed && !mobile ? item.label : undefined}
                      className={cx(
                        "relative flex h-9 items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors duration-[140ms]",
                        collapsed && !mobile ? "justify-center px-0" : "px-3",
                        active ? "bg-brand-soft text-brand-text" : "text-muted hover:bg-surface-3 hover:text-ink"
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="nav-indicator"
                          transition={fast}
                          className="absolute -left-2 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand"
                          aria-hidden
                        />
                      )}
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      {(!collapsed || mobile) && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {!mobile && (
        <div className="shrink-0 border-t border-line p-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt"}
            className={cx(
              "flex h-9 w-full items-center gap-2.5 rounded-lg text-[13px] font-medium text-muted transition-colors hover:bg-surface-3 hover:text-ink",
              collapsed ? "justify-center px-0" : "px-3"
            )}
          >
            <PanelLeft className={cx("size-4 shrink-0 transition-transform duration-200", collapsed && "rotate-180")} aria-hidden />
            {!collapsed && <span>Daralt</span>}
          </button>
        </div>
      )}
    </nav>
  );
}
