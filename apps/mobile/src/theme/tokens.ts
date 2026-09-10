/**
 * Design tokens — "premium calm". Semantic only: features never use raw hex.
 * Light and dark are designed together; every token has a counterpart.
 */
import type { TextStyle, ViewStyle } from "react-native";

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  ink: string;
  inkMuted: string;
  inkSubtle: string;
  inkInverse: string;
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  onPrimary: string;
  /** Secondary text on a primary (violet) surface. */
  onPrimaryMuted: string;
  /** Hairlines on a primary surface. */
  onPrimaryBorder: string;
  gradient: readonly [string, string];
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  border: string;
  borderStrong: string;
  overlay: string;
  skeleton: string;
  skeletonHighlight: string;
  ringTrack: string;
  chartGrid: string;
  tabBar: string;
}

export const light: ThemeColors = {
  bg: "#F5F6FA",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  surfaceMuted: "#EEF0F6",
  ink: "#0F141C",
  inkMuted: "#5B6273",
  inkSubtle: "#8A91A3",
  inkInverse: "#FFFFFF",
  primary: "#6D5DF6",
  primaryStrong: "#5A4AE3",
  primarySoft: "#EEEBFF",
  onPrimary: "#FFFFFF",
  onPrimaryMuted: "rgba(255,255,255,0.82)",
  onPrimaryBorder: "rgba(255,255,255,0.25)",
  gradient: ["#6D5DF6", "#8B7CFF"],
  success: "#16A34A",
  successSoft: "#E4F6EA",
  warning: "#F59E0B",
  warningSoft: "#FDF1DA",
  danger: "#EF4444",
  dangerSoft: "#FCE5E5",
  border: "#E6E8F0",
  borderStrong: "#D5D8E3",
  overlay: "rgba(15,20,28,0.45)",
  skeleton: "#E8EAF1",
  skeletonHighlight: "#F7F8FC",
  ringTrack: "#E8EAF1",
  chartGrid: "#ECEEF4",
  tabBar: "rgba(255,255,255,0.92)",
};

export const dark: ThemeColors = {
  bg: "#0B0D12",
  surface: "#151923",
  surfaceElevated: "#1B202C",
  surfaceMuted: "#1F2431",
  ink: "#F3F4F8",
  inkMuted: "#A6ACBD",
  inkSubtle: "#6F7688",
  inkInverse: "#0F141C",
  primary: "#8B7CFF",
  primaryStrong: "#6D5DF6",
  primarySoft: "#26224A",
  onPrimary: "#FFFFFF",
  onPrimaryMuted: "rgba(255,255,255,0.82)",
  onPrimaryBorder: "rgba(255,255,255,0.25)",
  gradient: ["#6D5DF6", "#8B7CFF"],
  success: "#22C55E",
  successSoft: "#12301E",
  warning: "#FBBF24",
  warningSoft: "#3A2D10",
  danger: "#F87171",
  dangerSoft: "#3B1B1B",
  border: "#232838",
  borderStrong: "#2F3548",
  overlay: "rgba(0,0,0,0.6)",
  skeleton: "#1C2130",
  skeletonHighlight: "#293040",
  ringTrack: "#232838",
  chartGrid: "#1F2431",
  tabBar: "rgba(21,25,35,0.92)",
};

/** 4-pt grid. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
  /** Screen side gutter. */
  gutter: 20,
  /** Inner padding of a Card. */
  cardPad: 20,
  /** Minimum touch target. */
  touch: 44,
} as const;

export const radii = {
  xs: 6,
  sm: 10,
  control: 14,
  md: 18,
  card: 24,
  sheet: 28,
  pill: 999,
} as const;

/** Type scale 11/13/15/17/22/28/40. Numbers add `tabular` (see Text `tabular` prop). */
export const type = {
  caption: { fontSize: 11, lineHeight: 14, fontWeight: "500", letterSpacing: 0.2 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600", letterSpacing: 0.1 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: "600" },
  title: { fontSize: 17, lineHeight: 24, fontWeight: "600", letterSpacing: -0.2 },
  heading: { fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.3 },
  display: { fontSize: 28, lineHeight: 34, fontWeight: "700", letterSpacing: -0.5 },
  hero: { fontSize: 40, lineHeight: 46, fontWeight: "800", letterSpacing: -1 },
} as const satisfies Record<string, TextStyle>;
export type TypeVariant = keyof typeof type;

export const tabularNums: TextStyle = { fontVariant: ["tabular-nums"] };

/** Spreadable absolute-fill (RN 0.86 dropped `StyleSheet.absoluteFillObject`). */
export const absoluteFill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const satisfies ViewStyle;

export interface ThemeShadows {
  card: ViewStyle;
  elevated: ViewStyle;
  primary: ViewStyle;
}

export function shadowsFor(scheme: "light" | "dark"): ThemeShadows {
  if (scheme === "dark") {
    return {
      card: { shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
      elevated: { shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 10 },
      primary: { shadowColor: "#6D5DF6", shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
    };
  }
  return {
    card: { shadowColor: "#0F141C", shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
    elevated: { shadowColor: "#0F141C", shadowOpacity: 0.12, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 8 },
    primary: { shadowColor: "#6D5DF6", shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  };
}

export type ThemeMode = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

/** Status colors shared with the API's recovery/on-track semantics. */
export const statusTone = {
  ready: "success",
  recovering: "warning",
  fatigued: "danger",
  ahead: "success",
  onTrack: "success",
  behind: "warning",
  stalled: "danger",
} as const;
export type Tone = "primary" | "success" | "warning" | "danger" | "neutral";
