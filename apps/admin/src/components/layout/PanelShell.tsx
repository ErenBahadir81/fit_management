"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import type { UserDTO } from "@fitfloow/core";
import { overlayFade, pageEnter, spring } from "@/lib/motion";
import { usePersistentFlag } from "@/lib/persist";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CommandPalette, useCommandPalette } from "./CommandPalette";

const COLLAPSE_KEY = "fitfloow.admin.sidebar";

export function PanelShell({ user, children }: { user: UserDTO; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = usePersistentFlag(COLLAPSE_KEY, false);
  const [mobileNav, setMobileNav] = useState(false);
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();
  const pathname = usePathname();

  const toggle = () => setCollapsed(!collapsed);

  return (
    <div className="flex min-h-dvh bg-canvas">
      <div className="sticky top-0 hidden h-dvh shrink-0 lg:block">
        <Sidebar collapsed={collapsed} onToggle={toggle} />
      </div>

      <AnimatePresence>
        {mobileNav && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              variants={overlayFade}
              initial="hidden"
              animate="show"
              exit="exit"
              className="absolute inset-0 bg-overlay backdrop-blur-[2px]"
              onClick={() => setMobileNav(false)}
              aria-hidden
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0, transition: spring }}
              exit={{ x: "-100%", transition: { duration: 0.16 } }}
              className="absolute inset-y-0 left-0"
            >
              <Sidebar collapsed={false} onToggle={toggle} onNavigate={() => setMobileNav(false)} mobile />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} onOpenPalette={() => setPaletteOpen(true)} onOpenMobileNav={() => setMobileNav(true)} />
        <main className="flex-1">
          <motion.div
            key={pathname}
            variants={pageEnter}
            initial="hidden"
            animate="show"
            className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8"
          >
            {children}
          </motion.div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

/** Page-level header: eyebrow + display title + description + actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-6 flex flex-wrap items-end justify-between gap-4 ${className ?? ""}`}>
      <div className="min-w-0">
        {eyebrow && <p className="ff-eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="text-display font-semibold text-ink">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
