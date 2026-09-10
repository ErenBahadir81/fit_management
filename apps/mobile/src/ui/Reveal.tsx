import React, { useEffect, useRef, useState } from "react";
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
  const showedSkeleton = useRef(!ready);
  const [overlay, setOverlay] = useState(false);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (ready && showedSkeleton.current) {
      setOverlay(true);
      opacity.value = 1;
      opacity.value = withTiming(0, { duration: durations.base, easing: easeOut }, (finished) => {
        if (finished) runOnJS(setOverlay)(false);
      });
    }
  }, [ready, opacity]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!ready) {
    return (
      <View {...rest} style={style}>
        {skeleton}
      </View>
    );
  }
  return (
    <View {...rest} style={style}>
      <Animated.View entering={showedSkeleton.current ? FadeIn.duration(durations.base) : undefined}>{children}</Animated.View>
      {overlay && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, overlayStyle]}>
          {skeleton}
        </Animated.View>
      )}
    </View>
  );
}
