import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { absoluteFill, radii, spacing } from "../theme/tokens";
import { Icon } from "./Icon";
import { resolveGlyph, type IconGlyph } from "./icons";
import { Pressable, type PressableProps } from "./Pressable";
import { Text } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconGlyph;
  iconRight?: IconGlyph;
  loading?: boolean;
  /** Stretch to the container width. */
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}

const heights: Record<ButtonSize, number> = { sm: 40, md: 48, lg: 52 };

/**
 * One primary action per screen. Use `secondary` / `ghost` for the rest. Flat: no glow; a press
 * darkens the fill (primary → primaryStrong) on top of the 0.97 scale. `inverse` sits on a
 * `Card variant="primary"`: a surface pill with primary text, correct in both schemes.
 */
export function Button({ label, variant = "primary", size = "md", icon, iconRight, loading, full, disabled, style, testID, onPressIn, onPressOut, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = Boolean(disabled) || Boolean(loading);
  const [pressed, setPressed] = useState(false);

  const bg = { primary: colors.primary, secondary: colors.primarySoft, ghost: "transparent", danger: colors.dangerSoft, inverse: colors.surface }[variant];
  const bgPressed = { primary: colors.primaryStrong, secondary: colors.primarySoft, ghost: colors.surfaceMuted, danger: colors.dangerSoft, inverse: colors.surfaceMuted }[variant];
  const fg = { primary: colors.onPrimary, secondary: colors.primary, ghost: colors.ink, danger: colors.danger, inverse: colors.primary }[variant];
  const textVariant = size === "sm" ? "label" : "title";

  return (
    <Pressable
      {...rest}
      testID={testID}
      disabled={isDisabled}
      accessibilityLabel={rest.accessibilityLabel ?? label}
      accessibilityState={{ busy: Boolean(loading), disabled: isDisabled }}
      haptic={variant === "primary" ? "medium" : "tap"}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={[
        styles.base,
        { height: heights[size], borderRadius: radii.control, backgroundColor: pressed && !isDisabled ? bgPressed : bg, paddingHorizontal: size === "sm" ? spacing.md : spacing.xl },
        variant === "ghost" && { borderWidth: 1, borderColor: colors.borderStrong },
        full && styles.full,
        style,
      ]}
    >
      <View style={[styles.content, loading && styles.hidden]} accessibilityElementsHidden={Boolean(loading)}>
        {icon && <Icon name={resolveGlyph(icon)} size={size === "sm" ? 16 : 20} color={fg} />}
        <Text variant={textVariant} style={{ color: fg }} numberOfLines={1}>
          {label}
        </Text>
        {iconRight && <Icon name={resolveGlyph(iconRight)} size={size === "sm" ? 16 : 20} color={fg} />}
      </View>
      {loading && (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator color={fg} testID={testID ? `${testID}-spinner` : "button-spinner"} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", alignSelf: "flex-start", flexDirection: "row" },
  full: { alignSelf: "stretch" },
  content: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  hidden: { opacity: 0 },
  spinner: { ...absoluteFill, alignItems: "center", justifyContent: "center" },
});
