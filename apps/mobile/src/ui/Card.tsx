import React from "react";
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radii, spacing } from "../theme/tokens";
import { Pressable, type PressableProps } from "./Pressable";

export interface CardProps extends ViewProps {
  /** Makes the whole card a pressable (scale 0.98). */
  onPress?: PressableProps["onPress"];
  /**
   * `default` = surface with a hairline edge; `muted` = soft fill, no edge; `primary` = solid brand
   * blue, content uses `onPrimary` / `onPrimaryMuted` (navy in dark mode, so never a raw white).
   */
  variant?: "default" | "primary" | "muted";
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** The content block, flat: 16 pt radius, 16 pt padding, a hairline instead of a shadow. */
export function Card({ onPress, variant = "default", padded = true, style, children, testID, accessibilityLabel, ...rest }: CardProps) {
  const { colors } = useTheme();
  const base: StyleProp<ViewStyle> = [
    styles.card,
    padded && styles.padded,
    variant === "default" && { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
    variant === "muted" && { backgroundColor: colors.surfaceMuted },
    variant === "primary" && { backgroundColor: colors.primary },
  ];

  if (onPress) {
    return (
      <Pressable {...rest} testID={testID} onPress={onPress} scaleTo={0.98} accessibilityLabel={accessibilityLabel} style={[base, styles.clip, style]}>
        {children}
      </Pressable>
    );
  }
  return (
    <View {...rest} testID={testID} accessibilityLabel={accessibilityLabel} style={[base, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card },
  padded: { padding: spacing.cardPad },
  clip: { overflow: "hidden" },
});
