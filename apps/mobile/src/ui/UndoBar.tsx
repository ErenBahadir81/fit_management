import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown, useReducedMotion } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";
import { radii, spacing } from "../theme/tokens";
import { Chip } from "./Chip";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export interface UndoBarProps {
  message: string;
  onUndo: () => void;
  /** Distance from the bottom edge (tab bar clearance etc.). */
  bottom: number;
  icon?: IconName;
  actionLabel?: string;
  testID?: string;
}

/**
 * "Silindi · Geri al" bar shown after a delete. The screen owns the lifetime (see
 * `useUndoWindow`); this only draws the bar and springs it in above the tab bar.
 */
export function UndoBar({ message, onUndo, bottom, icon = "trash-outline", actionLabel = "Geri al", testID = "undo-bar" }: UndoBarProps) {
  const { colors, shadows } = useTheme();
  const reduce = useReducedMotion();
  return (
    <Animated.View
      entering={reduce ? undefined : FadeInDown.springify().damping(18).stiffness(220)}
      exiting={FadeOutDown.duration(reduce ? 100 : 160)}
      pointerEvents="box-none"
      style={[styles.host, { bottom }]}
      testID={testID}
    >
      <View style={[styles.bar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, shadows.elevated]} accessibilityLiveRegion="polite">
        <Icon name={icon} size={16} color="inkMuted" />
        <Text variant="label" style={styles.text} numberOfLines={1}>
          {message}
        </Text>
        <Chip label={actionLabel} tone="primary" size="sm" icon="arrow-undo-outline" onPress={onUndo} accessibilityLabel="Silmeyi geri al" testID="undo-delete" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: spacing.gutter, right: spacing.gutter, alignItems: "center" },
  bar: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingVertical: spacing.sm, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, minHeight: 52 },
  text: { flex: 1 },
});
