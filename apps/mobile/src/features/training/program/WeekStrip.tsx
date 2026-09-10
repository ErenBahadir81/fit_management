import React, { useCallback, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import type { ScheduleEntry } from "@fitfloow/core";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing, type Tone } from "../../../theme/tokens";
import { springs, timing } from "../../../theme/motion";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { stripItems, STATUS_TR, type StripItem } from "../lib/present";

export interface WeekStripProps {
  schedule: readonly ScheduleEntry[];
  selectedKey: string | null;
  onSelect: (item: StripItem) => void;
  testID?: string;
}

/** 7 day pills: weekday, day number, status dot. Today is the filled pill; selection springs. */
export function WeekStrip({ schedule, selectedKey, onSelect, testID = "week-strip" }: WeekStripProps) {
  const items = stripItems(schedule);
  return (
    <View testID={testID} style={styles.row} accessibilityRole="tablist">
      {items.map((item) => (
        <DayPill key={item.dateKey} item={item} selected={selectedKey ? item.dateKey === selectedKey : item.isToday} onSelect={onSelect} />
      ))}
    </View>
  );
}

const TONE_KEY: Record<Tone, "primary" | "success" | "warning" | "danger" | "inkSubtle"> = {
  primary: "primary",
  success: "success",
  warning: "warning",
  danger: "danger",
  neutral: "inkSubtle",
};

function DayPill({ item, selected, onSelect }: { item: StripItem; selected: boolean; onSelect: (i: StripItem) => void }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const active = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    active.value = reduce ? withTiming(selected ? 1 : 0, timing.reduced) : withSpring(selected ? 1 : 0, springs.snappy);
  }, [active, reduce, selected]);

  const fill = useAnimatedStyle(() => ({ opacity: active.value, transform: [{ scale: 0.9 + active.value * 0.1 }] }));
  const dot = colors[TONE_KEY[item.tone]];
  const press = useCallback(() => onSelect(item), [item, onSelect]);

  return (
    <Pressable
      testID={`week-day-${item.dateKey}`}
      onPress={press}
      haptic="select"
      minTarget={false}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={item.a11y}
      style={styles.pill}
    >
      <Animated.View style={[styles.fill, { backgroundColor: item.isToday ? colors.primary : colors.surfaceMuted }, fill]} />
      <Text variant="caption" color={selected && item.isToday ? "onPrimary" : "inkSubtle"} style={styles.label}>
        {item.label}
      </Text>
      <Text variant="bodyStrong" tabular color={selected && item.isToday ? "onPrimary" : "ink"}>
        {item.dayNumber}
      </Text>
      <View
        style={[
          styles.dot,
          { backgroundColor: item.status === "upcoming" || item.status === "past" ? "transparent" : dot, borderColor: dot, borderWidth: item.status === "upcoming" ? 1 : 0 },
        ]}
      />
    </Pressable>
  );
}

/** Caption under the strip: what the selected day holds. */
export function StripCaption({ item }: { item: StripItem | null }) {
  if (!item) return null;
  return (
    <Text variant="caption" color="inkMuted" numberOfLines={1} testID="week-strip-caption">
      {item.title ? `${item.title} · ${STATUS_TR[item.status]}` : STATUS_TR[item.status]}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.xs },
  pill: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: spacing.sm, borderRadius: radii.control, minHeight: 64 },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.control },
  label: { textTransform: "none" },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
});
