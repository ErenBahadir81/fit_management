"use client";

import { cn } from "@/lib/utils";
import { Dumbbell, CalendarRange, Scale, Salad } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Özet", icon: Dumbbell },
  { href: "/program", label: "Program", icon: CalendarRange },
  { href: "/body", label: "Vücut", icon: Scale },
  { href: "/diet", label: "Diyet", icon: Salad },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="app-bottom-nav fixed bottom-0 inset-x-0 z-40">
      <div className="mx-auto max-w-app">
        <div className="mx-3 mb-3 pad-safe-b rounded-3xl border border-border bg-surface/95 backdrop-blur-xl shadow-pop">
          <ul className="grid grid-cols-4">
            {TABS.map((tab) => {
              const active =
                tab.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(tab.href);
              const Icon = tab.icon;
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    className="tap flex flex-col items-center justify-center gap-1 py-2.5"
                  >
                    <span
                      className={cn(
                        "grid place-items-center h-9 w-12 rounded-2xl transition-colors",
                        active ? "bg-primary-soft text-primary" : "text-muted"
                      )}
                    >
                      <Icon size={21} strokeWidth={active ? 2.4 : 2} />
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-semibold transition-colors",
                        active ? "text-primary" : "text-muted"
                      )}
                    >
                      {tab.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}
