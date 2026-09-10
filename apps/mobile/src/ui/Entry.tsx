import React from "react";
import Animated, { useReducedMotion, type AnimatedProps } from "react-native-reanimated";
import type { ViewProps } from "react-native";
import { enterCard } from "../theme/motion";

export interface EntryProps extends AnimatedProps<ViewProps> {
  /** Position in the screen's card list: drives the 30 ms stagger (capped at 6). */
  index?: number;
  children?: React.ReactNode;
}

/** Staggered fade + 12 px rise for screen content. Wrap each card. */
export function Entry({ index = 0, children, ...rest }: EntryProps) {
  const reduce = useReducedMotion();
  return (
    <Animated.View entering={enterCard(index, reduce)} {...rest}>
      {children}
    </Animated.View>
  );
}
