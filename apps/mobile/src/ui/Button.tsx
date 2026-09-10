import React from "react";
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { absoluteFill, radii, spacing } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Pressable, type PressableProps } from "./Pressable";
import { Text } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  /** Stretch to the container width. */
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}

const heights: Record<ButtonSize, number> = { sm: 40, md: 52, lg: 56 };
const radiusFor: Record<ButtonSize, number> = { sm: 12, md: radii.control, lg: radii.control + 2 };

/** One primary action per screen. Use `secondary` / `ghost` for the rest. */
export function Button({ label, variant = "primary", size = "md", icon, iconRight, loading, full, disabled, style, testID, ...rest }: ButtonProps) {
  const { colors, shadows } = useTheme();
  const isDisabled = Boolean(disabled) || Boolean(loading);

  const bg = { primary: colors.primary, secondary: colors.primarySoft, ghost: "transparent", danger: colors.dangerSoft, inverse: colors.onPrimary }[variant];
  const fg = { primary: colors.onPrimary, secondary: colors.primary, ghost: colors.ink, danger: colors.danger, inverse: colors.primaryStrong }[variant];
  const textVariant = size === "sm" ? "label" : "title";

  return (
    <Pressable
      {...rest}
      testID={testID}
      disabled={isDisabled}
      accessibilityLabel={rest.accessibilityLabel ?? label}
      accessibilityState={{ busy: Boolean(loading), disabled: isDisabled }}
      haptic={variant === "primary" ? "medium" : "tap"}
      style={[
        styles.base,
        { height: heights[size], borderRadius: radiusFor[size], backgroundColor: bg, paddingHorizontal: size === "sm" ? spacing.md : spacing.xl },
        variant === "primary" && !isDisabled && shadows.primary,
        variant === "ghost" && { borderWidth: 1, borderColor: colors.border },
        full && styles.full,
        style,
      ]}
    >
      <View style={[styles.content, loading && styles.hidden]} accessibilityElementsHidden={Boolean(loading)}>
        {icon && <Icon name={icon} size={size === "sm" ? 16 : 20} color={fg} />}
        <Text variant={textVariant} style={{ color: fg }} numberOfLines={1}>
          {label}
        </Text>
        {iconRight && <Icon name={iconRight} size={size === "sm" ? 16 : 20} color={fg} />}
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
