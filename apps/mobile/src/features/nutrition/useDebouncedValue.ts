import { useEffect, useState } from "react";

const emptyString = (v: unknown) => typeof v === "string" && v.trim().length === 0;

/**
 * `value` after it has stopped changing for `delay` ms. Typing "tavuk" fires one query, not five.
 * Clearing the value is applied immediately — an empty search box should show recents at once.
 */
export function useDebouncedValue<T>(value: T, delay = 300, { flushWhen }: { flushWhen?: (v: T) => boolean } = {}): T {
  const [settled, setSettled] = useState(value);
  const immediate = flushWhen ?? emptyString;

  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  // A cleared box is applied on the spot; everything else waits for the timer.
  return immediate(value) ? value : settled;
}
