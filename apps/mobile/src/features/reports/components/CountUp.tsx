import React, { useCallback, useEffect, useRef, useState } from "react";
import { runOnJS, useAnimatedReaction, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { easeOut } from "../../../theme/motion";
import { Text, type TextProps } from "../../../ui/Text";

export interface CountUpProps extends Omit<TextProps, "children"> {
  value: number;
  /** Stable formatter (module-level fn or useCallback) — e.g. `(v) => fmtNumber(v, 1)`. */
  format: (v: number) => string;
  /** Start of the very first roll (default 0). Later changes roll from the current number. */
  from?: number;
  /** Decimal places that must change before the label re-renders (default 1). */
  digits?: number;
  duration?: number;
}

/**
 * Hero numeral that rolls to its value. The number is driven on the UI thread (timing + ease-out);
 * the JS thread only receives a new string when a visible digit changes (≤ ~40 updates per roll),
 * so tabular numerals stay steady and nothing else re-renders. Reduced motion → the final value.
 * The accessibility label is always the final value.
 */
export function CountUp({ value, format, from = 0, digits = 1, duration = 700, accessibilityLabel, ...rest }: CountUpProps) {
  const reduce = useReducedMotion();
  const sv = useSharedValue(from);
  const first = useRef(true);
  const [rolled, setRolled] = useState(() => format(from));
  const update = useCallback((v: number) => setRolled(format(v)), [format]);

  useEffect(() => {
    if (reduce) return;
    if (first.current) {
      first.current = false;
      sv.set(from);
    }
    sv.set(withTiming(value, { duration, easing: easeOut }));
  }, [value, reduce, duration, from, sv]);

  useAnimatedReaction(
    () => Math.round(sv.get() * 10 ** digits),
    (cur, prev) => {
      if (cur !== prev) runOnJS(update)(cur / 10 ** digits);
    },
    [digits, update]
  );

  // Reduced motion: no roll, the final value is rendered directly.
  const text = reduce ? format(value) : rolled;
  return (
    <Text {...rest} tabular accessibilityLabel={accessibilityLabel ?? format(value)}>
      {text}
    </Text>
  );
}
