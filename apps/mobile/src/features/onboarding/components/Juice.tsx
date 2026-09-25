import React, { useEffect, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { FadeIn, Keyframe, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";

/**
 * The onboarding's data entry is deliberately loud: every answer lands with a bounce, so filling
 * the form feels like a game rather than paperwork. Everything here collapses to a plain fade (or
 * nothing) under reduced motion.
 */

/** A loose, overshooting spring: the "boing" after each answer. */
export const BOING = { damping: 7, stiffness: 320, mass: 0.8 } as const;

/** Gap between blocks dropping in, so a step assembles itself top to bottom. */
export const DROP_STAGGER_MS = 90;

/** A block falls in from below, overshoots a little and settles. */
export function dropIn(index: number, reduce: boolean) {
  if (reduce) return FadeIn.duration(150);
  return new Keyframe({
    0: {
      opacity: 0,
      transform: [{ translateY: 36 }, { scale: 0.86 }, { rotate: "-2deg" }],
    },
    55: {
      opacity: 1,
      transform: [{ translateY: -8 }, { scale: 1.04 }, { rotate: "1deg" }],
    },
    80: {
      opacity: 1,
      transform: [{ translateY: 3 }, { scale: 0.99 }, { rotate: "0deg" }],
    },
    100: {
      opacity: 1,
      transform: [{ translateY: 0 }, { scale: 1 }, { rotate: "0deg" }],
    },
  })
    .duration(560)
    .delay(Math.max(0, index) * DROP_STAGGER_MS);
}

/** The check mark spins and slams in when an answer is picked. */
export function checkIn(reduce: boolean) {
  if (reduce) return FadeIn.duration(150);
  return new Keyframe({
    0: { opacity: 0, transform: [{ scale: 0 }, { rotate: "-120deg" }] },
    60: { opacity: 1, transform: [{ scale: 1.45 }, { rotate: "15deg" }] },
    100: { opacity: 1, transform: [{ scale: 1 }, { rotate: "0deg" }] },
  }).duration(420);
}

/**
 * Squash, then boing past full size: the style to put on whatever just received a value. Fires
 * each time `trigger` changes after mount (never on the first paint) and only while `when` holds.
 */
export function usePop(trigger: unknown, { amount = 0.14, when = true }: { amount?: number; when?: boolean } = {}) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const tilt = useSharedValue(0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce || !when) return;
    scale.set(withSequence(withTiming(1 - amount * 0.6, { duration: 70 }), withSpring(1 + amount, { ...BOING, stiffness: 520 }), withSpring(1, BOING)));
    tilt.set(withSequence(withTiming(-3, { duration: 70 }), withSpring(2, BOING), withSpring(0, BOING)));
    // `when` gates a single change; re-running on its own flip would pop twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  return useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }, { rotate: `${tilt.get()}deg` }],
  }));
}

/** A wrapper that pops whenever `trigger` changes. */
export function Pop({
  trigger,
  amount,
  when,
  style,
  children,
  testID,
}: {
  trigger: unknown;
  amount?: number;
  when?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  testID?: string;
}) {
  const pop = usePop(trigger, { amount, when });
  return (
    <Animated.View style={[style, pop]} testID={testID}>
      {children}
    </Animated.View>
  );
}
