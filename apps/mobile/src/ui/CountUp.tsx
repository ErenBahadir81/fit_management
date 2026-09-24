import React, { useEffect, useRef, useState } from "react";
import { runOnJS, useAnimatedReaction, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { easeOut } from "../theme/motion";
import { Text, type TextProps } from "./Text";

export interface CountUpOptions {
  /**
   * Where the very first count starts (default 0). Pass the value itself to show it at once on
   * mount and count only when it changes (a screen visited many times a day).
   */
  from?: number;
  /** ms, default 600. */
  duration?: number;
  /** `false` returns the value as it is: reduced motion, tests. Default `true`. */
  animate?: boolean;
}

export interface CountUpProps extends Omit<TextProps, "children">, Omit<CountUpOptions, "animate"> {
  value: number;
  /** Formats every intermediate value (tabular digits keep the width steady). */
  format: (n: number) => string;
}

/** Under Jest the frames would land outside `act`, and screen tests want the final value anyway. */
const STATIC = process.env.NODE_ENV === "test";

/**
 * The number to show for a value that counts to its new value instead of jumping.
 *
 * The count itself is an animated value: a Reanimated timing (ease-out) keeps the clock on the UI
 * thread, and each frame reaches JS as a plain number to format (the text itself is rendered by
 * React, one small Text per frame, as before). It always starts from the number on screen,
 * so a value that changes mid-count carries on from there instead of jumping back. Everything that
 * is not a count is derived during render: with animation off, or for a value that is not a finite
 * number, the value itself is shown.
 */
export function useCountUp(value: number, { from = 0, duration = 600, animate = true }: CountUpOptions = {}): number {
  const live = animate && Number.isFinite(value);
  const n = useSharedValue(live ? from : value);
  const [frame, setFrame] = useState(live ? from : value);
  // Not counting: the value itself is on screen. Kept in step during render (no effect, no extra
  // frame), so turning the count back on can never replay a stale number.
  if (!live && !Object.is(frame, value)) setFrame(value);
  // Whether `n` still holds the number on screen, i.e. whether the next count may start from it.
  const inStep = useRef(true);

  useAnimatedReaction(
    () => n.get(),
    (v, prev) => {
      if (live && v !== prev) runOnJS(setFrame)(v);
    },
    [live]
  );

  useEffect(() => {
    if (!live) {
      inStep.current = false;
      return;
    }
    // After a stretch without counting there is nothing on screen to count from: start there.
    n.set(inStep.current ? withTiming(value, { duration, easing: easeOut }) : value);
    inStep.current = true;
  }, [live, value, duration, n]);

  return live && Number.isFinite(frame) ? frame : value;
}

/**
 * A number that counts to its new value instead of jumping: from the number it shows, not from
 * zero, so a refresh only moves the digits that changed meaning. The first mount counts up from
 * `from` (default 0) once; pass the value itself as `from` where the screen is visited often.
 * Reduced motion shows the final value at once. Screen readers only ever get the final value
 * (the label is set to it), never the intermediate frames.
 */
export function CountUp({ value, format, from, duration, tabular = true, accessibilityLabel, ...rest }: CountUpProps) {
  const reduce = useReducedMotion();
  const shown = useCountUp(value, { from, duration, animate: !reduce && !STATIC });
  return (
    <Text {...rest} tabular={tabular} accessibilityLabel={accessibilityLabel ?? format(value)}>
      {format(shown)}
    </Text>
  );
}
