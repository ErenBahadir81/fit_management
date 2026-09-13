import React from "react";
// The family file, not the package index: the index pulls every glyph map (~15 families) into the bundle.
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ThemeColors } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";
import { glyphFor, type AppIcon, type IconName } from "./icons";

export type { IconName };

export interface IconProps {
  /**
   * Raw Ionicons glyph. Prefer `icon` — a concept from `src/ui/icons.ts` — so the set stays
   * coherent. Reach for `name` only for a one-off the vocabulary has no word for yet.
   */
  name?: IconName;
  /** App concept (`goal`, `weighIn`, `rest`, …). Wins over `name`. */
  icon?: AppIcon;
  /** Filled twin of `icon`. Reserved for the tab you are standing on. */
  active?: boolean;
  size?: number;
  /** Theme color token or raw color. */
  color?: keyof ThemeColors | (string & {});
  style?: React.ComponentProps<typeof Ionicons>["style"];
  testID?: string;
}

export function Icon({ name, icon, active = false, size = 20, color = "ink", style, testID }: IconProps) {
  const { colors } = useTheme();
  const resolved = (colors as unknown as Record<string, unknown>)[color as string];
  const glyph = icon ? glyphFor(icon, active) : (name ?? "help-outline");
  return <Ionicons name={glyph} size={size} color={typeof resolved === "string" ? resolved : (color as string)} style={style} testID={testID} />;
}
