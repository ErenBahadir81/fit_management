import React from "react";
// The family file, not the package index: the index pulls every glyph map (~15 families) into the bundle.
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ThemeColors } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

export type IconName = keyof typeof Ionicons.glyphMap;

export interface IconProps {
  name: IconName;
  size?: number;
  /** Theme color token or raw color. */
  color?: keyof ThemeColors | (string & {});
  style?: React.ComponentProps<typeof Ionicons>["style"];
  testID?: string;
}

export function Icon({ name, size = 20, color = "ink", style, testID }: IconProps) {
  const { colors } = useTheme();
  const resolved = (colors as unknown as Record<string, unknown>)[color as string];
  return <Ionicons name={name} size={size} color={typeof resolved === "string" ? resolved : (color as string)} style={style} testID={testID} />;
}
