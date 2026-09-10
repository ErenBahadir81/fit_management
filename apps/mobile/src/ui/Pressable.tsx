import React, { useCallback } from "react";
import { Pressable as RNPressable, type GestureResponderEvent, type PressableProps as RNPressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { haptic as haptics, type HapticKind } from "../lib/haptics";
import { PRESS_SCALE, springs, timing } from "../theme/motion";
import { spacing } from "../theme/tokens";

const AnimatedRNPressable = Animated.createAnimatedComponent(RNPressable);

export type PressHaptic = Extract<HapticKind, "tap" | "select" | "medium"> | "none";

export interface PressableProps extends Omit<RNPressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  /** Haptic on press-in (default `tap` = light impact). */
  haptic?: PressHaptic;
  /** Scale target while pressed (default 0.97). */
  scaleTo?: number;
  /** Enforce the 44 pt minimum touch target (default true). */
  minTarget?: boolean;
}

/**
 * The one pressable. Scale 0.97 spring + light haptic on press-in, spring back on release.
 * Reduced motion → 150 ms timing. Always has a role and a 44 pt target.
 */
export function Pressable({
  haptic = "tap",
  scaleTo = PRESS_SCALE,
  minTarget = true,
  disabled,
  onPressIn,
  onPressOut,
  onPress,
  style,
  accessibilityRole = "button",
  accessibilityState,
  children,
  ...rest
}: PressableProps) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  const animate = useCallback(
    (to: number) => {
      scale.set(reduceMotion ? withTiming(to, timing.reduced) : withSpring(to, springs.snappy));
    },
    [reduceMotion, scale]
  );

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      if (disabled) return;
      animate(scaleTo);
      if (haptic !== "none") void haptics[haptic]();
      onPressIn?.(e);
    },
    [animate, disabled, haptic, onPressIn, scaleTo]
  );
  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      if (disabled) return;
      animate(1);
      onPressOut?.(e);
    },
    [animate, disabled, onPressOut]
  );
  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (disabled) return;
      onPress?.(e);
    },
    [disabled, onPress]
  );

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedRNPressable
      {...rest}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: Boolean(disabled), ...accessibilityState }}
      hitSlop={rest.hitSlop ?? 4}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={[minTarget && { minHeight: spacing.touch }, disabled && { opacity: 0.5 }, style, animatedStyle]}
    >
      {children}
    </AnimatedRNPressable>
  );
}
