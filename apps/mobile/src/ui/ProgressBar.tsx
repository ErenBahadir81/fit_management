import React, { useEffect } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { clamp } from "@fitfloow/core";
import { useTheme } from "../theme/ThemeProvider";
import { springs, timing } from "../theme/motion";
import { radii, spacing, type Tone } from "../theme/tokens";
import { Text } from "./Text";

export interface ProgressBarProps extends ViewProps {
  /** 0..1 (clamped). */
  value: number;
  tone?: Tone;
  height?: number;
  label?: string;
  valueLabel?: string;
}

/** Animated horizontal progress (spring), with optional label row. */
export function ProgressBar({ value, tone = "primary", height = 8, label, valueLabel, style, ...rest }: ProgressBarProps) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const pct = clamp(value, 0, 1) * 100;
  const w = useSharedValue(pct);
  useEffect(() => {
    w.value = reduce ? withTiming(pct, timing.reduced) : withSpring(pct, springs.gentle);
  }, [pct, reduce, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  const color = { primary: colors.primary, success: colors.success, warning: colors.warning, danger: colors.danger, neutral: colors.inkSubtle }[tone];

  return (
    <View
      {...rest}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      accessibilityLabel={rest.accessibilityLabel ?? label}
      style={style}
    >
      {(label || valueLabel) && (
        <View style={styles.labels}>
          {label ? (
            <Text variant="caption" color="inkMuted">
              {label}
            </Text>
          ) : (
            <View />
          )}
          {valueLabel ? (
            <Text variant="caption" color="inkMuted" tabular>
              {valueLabel}
            </Text>
          ) : null}
        </View>
      )}
      <View style={[styles.track, { height, backgroundColor: colors.ringTrack }]}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, fill]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xs + 2 },
  track: { borderRadius: radii.pill, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radii.pill },
});
