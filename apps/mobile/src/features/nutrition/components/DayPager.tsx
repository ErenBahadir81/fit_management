import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { WEEKDAYS_TR_SHORT, keyWeekday } from "@fitfloow/core";
import { haptic } from "../../../lib/haptics";
import { todayKey } from "../../../lib/dates";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";

const ITEM_W = 52;
const GAP = spacing.sm;
const STEP = ITEM_W + GAP;

export interface DayPagerProps {
  /** Ascending date keys, oldest first. */
  days: string[];
  selected: string;
  onSelect: (dateKey: string) => void;
  /** Days that already have entries — the dot under the number. */
  loggedKeys?: ReadonlySet<string>;
  testID?: string;
}

/**
 * The date strip above the day: swipe it like a pager (it snaps day by day and selects what lands
 * in the middle) or tap a day. Today is a filled pill, logged days carry a dot. A month of 52 pt
 * cells is cheap enough for a plain ScrollView — no virtualization, no layout-event dependence.
 */
export function DayPager({ days, selected, onSelect, loggedKeys, testID = "nutrition-day-pager" }: DayPagerProps) {
  const { colors } = useTheme();
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const today = todayKey();
  const index = Math.max(0, days.indexOf(selected));
  const settling = useRef(false);
  // Start on the selected day (usually today) instead of a month ago — `contentOffset` positions
  // the strip on the very first frame, no post-layout jump. Fixed at mount on purpose.
  const [initialOffset] = useState(() => ({ x: index * STEP, y: 0 }));

  const sidePad = width > 0 ? Math.max(spacing.gutter, (width - ITEM_W) / 2) : spacing.gutter;

  // Keep the selected day centred when it changes from outside (tap, "Bugün", deep link).
  useEffect(() => {
    if (width === 0 || settling.current) return;
    scroller.current?.scrollTo({ x: index * STEP, animated: true });
  }, [index, width]);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / STEP);
      const key = days[Math.min(Math.max(i, 0), days.length - 1)];
      settling.current = false;
      if (key && key !== selected) {
        void haptic.select();
        onSelect(key);
      }
    },
    [days, onSelect, selected]
  );
  const onBeginDrag = useCallback(() => {
    settling.current = true;
  }, []);

  const contentStyle = useMemo(() => ({ paddingHorizontal: sidePad, gap: GAP }), [sidePad]);

  return (
    <View testID={testID} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={[styles.wrap, { borderBottomColor: colors.border }]}>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={STEP}
        decelerationRate="fast"
        contentOffset={initialOffset}
        onScrollBeginDrag={onBeginDrag}
        onMomentumScrollEnd={onMomentumEnd}
        contentContainerStyle={contentStyle}
        accessibilityLabel="Gün seçici"
      >
        {days.map((key) => (
          <DayCell key={key} dateKey={key} selected={key === selected} isToday={key === today} logged={Boolean(loggedKeys?.has(key))} onSelect={onSelect} />
        ))}
      </ScrollView>
    </View>
  );
}

const DayCell = memo(function DayCell({ dateKey, selected, isToday, logged, onSelect }: { dateKey: string; selected: boolean; isToday: boolean; logged: boolean; onSelect: (key: string) => void }) {
  const { colors } = useTheme();
  const dayNumber = Number(dateKey.slice(8, 10));
  const label = WEEKDAYS_TR_SHORT[keyWeekday(dateKey)];
  const press = useCallback(() => {
    if (!selected) onSelect(dateKey);
  }, [dateKey, onSelect, selected]);

  return (
    <Pressable
      testID={`day-${dateKey}`}
      onPress={press}
      haptic="select"
      minTarget={false}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} ${dayNumber}${isToday ? ", bugün" : ""}${logged ? ", kayıtlı" : ""}`}
      style={[styles.cell, selected && { backgroundColor: colors.primary }]}
    >
      <Text variant="caption" color={selected ? "onPrimary" : "inkSubtle"}>
        {label}
      </Text>
      <Text variant="title" tabular color={selected ? "onPrimary" : isToday ? "primary" : "ink"}>
        {dayNumber}
      </Text>
      <View style={[styles.dot, logged && { backgroundColor: selected ? colors.onPrimary : colors.primary }]} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -spacing.gutter },
  cell: { width: ITEM_W, height: 64, borderRadius: radii.md, alignItems: "center", justifyContent: "center", gap: 1 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: "transparent" },
});
