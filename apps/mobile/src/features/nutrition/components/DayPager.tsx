import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
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
/** How long the strip must sit still before a web swipe counts as settled (no momentum events). */
const WEB_SETTLE_MS = 140;

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

  const settleAt = useCallback(
    (offsetX: number) => {
      const i = Math.round(offsetX / STEP);
      const key = days[Math.min(Math.max(i, 0), days.length - 1)];
      settling.current = false;
      if (!key) return;
      if (key !== selected) {
        void haptic.select();
        onSelect(key);
      } else {
        scroller.current?.scrollTo({ x: i * STEP, animated: true }); // snap back onto the cell
      }
    },
    [days, onSelect, selected]
  );

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => settleAt(e.nativeEvent.contentOffset.x), [settleAt]);
  const onBeginDrag = useCallback(() => {
    settling.current = true;
  }, []);

  /**
   * react-native-web's ScrollView only ever emits `onScroll` — `onMomentumScrollEnd` and
   * `onScrollEndDrag` never fire and `snapToInterval` is ignored — so on web the swipe selected
   * nothing at all. Settle the strip ourselves once it has stopped moving.
   */
  const webSettle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (webSettle.current) clearTimeout(webSettle.current);
  }, []);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (Platform.OS !== "web") return;
      const x = e.nativeEvent.contentOffset.x;
      settling.current = true;
      if (webSettle.current) clearTimeout(webSettle.current);
      webSettle.current = setTimeout(() => settleAt(x), WEB_SETTLE_MS);
    },
    [settleAt]
  );

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
        onScroll={onScroll}
        scrollEventThrottle={16}
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
