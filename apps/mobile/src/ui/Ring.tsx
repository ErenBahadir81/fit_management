import React, { useEffect } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { clamp } from "@fitfloow/core";
import { useTheme } from "../theme/ThemeProvider";
import { springs, timing } from "../theme/motion";
import { absoluteFill, type Tone } from "../theme/tokens";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function ringGeometry(size: number, stroke: number, value: number) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const v = clamp(value, 0, 1);
  return { r, circumference, dashOffset: circumference * (1 - v), value: v };
}

export interface RingProps extends ViewProps {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  /** Raw color overrides tone. */
  color?: string;
  gradient?: boolean;
  trackColor?: string;
  children?: React.ReactNode;
}

/** Progress ring (SVG) — the calorie / recovery / score hero. Animates on value change. */
export function Ring({ value, size = 120, stroke, tone = "primary", color, gradient = true, trackColor, children, style, ...rest }: RingProps) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const sw = stroke ?? Math.max(6, Math.round(size * 0.09));
  const { r, circumference, dashOffset, value: v } = ringGeometry(size, sw, value);
  const offset = useSharedValue(dashOffset);
  useEffect(() => {
    offset.value = reduce ? withTiming(dashOffset, timing.reduced) : withSpring(dashOffset, springs.gentle);
  }, [dashOffset, reduce, offset]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));

  const toneColor = { primary: colors.primary, success: colors.success, warning: colors.warning, danger: colors.danger, neutral: colors.inkSubtle }[tone];
  const strokeColor = color ?? toneColor;
  const useGradient = gradient && !color && tone === "primary";
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, "");

  return (
    <View
      {...rest}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      style={[{ width: size, height: size }, style]}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.gradient[0]} />
            <Stop offset="1" stopColor={colors.gradient[1]} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor ?? colors.ringTrack} strokeWidth={sw} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={useGradient ? `url(#g${id})` : strokeColor}
          strokeWidth={sw}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ center: { ...absoluteFill, alignItems: "center", justifyContent: "center" } });
