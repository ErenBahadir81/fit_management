/**
 * Design tokens: "Floo blue, flat". Semantic only: features never use raw hex.
 * Light and dark are designed together; every token has a counterpart.
 *
 * Derived from a Design DNA pass over MyFitnessPal, FatSecret and BitePal (App Store screenshots,
 * measured): cool light canvas, white hairline cards, one blue accent, big tabular numbers.
 * Every text pair below is WCAG AA (ratios noted as [fg on bg]); `__tests__/theme/contrast.test.ts`
 * enforces it, including `onScrim` on the scrim over a white frame.
 *
 * The brand blue is Floo's own hue (≈200°) taken deep enough to carry text. Floo's body colour
 * (`floo`, #69C8F1) is 1.9:1 on white, so it is decoration only: the mascot, its bubble, the end of
 * the goal ring. In dark mode no single blue can both carry white text and read as text on
 * near-black, so `onPrimary` flips to navy there: always use `onPrimary`, never a raw white.
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
  /** Secondary text on a primary (blue) surface. */
  onPrimaryMuted: string;
  /** Hairlines on a primary surface. */
  onPrimaryBorder: string;
  /** The one gradient in the app: the goal ring, deep brand blue into Floo's sky. */
  gradient: readonly [string, string];
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  /** Warning as a fill (over-target bars, ring overshoot). `warning` is tuned for text. */
  warningFill: string;
  danger: string;
  dangerSoft: string;
  /** Card and row hairline. Cards are flat: this line is their only edge. */
  border: string;
  borderStrong: string;
  /** Input / checkbox boundaries: ≥ 3:1 against `surface` (WCAG 1.4.11), unlike the hairlines. */
  controlBorder: string;
  /** Focus ring and selected outline. */
  focus: string;
  /**
   * The scrim: dims a photo, the live camera or the screen behind a floating card. Dark in both
   * schemes, deep enough that `onScrim` stays AA even over a white frame.
   */
  overlay: string;
  /** Text and marks drawn on the scrim (over a photo or the camera). Light in both schemes. */
  onScrim: string;
  skeleton: string;
  skeletonHighlight: string;
  ringTrack: string;
  chartGrid: string;
  tabBar: string;
  tabBarBorder: string;
  /** Floo's body colour. Decoration only, never text. */
  floo: string;
  /** Floo's speech bubble: a drop of Floo's colour in the surface, so its voice is recognisable. */
  flooBubble: string;
  flooBubbleBorder: string;
  /** Macro marks (bars, dots, ring segments). The value is always printed next to the mark. */
  macroProtein: string;
  macroCarbs: string;
  macroFat: string;
}

export const light: ThemeColors = {
  bg: "#F3F6F9",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  surfaceMuted: "#EAF0F5",
  ink: "#0D1B26", // 17.5 on surface
  inkMuted: "#4E5E6E", // 6.7 on surface, 6.2 on bg
  inkSubtle: "#5E6D80", // 5.3 on surface, 4.6 on surfaceMuted
  inkInverse: "#FFFFFF",
  primary: "#0A70B3", // white on it 5.3, as text on bg 4.9
  primaryStrong: "#075A91", // pressed; white on it 7.3
  primarySoft: "#E2F1FB", // primary text on it 4.6
  onPrimary: "#FFFFFF",
  onPrimaryMuted: "rgba(255,255,255,0.9)", // 4.6 on primary
  onPrimaryBorder: "rgba(255,255,255,0.28)",
  gradient: ["#0A70B3", "#3AA7E3"],
  success: "#13773A", // 5.6 on surface
  successSoft: "#E3F5EA",
  warning: "#B45309", // 5.0 on surface, 4.5 on warningSoft
  warningSoft: "#FEF1DC",
  warningFill: "#F59E0B",
  danger: "#CC2B2B", // 5.3 on surface
  dangerSoft: "#FDE8E8",
  border: "#E2E8EE",
  borderStrong: "#CDD6DF",
  controlBorder: "#7A8A9C", // 3.5 on surface, 3.3 on bg
  focus: "#0A70B3",
  overlay: "rgba(13,27,38,0.62)",
  onScrim: "#FFFFFF", // 4.9 on the scrim over a white frame
  skeleton: "#E7EDF2",
  skeletonHighlight: "#F5F8FB",
  ringTrack: "#E3EBF2",
  chartGrid: "#EBF0F4",
  tabBar: "#FFFFFF",
  tabBarBorder: "#E2E8EE",
  floo: "#69C8F1",
  flooBubble: "#E4F4FD", // ink on it 15.5
  flooBubbleBorder: "#A9DBF5",
  macroProtein: "#E0487A",
  macroCarbs: "#C98200",
  macroFat: "#0E9C8E",
};

