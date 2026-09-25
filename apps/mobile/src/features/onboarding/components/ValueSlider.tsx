import React, { forwardRef, useCallback, useEffect, useState } from "react";
import { StyleSheet, View, type AccessibilityActionEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { round } from "@fitfloow/core";
import { haptic } from "../../../lib/haptics";
import { useTheme } from "../../../theme/ThemeProvider";
import { springs, timing } from "../../../theme/motion";
import { radii, spacing } from "../../../theme/tokens";
import { Text } from "../../../ui/Text";
import { BOING, usePop } from "./Juice";

export interface ValueSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  /** Read out as the control's name, e.g. "Hedef yağ oranı". */
  label: string;
  /** Captions under the two ends. */
  minCaption?: string;
  maxCaption?: string;
  /** Fires on release, e.g. to let Floo react once rather than on every tick. */
  onRelease?: () => void;
  testID?: string;
}

const THUMB = 28;
const TRACK_H = 6;

/**
 * A grid slider for the goal number (body-fat % or kg of lean mass). The thumb follows the finger
 * on the UI thread; each grid step gives one selection tick and one `onChange`, so the plan under
 * it redraws per step, not per pixel. Accessible as an adjustable with increment / decrement.
 */
export const ValueSlider = forwardRef<View, ValueSliderProps>(function ValueSlider(
  { value, min, max, step, onChange, format, label, minCaption, maxCaption, onRelease, testID },
  ref
) {
  const { colors, shadows } = useTheme();
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const disabled = max <= min;
  const range = Math.max(step, max - min);
  const usable = Math.max(1, width - THUMB);

  const x = useSharedValue(0);
  const active = useSharedValue(0);
  const last = useSharedValue(value);

  useEffect(() => {
    const target = ((Math.min(Math.max(value, min), max) - min) / range) * usable;
    x.set(reduce ? withTiming(target, timing.reduced) : withSpring(target, springs.snappy));
    last.set(value);
  }, [value, min, max, range, usable, reduce, x, last]);

  const tick = useCallback(
    (v: number) => {
      void haptic.select();
      onChange(v);
    },
    [onChange]
  );
  const release = useCallback(() => onRelease?.(), [onRelease]);

  const follow = (ex: number) => {
    "worklet";
    const px = Math.min(Math.max(ex - THUMB / 2, 0), usable);
    x.set(px);
    const raw = min + (px / usable) * range;
    const v = Math.round(Math.min(Math.max(Math.round(raw / step) * step, min), max) * 10) / 10;
    if (v !== last.get()) {
      last.set(v);
      runOnJS(tick)(v);
    }
  };

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(0)
    .onBegin((e) => {
      active.set(reduce ? withTiming(1, timing.reduced) : withSpring(1, BOING));
      follow(e.x);
    })
    .onUpdate((e) => follow(e.x))
    .onFinalize(() => {
      active.set(reduce ? withTiming(0, timing.reduced) : withSpring(0, BOING));
      const target = ((last.get() - min) / range) * usable;
      x.set(reduce ? withTiming(target, timing.reduced) : withSpring(target, springs.snappy));
      runOnJS(release)();
    });

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { scale: 1 + active.get() * 0.45 }] }));
  const fill = useAnimatedStyle(() => ({ width: x.get() + THUMB / 2 }));
  const bubble = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() + THUMB / 2 }, { translateY: -active.get() * 14 }, { scale: 1 + active.get() * 0.2 }], opacity: 0.7 + active.get() * 0.3 }));
  // Every grid step the value bubble boings, so each tick is felt as well as heard.
  const tickPop = usePop(value, { amount: 0.18 });

  const onAction = (e: AccessibilityActionEvent) => {
    const dir = e.nativeEvent.actionName === "increment" ? 1 : e.nativeEvent.actionName === "decrement" ? -1 : 0;
    if (!dir || disabled) return;
    const next = round(Math.min(Math.max(value + dir * step, min), max), 1);
    if (next !== value) {
      tick(next);
      release();
    }
  };

  return (
    <View
      ref={ref}
      collapsable={false}
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: format(value) }}
      accessibilityState={{ disabled }}
      accessibilityActions={[
        { name: "increment", label: "Artır" },
        { name: "decrement", label: "Azalt" },
      ]}
      onAccessibilityAction={onAction}
      style={[styles.wrap, disabled && styles.disabled]}
    >
      <View style={styles.labelRow} pointerEvents="none">
        <Animated.View style={[styles.floating, bubble]}>
          <Animated.View style={[styles.bubble, { backgroundColor: colors.ink }, tickPop]}>
            <Text variant="label" color="inkInverse" tabular testID={testID ? `${testID}-value` : undefined}>
              {format(value)}
            </Text>
          </Animated.View>
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
          {minCaption ?? format(min)}
        </Text>
        <Text variant="caption" color="inkSubtle" tabular>
          {maxCaption ?? format(max)}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingTop: spacing.xs },
  disabled: { opacity: 0.5 },
  labelRow: { height: 34, justifyContent: "flex-end" },
  floating: { position: "absolute", left: 0, bottom: 2, marginLeft: -36, width: 72, alignItems: "center" },
  bubble: { borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  hit: { height: 44, justifyContent: "center" },
  track: { position: "absolute", left: THUMB / 2, right: THUMB / 2, height: TRACK_H, borderRadius: TRACK_H / 2 },
  fill: { right: undefined, left: 0 },
  thumb: { position: "absolute", left: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 3 },
  ends: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
});
