import React from "react";
import { Platform, View } from "react-native";
import Animated, { useReducedMotion, type AnimatedProps } from "react-native-reanimated";
import type { ViewProps } from "react-native";
import { enterCard } from "../theme/motion";

export interface EntryProps extends AnimatedProps<ViewProps> {
  /** Position in the screen's card list: drives the 30 ms stagger (capped at 6). */
  index?: number;
  children?: React.ReactNode;
}

/**
 * Staggered fade + 12 px rise for screen content. Wrap each card.
 *
 * Web renders without the entering animation on purpose: Reanimated implements entering layout
 * animations there by switching the element to `position: absolute`, which takes every animated
 * card out of flow and makes screen content overlap. Correct layout beats a 200 ms flourish, and
 * native — where the animation is actually seen — is unaffected.
 */
export function Entry({ index = 0, children, ...rest }: EntryProps) {
  const reduce = useReducedMotion();
  if (Platform.OS === "web") {
    return <View {...(rest as ViewProps)}>{children}</View>;
  }
  return (
    <Animated.View entering={enterCard(index, reduce)} {...rest}>
      {children}
    </Animated.View>
  );
}
