import React from "react";
import { View, type ViewProps, type ViewStyle } from "react-native";
import { radii, spacing, type ThemeColors } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

type Space = keyof typeof spacing;
type Radius = keyof typeof radii;

export interface BoxProps extends ViewProps {
  p?: Space;
  px?: Space;
  py?: Space;
  pt?: Space;
  pb?: Space;
  pl?: Space;
  pr?: Space;
  m?: Space;
  mx?: Space;
  my?: Space;
  mt?: Space;
  mb?: Space;
  gap?: Space;
  row?: boolean;
  wrap?: boolean;
  center?: boolean;
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly";
  flex?: number;
  bg?: keyof ThemeColors;
  radius?: Radius;
  border?: boolean;
}

const alignMap = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch", baseline: "baseline" } as const;
const justifyMap = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly",
} as const;

/** Layout primitive with token-based spacing shorthands. */
export function Box({
  p, px, py, pt, pb, pl, pr, m, mx, my, mt, mb, gap, row, wrap, center, align, justify, flex, bg, radius, border, style, ...rest
}: BoxProps) {
  const { colors } = useTheme();
  const s: ViewStyle = {};
  if (p !== undefined) s.padding = spacing[p];
  if (px !== undefined) s.paddingHorizontal = spacing[px];
  if (py !== undefined) s.paddingVertical = spacing[py];
  if (pt !== undefined) s.paddingTop = spacing[pt];
  if (pb !== undefined) s.paddingBottom = spacing[pb];
  if (pl !== undefined) s.paddingLeft = spacing[pl];
  if (pr !== undefined) s.paddingRight = spacing[pr];
  if (m !== undefined) s.margin = spacing[m];
  if (mx !== undefined) s.marginHorizontal = spacing[mx];
  if (my !== undefined) s.marginVertical = spacing[my];
  if (mt !== undefined) s.marginTop = spacing[mt];
  if (mb !== undefined) s.marginBottom = spacing[mb];
  if (gap !== undefined) s.gap = spacing[gap];
  if (row) s.flexDirection = "row";
  if (wrap) s.flexWrap = "wrap";
  if (center) {
    s.alignItems = "center";
    s.justifyContent = "center";
  }
  if (align) s.alignItems = alignMap[align];
  if (justify) s.justifyContent = justifyMap[justify];
  if (flex !== undefined) s.flex = flex;
  if (bg) s.backgroundColor = colors[bg] as string;
  if (radius) s.borderRadius = radii[radius];
  if (border) {
    s.borderWidth = 1;
    s.borderColor = colors.border;
  }
  return <View {...rest} style={[s, style]} />;
}
