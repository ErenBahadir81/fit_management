import React from "react";
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";
import { tabularNums, type ThemeColors, type Tone, type TypeVariant } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  /** Semantic color token (default `ink`). */
  color?: keyof ThemeColors;
  /** Status tone shortcut — overrides `color`. */
  tone?: Tone;
  /** Tabular numerals: use for every number on screen. */
  tabular?: boolean;
  align?: TextStyle["textAlign"];
  weight?: TextStyle["fontWeight"];
}

const toneToColor: Record<Tone, keyof ThemeColors> = {
  primary: "primary",
  success: "success",
  warning: "warning",
  danger: "danger",
  neutral: "inkMuted",
};

/** Themed text with the 11/13/15/17/22/28/40 scale. Dynamic type is honoured up to 130 %. */
export function Text({ variant = "body", color = "ink", tone, tabular, align, weight, style, ...rest }: TextProps) {
  const { colors, type } = useTheme();
  const colorKey = tone ? toneToColor[tone] : color;
  return (
    <RNText
      maxFontSizeMultiplier={1.3}
      {...rest}
      style={[
        type[variant],
        { color: colors[colorKey] as string },
        tabular && tabularNums,
        align !== undefined && { textAlign: align },
        weight !== undefined && { fontWeight: weight },
        style,
      ]}
    />
  );
}
