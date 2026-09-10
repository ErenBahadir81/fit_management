import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import type { Weekday } from "@fitfloow/core";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { measurementDayLabel, weekLabel } from "../reportMath";

export interface WeekSwitcherProps {
  weekKey: string;
  isCurrent: boolean;
  measurementDay: Weekday;
  onPrev: () => void;
  onNext: (() => void) | null;
}

/** ‹ week › with the measurement-day label; the live week carries a "Canlı" badge. */
export function WeekSwitcher({ weekKey, isCurrent, measurementDay, onPrev, onNext }: WeekSwitcherProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessibilityRole="toolbar">
      <Pressable onPress={onPrev} accessibilityLabel="Önceki hafta" haptic="select" style={[styles.btn, { backgroundColor: colors.surfaceMuted }]} testID="week-prev">
        <Icon name="chevron-back" size={20} color="ink" />
      </Pressable>
      <Animated.View key={weekKey} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.center}>
        <View style={styles.labelRow}>
          <Text variant="title" tabular testID="week-label">
            {weekLabel(weekKey)}
          </Text>
          {isCurrent ? <Chip label="Canlı" tone="success" size="sm" testID="week-live" /> : null}
        </View>
        <Text variant="caption" color="inkMuted">
          {measurementDayLabel(measurementDay)}
        </Text>
      </Animated.View>
      <Pressable onPress={onNext ?? undefined} disabled={!onNext} accessibilityLabel="Sonraki hafta" haptic="select" style={[styles.btn, { backgroundColor: colors.surfaceMuted }]} testID="week-next">
        <Icon name="chevron-forward" size={20} color="ink" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  btn: { width: 44, height: 44, borderRadius: radii.control, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", gap: 2 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
