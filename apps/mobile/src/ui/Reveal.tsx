import React, { useEffect, useState } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import Animated, { FadeIn, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { durations, easeOut } from "../theme/motion";

export interface RevealProps extends ViewProps {
  /** True as soon as there is data (cached or fresh). */
  ready: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Skeleton → content with a 200 ms crossfade and no layout jump.
 * If `ready` on first render (persisted cache hit) the skeleton is never mounted: instant paint.
 */
export function Reveal({ ready, skeleton, children, style, ...rest }: RevealProps) {
  // Fixed on first render: whether this mount ever painted the skeleton (drives the crossfade).
  const [showedSkeleton] = useState(!ready);
  // Flips once the skeleton overlay has faded out (set from the animation callback, never in render).
  const [faded, setFaded] = useState(false);
  const opacity = useSharedValue(1);
  const overlay = showedSkeleton && ready && !faded;

  useEffect(() => {
    if (!overlay) return;
    opacity.set(1);
    opacity.set(
      withTiming(0, { duration: durations.base, easing: easeOut }, (finished) => {
        if (finished) runOnJS(setFaded)(true);
      })
    );
  }, [overlay, opacity]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  if (!ready) {
    return (
      <View {...rest} style={style}>
        {skeleton}
      </View>
    );
  }
  return (
    <View {...rest} style={style}>
      <Animated.View entering={showedSkeleton ? FadeIn.duration(durations.base) : undefined}>{children}</Animated.View>
      {overlay && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, overlayStyle]}>
          {skeleton}
        </Animated.View>
      )}
    </View>
  );
}
