import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "./haptics";

export const UNDO_WINDOW_MS = 5000;

export interface UndoWindow<T> {
  /** The item waiting in the undo window, if any. */
  pending: T | null;
  /** Start (or restart) the window for `item`; a previous pending item is committed first. */
  request: (item: T) => void;
  /** Cancel the window and hand the item back. */
  undo: () => T | null;
  /** Commit whatever is pending right now. */
  flush: () => void;
}

/**
 * The 5 s "Geri al" window behind every destructive swipe. `onCommit` runs when the window elapses,
 * when a new item replaces the pending one, or when the screen unmounts — never on undo.
 */
export function useUndoWindow<T>(onCommit: (item: T) => void, ms = UNDO_WINDOW_MS): UndoWindow<T> {
  const [pending, setPending] = useState<T | null>(null);
  const pendingRef = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest callback, so the unmount cleanup never fires a stale mutation.
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const flush = useCallback(() => {
    clear();
    const item = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (item !== null) commitRef.current(item);
  }, [clear]);

  const request = useCallback(
    (item: T) => {
      flush();
      pendingRef.current = item;
      setPending(item);
      void haptic.warning();
      timer.current = setTimeout(flush, ms);
    },
    [flush, ms]
  );

  const undo = useCallback(() => {
    clear();
    const item = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    return item;
  }, [clear]);

  // Leaving the screen must not silently keep the row: commit whatever is still pending.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        const item = pendingRef.current;
        pendingRef.current = null;
        if (item !== null) commitRef.current(item);
      }
    },
    []
  );

  return { pending, request, undo, flush };
}