export const dark: ThemeColors = {
  bg: "#0A1118", // navy-black, not grey: blue feels native on it
  surface: "#121B24",
  surfaceElevated: "#18232E",
  surfaceMuted: "#1C2833",
  ink: "#EDF2F7", // 15.4 on surface
  inkMuted: "#A2B0BE", // 7.9 on surface
  inkSubtle: "#8390A0", // 5.4 on surface
  inkInverse: "#0D1B26",
  primary: "#52B7EE", // 7.8 as text on surface
  primaryStrong: "#3A9FD8",
  primarySoft: "#0F2B40", // primary text on it 6.5
  onPrimary: "#04213A", // navy, 7.3 on primary
  onPrimaryMuted: "rgba(4,33,58,0.78)",
  onPrimaryBorder: "rgba(4,33,58,0.22)",
  gradient: ["#2F9BD8", "#69C8F1"],
  success: "#3DCB74",
  successSoft: "#10301E",
  warning: "#F5B544",
  warningSoft: "#35270C",
  warningFill: "#F5B544",
  danger: "#F47272",
  dangerSoft: "#3A1A1C",
  border: "#1F2B37",
  borderStrong: "#2C3A48",
  controlBorder: "#5D6E80", // 3.3 on surface
  focus: "#52B7EE",
  overlay: "rgba(0,0,0,0.6)",
  onScrim: "#FFFFFF", // 5.7 on the scrim over a white frame
  skeleton: "#1A2530",
  skeletonHighlight: "#253241",
  ringTrack: "#1F2B37",
  chartGrid: "#1A2530",
  tabBar: "#121B24",
  tabBarBorder: "#1F2B37",
  floo: "#69C8F1",
  flooBubble: "#12283A", // ink on it 13.4
  flooBubbleBorder: "#23506F",
  macroProtein: "#F2729A",
  macroCarbs: "#F2B23E",
  macroFat: "#34C3B3",
};

/** 4-pt grid. Gutter and card padding are 16, the width MFP and FatSecret measure at. */
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
  gutter: 16,
  /** Inner padding of a Card. */
  cardPad: 16,
  /** Vertical gap between cards on a screen. */
  cardGap: 12,
  /** Minimum touch target. */
  touch: 44,
  /** List row heights: title + meta, and three lines. */
  rowMin: 52,
  rowTall: 68,
} as const;

/** One soft scale: controls 12, cards 16, sheets 24, chips and bars pill. */
export const radii = {
  xs: 6,
  sm: 10,
  control: 12,
  md: 14,
  card: 16,
  sheet: 24,
  pill: 999,
} as const;

/**
 * Type scale 12/13/15/17/20/22/28/44. Numbers add `tabular` (see Text `tabular` prop).
 * `number` is a figure inside a line ("1.250 kcal"); `hero` is the one number a screen is about.
 */
export const type = {
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500", letterSpacing: 0.1 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600", letterSpacing: 0.1 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: "600" },
  title: { fontSize: 17, lineHeight: 24, fontWeight: "600", letterSpacing: -0.2 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
  number: { fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.3 },
  display: { fontSize: 28, lineHeight: 34, fontWeight: "800", letterSpacing: -0.5 },
  hero: { fontSize: 44, lineHeight: 50, fontWeight: "800", letterSpacing: -1 },
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

/**
 * Flat elevation. Cards cast nothing (their hairline `border` is the edge); only layers that float
 * over content do: sheets, menus, toasts (`elevated`) and a floating action button (`primary`).
 * No coloured glows. Shadows are tinted with the ink, never pure black on light.
 */
export function shadowsFor(scheme: "light" | "dark"): ThemeShadows {
  const none: ViewStyle = { shadowOpacity: 0, elevation: 0 };
  if (scheme === "dark") {
    return {
      card: none,
      elevated: { shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
      primary: { shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
    };
  }
  return {
    card: none,
    elevated: { shadowColor: "#0D1B26", shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
    primary: { shadowColor: "#0D1B26", shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
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
