import {
  Apple,
  CalendarDays,
  Dumbbell,
  LayoutDashboard,
  MessageCircle,
  ScanLine,
  Settings,
  SlidersHorizontal,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra words the ⌘K palette should match on. */
  keywords?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Genel",
    items: [
      { href: "/", label: "Panel", icon: LayoutDashboard, keywords: ["dashboard", "özet", "ana sayfa"] },
      { href: "/users", label: "Kullanıcılar", icon: Users, keywords: ["user", "üye", "hesap"] },
    ],
  },
  {
    label: "Katalog",
    items: [
      { href: "/muscles", label: "Kaslar", icon: Dumbbell, keywords: ["muscle", "kas grubu", "toparlanma"] },
      { href: "/exercises", label: "Hareketler", icon: SlidersHorizontal, keywords: ["exercise", "egzersiz", "hareket"] },
      { href: "/programs", label: "Programlar", icon: CalendarDays, keywords: ["template", "şablon", "antrenman"] },
      { href: "/foods", label: "Besinler", icon: Apple, keywords: ["food", "yemek", "kalori", "makro"] },
    ],
  },
  {
    label: "Sistem",
    items: [
      { href: "/goals-settings", label: "Hedef motoru", icon: Target, keywords: ["goal", "oran tablosu", "kalori", "rate"] },
      { href: "/mascot", label: "Floo mesajları", icon: MessageCircle, keywords: ["mascot", "maskot", "mesaj"] },
      { href: "/scans", label: "Taramalar", icon: ScanLine, keywords: ["scan", "fotoğraf", "vision"] },
      { href: "/settings", label: "Ayarlar", icon: Settings, keywords: ["settings", "hafta", "parola"] },
    ],
  },
];

export const NAV_FLAT: NavItem[] = NAV.flatMap((g) => g.items);

const TITLES = new Map(NAV_FLAT.map((i) => [i.href, i.label]));

/** Breadcrumb trail for a pathname: [["/", "Panel"], ["/users", "Kullanıcılar"], …]. */
export function breadcrumbFor(pathname: string, leaf?: string): Array<{ href: string; label: string }> {
  if (pathname === "/") return [{ href: "/", label: "Panel" }];
  const segments = pathname.split("/").filter(Boolean);
  const trail: Array<{ href: string; label: string }> = [{ href: "/", label: "Panel" }];
  let acc = "";
  segments.forEach((seg, i) => {
    acc += `/${seg}`;
    const known = TITLES.get(acc);
    if (known) trail.push({ href: acc, label: known });
    else if (i === segments.length - 1) trail.push({ href: acc, label: leaf ?? "Detay" });
  });
  return trail;
}

/** A nav link is active for its own route and, except for "/", its children. */
export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
