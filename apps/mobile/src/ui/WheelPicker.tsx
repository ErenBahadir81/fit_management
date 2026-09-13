import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { ScrollView, StyleSheet, View, type AccessibilityActionEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { haptic } from "../lib/haptics";
import { useTheme } from "../theme/ThemeProvider";
import { radii, spacing } from "../theme/tokens";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

/** Row height. Three rows visible above and below the band keep the wheel readable on a small phone. */
export const WHEEL_ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;
export const WHEEL_HEIGHT = WHEEL_ROW_HEIGHT * VISIBLE_ROWS;
const PAD = (WHEEL_HEIGHT - WHEEL_ROW_HEIGHT) / 2;

export interface WheelOption<T> {
  value: T;
  label: string;
}

export interface WheelPickerProps<T> {
  options: readonly WheelOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Screen-reader name for the column ("Gün", "Ay", "Yıl"). */
  label: string;
  testID?: string;
}

/**
 * A snapping column picker — the control iOS users already know, built from a ScrollView so it
 * needs no native dependency. Rows snap to the centre band; settling on a new row fires one
 * `onChange` and one selection tick. Screen readers get an adjustable with increment/decrement,
 * and every row is also directly tappable, so the wheel is never the *only* way to answer.
 */
export function WheelPicker<T extends string | number>({ options, value, onChange, label, testID }: WheelPickerProps<T>) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const ref = useRef<ScrollView>(null);
  const index = useMemo(() => Math.max(0, options.findIndex((o) => o.value === value)), [options, value]);
  // Guards the settle handler against re-firing for the row we just programmatically scrolled to.
  const settled = useRef(index);

  useEffect(() => {
    settled.current = index;
    ref.current?.scrollTo({ y: index * WHEEL_ROW_HEIGHT, animated: !reduce });
  }, [index, reduce]);

  const pick = useCallback(
    (i: number) => {
      const next = options[i];
      if (!next || next.value === value) return;
      void haptic.select();
      onChange(next.value);
    },
    [onChange, options, value]
  );

  const onSettle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const raw = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ROW_HEIGHT);
      const i = Math.min(Math.max(raw, 0), options.length - 1);
      if (i === settled.current) return;
      settled.current = i;
      pick(i);
    },
    [options.length, pick]
  );

  const onAction = useCallback(
    (e: AccessibilityActionEvent) => {
      const dir = e.nativeEvent.actionName === "increment" ? 1 : e.nativeEvent.actionName === "decrement" ? -1 : 0;
      if (!dir) return;
      const i = index + dir;
      if (i < 0 || i > options.length - 1) return; // ends do not wrap
      pick(i);
    },
    [index, options.length, pick]
  );

  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={[styles.band, { backgroundColor: colors.primarySoft, borderColor: colors.border }]} />
      <ScrollView
        ref={ref}
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: options[index]?.label ?? "" }}
        accessibilityActions={ACTIONS}
        onAccessibilityAction={onAction}
        showsVerticalScrollIndicator={false}
        // The picker usually sits inside a scrolling screen; without this the parent eats the drag
        // on Android. iOS gives the inner scroll view the gesture that starts inside it already.
        nestedScrollEnabled
        snapToInterval={WHEEL_ROW_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={onSettle}
        contentContainerStyle={styles.content}
        style={styles.scroll}
      >
        {options.map((o, i) => (
          <Pressable
            key={String(o.value)}
            onPress={() => pick(i)}
            haptic="none"
            minTarget={false}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: i === index }}
            testID={testID ? `${testID}-option-${o.value}` : undefined}
            style={styles.row}
          >
            <Text variant={i === index ? "title" : "body"} color={i === index ? "ink" : "inkSubtle"} tabular numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const ACTIONS = [
  { name: "increment", label: "Sonraki" },
  { name: "decrement", label: "Önceki" },
];

const styles = StyleSheet.create({
  wrap: { height: WHEEL_HEIGHT, justifyContent: "center" },
  scroll: { height: WHEEL_HEIGHT },
  content: { paddingVertical: PAD },
  band: { position: "absolute", left: 0, right: 0, top: PAD, height: WHEEL_ROW_HEIGHT, borderRadius: radii.control, borderWidth: StyleSheet.hairlineWidth },
  row: { height: WHEEL_ROW_HEIGHT, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xs },
});
