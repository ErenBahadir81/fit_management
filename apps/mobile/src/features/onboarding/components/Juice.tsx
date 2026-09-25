import React, { useEffect, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

/**
 * The onboarding's data entry is deliberately loud: every answer lands with a bounce, so filling
 * the form feels like a game rather than paperwork. Under reduced motion it is a plain fade (or
 * nothing).
 *
 * Everything is driven by shared values from an effect, not by `entering` layout animations:
 * Reanimated implements those on web by switching the element to `position: absolute`, which
 * lifts these blocks out of flow and piles them on top of each other (see `ui/Entry`).
 */

/** A loose, overshooting spring: the "boing" that ends each animation. */
export const BOING = { damping: 9, stiffness: 300, mass: 0.8 } as const;

/** Gap between blocks dropping in, so a step assembles itself top to bottom. */
export const DROP_STAGGER_MS = 90;

const out = Easing.out(Easing.cubic);

/**
 * A block falls in from below and boings into place, `index` blocks after the first. The style
 * only uses transform and opacity, so the block keeps its place in the layout throughout.
 */
export function useDropIn(index: number) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  const o = useSharedValue(0);

  useEffect(() => {
    const delay = Math.max(0, index) * DROP_STAGGER_MS;
    o.set(withDelay(reduce ? 0 : delay, withTiming(1, { duration: reduce ? 150 : 180 })));
    p.set(reduce ? 1 : withDelay(delay, withSpring(1, BOING)));
  }, [index, reduce, o, p]);

  return useAnimatedStyle(() => {
    const v = p.get();
    return {
      opacity: o.get(),
      transform: [{ translateY: (1 - v) * 36 }, { scale: 0.86 + v * 0.14 }, { rotate: `${(1 - v) * -3}deg` }],
    };
  });
}

/** A view that drops in on mount (see `useDropIn`). */
export function DropIn({ index = 0, style, children, testID }: { index?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode; testID?: string }) {
  const drop = useDropIn(index);
  return (
    <Animated.View style={[style, drop]} testID={testID}>
      {children}
    </Animated.View>
  );
}

/** Spins and slams in on mount: for the check mark of a picked answer, or a result arriving. */
export function SlamIn({ spin = true, style, children }: { spin?: boolean; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const s = useSharedValue(reduce ? 1 : 0);
  const o = useSharedValue(0);
  useEffect(() => {
    o.set(withTiming(1, { duration: reduce ? 150 : 90 }));
    if (!reduce) s.set(withSequence(withTiming(1.4, { duration: 160, easing: out }), withSpring(1, BOING)));
  }, [reduce, o, s]);
  const slam = useAnimatedStyle(() => ({
    opacity: o.get(),
    transform: [{ scale: s.get() }, { rotate: spin ? `${(1 - Math.min(s.get(), 1)) * -120}deg` : "0deg" }],
  }));
  return <Animated.View style={[style, slam]}>{children}</Animated.View>;
}

/**
 * Squash, stretch past full size, boing back: the style to put on whatever just received a value.
 * Fires each time `trigger` changes after mount (never on the first paint) and only while `when`
 * holds.
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
    scale.set(
      withSequence(
        withTiming(1 - amount * 0.5, { duration: 70, easing: out }),
        withTiming(1 + amount, { duration: 110, easing: out }),
        withSpring(1, BOING)
      )
    );
    tilt.set(withSequence(withTiming(-2.5, { duration: 70, easing: out }), withTiming(1.5, { duration: 110, easing: out }), withSpring(0, BOING)));
    // `when` gates a single change; re-running on its own flip would pop twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  return useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }, { rotate: `${tilt.get()}deg` }] }));
}

/** A wrapper that pops whenever `trigger` changes (see `usePop`). */
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
