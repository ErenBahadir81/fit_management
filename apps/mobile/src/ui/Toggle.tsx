import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";
import { springs, timing } from "../theme/motion";
import { Pressable, type PressableProps } from "./Pressable";

export interface ToggleProps extends Omit<PressableProps, "onPress" | "children" | "style"> {
  value: boolean;
  onChange: (next: boolean) => void;
}

const W = 51;
const H = 31;
const KNOB = 27;

/** Animated switch (role=switch). */
export function Toggle({ value, onChange, disabled, testID, ...rest }: ToggleProps) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const p = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    p.value = reduce ? withTiming(value ? 1 : 0, timing.reduced) : withSpring(value ? 1 : 0, springs.snappy);
  }, [value, reduce, p]);
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(p.value, [0, 1], [colors.borderStrong, colors.primary]) }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * (W - KNOB - 4) }] }));

  return (
    <Pressable
      {...rest}
      testID={testID}
      onPress={() => onChange(!value)}
      disabled={disabled}
      haptic="select"
      minTarget={false}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      style={styles.hit}
    >
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.knob, { backgroundColor: "#FFFFFF" }, knob]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { paddingVertical: 6 },
  track: { width: W, height: H, borderRadius: H / 2, padding: 2, justifyContent: "center" },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
});
