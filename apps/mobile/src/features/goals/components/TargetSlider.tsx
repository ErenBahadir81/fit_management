import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, type AccessibilityActionEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { fmtPct } from "../../../lib/format";
import { haptic } from "../../../lib/haptics";
import { useTheme } from "../../../theme/ThemeProvider";
import { springs, timing } from "../../../theme/motion";
import { radii, spacing } from "../../../theme/tokens";
import { Text } from "../../../ui/Text";
import { TARGET_STEP, snapTarget, type Bounds } from "../goalMath";

export interface TargetSliderProps {
  value: number;
  bounds: Bounds;
  onChange: (v: number) => void;
  testID?: string;
}

const THUMB = 28;
const TRACK_H = 6;

/**
 * Target body-fat slider: 0.5-point grid, clamped to [essential floor, current − 0.5]. The thumb
 * follows the finger on the UI thread; every grid step gives a selection tick and one `onChange`.
 * Accessible as an adjustable (increment / decrement actions).
 */
export function TargetSlider({ value, bounds, onChange, testID }: TargetSliderProps) {
  const { colors, shadows } = useTheme();
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const disabled = bounds.max <= bounds.min;
  const range = Math.max(TARGET_STEP, bounds.max - bounds.min);
  const usable = Math.max(1, width - THUMB);
  const min = bounds.min;
  const max = bounds.max;

  const x = useSharedValue(0);
  const active = useSharedValue(0);
  const last = useSharedValue(value);

  useEffect(() => {
    const target = ((value - min) / range) * usable;
    x.set(reduce ? withTiming(target, timing.reduced) : withSpring(target, springs.snappy));
    last.set(value);
  }, [value, min, range, usable, reduce, x, last]);

  const tick = useCallback(
    (v: number) => {
      void haptic.select();
      onChange(v);
    },
    [onChange]
  );

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(0)
    .onBegin((e) => {
      active.set(withSpring(1, springs.snappy));
      const px = Math.min(Math.max(e.x - THUMB / 2, 0), usable);
      x.set(px);
      const raw = min + (px / usable) * range;
      const v = Math.min(Math.max(Math.round(raw / TARGET_STEP) * TARGET_STEP, min), max);
      if (v !== last.get()) {
        last.set(v);
        runOnJS(tick)(v);
      }
    })
    .onUpdate((e) => {
      const px = Math.min(Math.max(e.x - THUMB / 2, 0), usable);
      x.set(px);
      const raw = min + (px / usable) * range;
      const v = Math.min(Math.max(Math.round(raw / TARGET_STEP) * TARGET_STEP, min), max);
      if (v !== last.get()) {
        last.set(v);
        runOnJS(tick)(v);
      }
    })
    .onFinalize(() => {
      active.set(withSpring(0, springs.snappy));
      const target = ((last.get() - min) / range) * usable;
      x.set(reduce ? withTiming(target, timing.reduced) : withSpring(target, springs.snappy));
    });

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { scale: 1 + active.get() * 0.18 }] }));
  const fill = useAnimatedStyle(() => ({ width: x.get() + THUMB / 2 }));
  const label = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() + THUMB / 2 }, { translateY: -active.get() * 6 }], opacity: 0.6 + active.get() * 0.4 }));

  const onAction = (e: AccessibilityActionEvent) => {
    const dir = e.nativeEvent.actionName === "increment" ? 1 : e.nativeEvent.actionName === "decrement" ? -1 : 0;
    if (!dir || disabled) return;
    const next = snapTarget(value + dir * TARGET_STEP, bounds);
    if (next !== value) tick(next);
  };

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Hedef yağ oranı"
      accessibilityValue={{ min, max, now: value, text: fmtPct(value) }}
      accessibilityState={{ disabled }}
      accessibilityActions={[
        { name: "increment", label: "Artır" },
        { name: "decrement", label: "Azalt" },
      ]}
      onAccessibilityAction={onAction}
      style={[styles.wrap, disabled && styles.disabled]}
    >
      <View style={styles.labelRow} pointerEvents="none">
        <Animated.View style={[styles.floating, label]}>
          <View style={[styles.bubble, { backgroundColor: colors.ink }]}>
            <Text variant="label" color="inkInverse" tabular>
              {fmtPct(value)}
            </Text>
          </View>
        </Animated.View>
      </View>
      <GestureDetector gesture={pan}>
        <View style={styles.hit} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} collapsable={false}>
          <View style={[styles.track, { backgroundColor: colors.ringTrack }]} />
          <Animated.View style={[styles.track, styles.fill, { backgroundColor: colors.primary }, fill]} />
          <Animated.View style={[styles.thumb, { backgroundColor: colors.surface, borderColor: colors.primary }, shadows.card, thumb]} />
        </View>
      </GestureDetector>
      <View style={styles.ends}>
        <Text variant="caption" color="inkSubtle" tabular>
          {fmtPct(min, 0)} sınır
        </Text>
        <Text variant="caption" color="inkSubtle" tabular>
          {fmtPct(max, 1)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: spacing.xs },
  disabled: { opacity: 0.5 },
  labelRow: { height: 34, justifyContent: "flex-end" },
  floating: { position: "absolute", left: 0, bottom: 2, marginLeft: -28, width: 56, alignItems: "center" },
  bubble: { borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  hit: { height: 44, justifyContent: "center" },
  track: { position: "absolute", left: THUMB / 2, right: THUMB / 2, height: TRACK_H, borderRadius: TRACK_H / 2 },
  fill: { right: undefined, left: 0 },
  thumb: { position: "absolute", left: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 3 },
  ends: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
});
