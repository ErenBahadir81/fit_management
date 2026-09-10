import React, { useEffect, useState } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";
import { springs, timing } from "../theme/motion";
import { radii, spacing } from "../theme/tokens";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}
export interface SegmentedProps<T extends string> extends ViewProps {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}

const PAD = 3;

/** iOS-style segmented control with a spring-sliding pill. Selection haptic on switch. */
export function Segmented<T extends string>({ options, value, onChange, size = "md", testID, style, ...rest }: SegmentedProps<T>) {
  const { colors, shadows } = useTheme();
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const segW = width > 0 ? (width - PAD * 2) / options.length : 0;
  const x = useSharedValue(index * segW);
  useEffect(() => {
    x.value = reduce ? withTiming(index * segW, timing.reduced) : withSpring(index * segW, springs.snappy);
  }, [index, segW, reduce, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const h = size === "sm" ? 34 : 40;

  return (
    <View
      {...rest}
      testID={testID}
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: colors.surfaceMuted, height: h + PAD * 2 }, style]}
    >
      {segW > 0 && <Animated.View style={[styles.pill, { width: segW, height: h, backgroundColor: colors.surface }, shadows.card, pill]} />}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={testID ? `${testID}-${o.value}` : undefined}
            onPress={() => {
              if (!selected) onChange(o.value);
            }}
            haptic="select"
            minTarget={false}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            style={[styles.seg, { height: h }]}
          >
            <Text variant="label" color={selected ? "ink" : "inkMuted"} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: radii.control, padding: PAD, alignSelf: "stretch" },
  pill: { position: "absolute", top: PAD, left: PAD, borderRadius: radii.control - 2 },
  seg: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm },
});
