import React, { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { Text, type TextProps } from "./Text";

export interface CountUpProps extends Omit<TextProps, "children"> {
  value: number;
  /** Formats every intermediate value (tabular digits keep the width steady). */
  format: (n: number) => string;
  /** ms, default 600. */
  duration?: number;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
/** Under Jest the frames would land outside `act` and assertions want the final value anyway. */
const STATIC = process.env.NODE_ENV === "test";

/**
 * A number that counts to its new value instead of jumping: from the value it showed last, not
 * from zero, so a refresh only moves the digits that changed meaning. First mount counts up from
 * zero once. Reduced motion shows the final value at once. Screen readers only ever get the final
 * value (the label is set to it), never the intermediate frames.
 */
export function CountUp({ value, format, duration = 600, tabular = true, accessibilityLabel, ...rest }: CountUpProps) {
  const reduce = useReducedMotion() || STATIC;
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(reduce ? value : 0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reduce || !Number.isFinite(value)) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    if (start === value) return;
    const t0 = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / duration);
      const v = start + (value - start) * easeOutCubic(t);
      from.current = v;
      setShown(v);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
  }, [value, duration, reduce]);

  return (
    <Text {...rest} tabular={tabular} accessibilityLabel={accessibilityLabel ?? format(value)}>
      {format(shown)}
    </Text>
  );
}
