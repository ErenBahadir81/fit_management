import React, { useEffect } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import Animated, { useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { haptic } from "../lib/haptics";
import { useTheme } from "../theme/ThemeProvider";
import { easeOutStrong, springs } from "../theme/motion";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK_LEN = 40;

export interface SuccessCheckProps extends ViewProps {
  size?: number;
  /** Fire the success haptic on mount (default true). */
  withHaptic?: boolean;
}

/** Confetti-free success: a circle pops in from 0.6 (bouncy spring + fade, never from 0) and a check draws itself (320 ms). */
export function SuccessCheck({ size = 72, withHaptic = true, style, ...rest }: SuccessCheckProps) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const scale = useSharedValue(reduce ? 1 : 0.6);
  const shown = useSharedValue(reduce ? 1 : 0);
  const dash = useSharedValue(reduce ? 0 : CHECK_LEN);

  useEffect(() => {
    if (withHaptic) void haptic.success();
    if (reduce) return;
    scale.value = withSpring(1, springs.bouncy);
    shown.value = withTiming(1, { duration: 160, easing: easeOutStrong });
    dash.value = withDelay(120, withTiming(0, { duration: 320, easing: easeOutStrong }));
  }, [dash, reduce, scale, shown, withHaptic]);

  const circle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: scale.value }] }));
  const pathProps = useAnimatedProps(() => ({ strokeDashoffset: dash.value }));

  return (
    <View {...rest} style={[{ width: size, height: size }, style]} accessibilityLabel="Başarılı" accessibilityRole="image">
      <Animated.View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.successSoft }, circle]}>
        <Svg width={size * 0.55} height={size * 0.55} viewBox="0 0 32 32">
          <AnimatedPath
            d="M6 17 L13 24 L26 9"
            stroke={colors.success}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={`${CHECK_LEN} ${CHECK_LEN}`}
            animatedProps={pathProps}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({ circle: { alignItems: "center", justifyContent: "center" } });
