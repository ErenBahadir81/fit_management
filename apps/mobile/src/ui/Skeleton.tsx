import React, { useEffect, useState } from "react";
import { StyleSheet, View, type DimensionValue, type ViewProps } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";
import { spacing } from "../theme/tokens";

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);
const SHIMMER_MS = 1200;

export interface SkeletonProps extends ViewProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  circle?: boolean;
}

/**
 * A placeholder block with a diagonal shimmer (1.2 s loop, UI thread). Skeletons mirror the real
 * layout (same heights) so the 200 ms crossfade to content has zero layout jump.
 */
export function Skeleton({ width = "100%", height = 16, radius = 8, circle, style, ...rest }: SkeletonProps) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const [w, setW] = useState(240);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    progress.value = 0;
    progress.value = withRepeat(withTiming(1, { duration: SHIMMER_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(progress);
  }, [progress, reduce]);

  const shimmer = useAnimatedStyle(() => ({ transform: [{ translateX: -w + progress.value * (w * 2) }, { skewX: "-20deg" }] }));
  const size = circle ? { width: height, height, borderRadius: height / 2 } : { width, height, borderRadius: radius };

  return (
    <View
      {...rest}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setW(Math.max(80, e.nativeEvent.layout.width))}
      style={[styles.base, { backgroundColor: colors.skeleton }, size, style]}
    >
      {!reduce && (
        <AnimatedGradient
          colors={["transparent", colors.skeletonHighlight, "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[StyleSheet.absoluteFill, { width: w }, shimmer]}
        />
      )}
    </View>
  );
}

/** N text lines; the last one is shorter, like real copy. */
export function SkeletonText({ lines = 2, lineHeight = 14, gap = spacing.sm, lastWidth = "60%", testID }: { lines?: number; lineHeight?: number; gap?: number; lastWidth?: DimensionValue; testID?: string }) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} testID={testID ? `${testID}-${i}` : undefined} height={lineHeight} width={i === lines - 1 && lines > 1 ? lastWidth : "100%"} />
      ))}
    </View>
  );
}

/** Groups skeleton blocks and hides the whole thing from screen readers. */
export function SkeletonGroup({ style, children, ...rest }: ViewProps) {
  return (
    <View {...rest} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" accessibilityLabel="Yükleniyor" style={style}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ base: { overflow: "hidden" } });
