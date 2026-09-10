import React from "react";
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../theme/ThemeProvider";
import { radii, spacing } from "../theme/tokens";
import { Pressable, type PressableProps } from "./Pressable";

export interface CardProps extends ViewProps {
  /** Makes the whole card a pressable (scale 0.98). */
  onPress?: PressableProps["onPress"];
  /** `primary` = violet gradient with white content; `muted` = subtle fill, no shadow. */
  variant?: "default" | "primary" | "muted";
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** The content block: 24 pt radius, 20 pt padding, soft shadow. */
export function Card({ onPress, variant = "default", padded = true, style, children, testID, accessibilityLabel, ...rest }: CardProps) {
  const { colors, shadows } = useTheme();
  const base: ViewStyle[] = [
    styles.card,
    padded ? styles.padded : null,
    variant === "default" && { backgroundColor: colors.surface, ...shadows.card },
    variant === "muted" && { backgroundColor: colors.surfaceMuted },
    variant === "primary" && { backgroundColor: colors.primary, ...shadows.primary },
  ].filter(Boolean) as ViewStyle[];

  const inner =
    variant === "primary" ? (
      <>
        <LinearGradient colors={[...colors.gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        {children}
      </>
    ) : (
      children
    );

  if (onPress) {
    return (
      <Pressable {...rest} testID={testID} onPress={onPress} scaleTo={0.98} accessibilityLabel={accessibilityLabel} style={[base, styles.clip, style]}>
        {inner}
      </Pressable>
    );
  }
  return (
    <View {...rest} testID={testID} accessibilityLabel={accessibilityLabel} style={[base, variant === "primary" && styles.clip, style]}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card },
  padded: { padding: spacing.cardPad },
  clip: { overflow: "hidden" },
});
