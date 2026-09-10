import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
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
 * in the middle) or tap a day. Today is a filled pill, logged days carry a dot.
 */
export function DayPager({ days, selected, onSelect, loggedKeys, testID = "nutrition-day-pager" }: DayPagerProps) {
  const { colors } = useTheme();
  const listRef = useRef<FlatList<string>>(null);
  const [width, setWidth] = useState(0);
  const today = todayKey();
  const index = Math.max(0, days.indexOf(selected));
  const settling = useRef(false);

  const sidePad = width > 0 ? Math.max(spacing.gutter, (width - ITEM_W) / 2) : spacing.gutter;

  // Keep the selected day centred when it changes from outside (tap, "Bugün", deep link).
  useEffect(() => {
    if (width === 0 || settling.current) return;
    listRef.current?.scrollToOffset({ offset: index * STEP, animated: true });
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

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <DayCell
        dateKey={item}
        selected={item === selected}
        isToday={item === today}
        logged={Boolean(loggedKeys?.has(item))}
        onPress={() => {
          if (item !== selected) onSelect(item);
        }}
      />
    ),
    [loggedKeys, onSelect, selected, today]
  );

  const contentStyle = useMemo(() => ({ paddingHorizontal: sidePad, gap: GAP }), [sidePad]);

  return (
    <View testID={testID} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={[styles.wrap, { borderBottomColor: colors.border }]}>
      <FlatList
        ref={listRef}
        horizontal
        data={days}
        keyExtractor={(k) => k}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        snapToInterval={STEP}
        decelerationRate="fast"
        initialScrollIndex={undefined}
        getItemLayout={(_, i) => ({ length: STEP, offset: STEP * i, index: i })}
        onScrollBeginDrag={() => {
          settling.current = true;
        }}
        onMomentumScrollEnd={onMomentumEnd}
        contentContainerStyle={contentStyle}
        accessibilityLabel="Gün seçici"
      />
    </View>
  );
}

function DayCell({ dateKey, selected, isToday, logged, onPress }: { dateKey: string; selected: boolean; isToday: boolean; logged: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const dayNumber = Number(dateKey.slice(8, 10));
  const label = WEEKDAYS_TR_SHORT[keyWeekday(dateKey)];
  const bg = selected ? colors.primary : "transparent";
  const fg = selected ? colors.onPrimary : isToday ? colors.primary : colors.ink;

  return (
    <Pressable
      testID={`day-${dateKey}`}
      onPress={onPress}
      haptic="select"
      minTarget={false}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} ${dayNumber}${isToday ? ", bugün" : ""}${logged ? ", kayıtlı" : ""}`}
      style={[styles.cell, { width: ITEM_W, backgroundColor: bg }]}
    >
      <Text variant="caption" style={{ color: selected ? colors.onPrimary : colors.inkSubtle }}>
        {label}
      </Text>
      <Text variant="title" tabular style={{ color: fg }}>
        {dayNumber}
      </Text>
      <View style={[styles.dot, { backgroundColor: logged ? (selected ? colors.onPrimary : colors.primary) : "transparent" }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -spacing.gutter },
  cell: { height: 64, borderRadius: radii.md, alignItems: "center", justifyContent: "center", gap: 1 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
});
