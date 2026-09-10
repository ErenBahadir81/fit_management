import { useEffect, useRef, useState } from "react";

/**
 * `value` after it has stopped changing for `delay` ms. Typing "tavuk" fires one query, not five.
 * Clearing the value is applied immediately — an empty search box should show recents at once.
 */
export function useDebouncedValue<T>(value: T, delay = 300, { flushWhen }: { flushWhen?: (v: T) => boolean } = {}): T {
  const [debounced, setDebounced] = useState(value);
  const immediate = flushWhen ?? ((v: T) => typeof v === "string" && v.trim().length === 0);
  const latest = useRef(debounced);
  latest.current = debounced;

  useEffect(() => {
    if (Object.is(value, latest.current)) return;
    if (immediate(value)) {
      setDebounced(value);
      return;
    }
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
    // `immediate` is stable in practice (inline predicate); depending on it would reset the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay]);

  return debounced;
}
