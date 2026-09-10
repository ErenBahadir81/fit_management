"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * localStorage-backed boolean in an external store, so reading it needs no
 * setState-in-effect and SSR still renders the documented default.
 */
const caches = new Map<string, boolean>();
const listeners = new Map<string, Set<() => void>>();

function listenersFor(key: string): Set<() => void> {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  return set;
}

export function usePersistentFlag(key: string, fallback = false): [boolean, (next: boolean) => void] {
  const read = useCallback(() => {
    const cached = caches.get(key);
    if (cached !== undefined) return cached;
    let value = fallback;
    try {
      const raw = localStorage.getItem(key);
      if (raw === "1") value = true;
      else if (raw === "0") value = false;
    } catch {
      /* storage blocked */
    }
    caches.set(key, value);
    return value;
  }, [key, fallback]);

  const subscribe = useCallback(
    (onChange: () => void) => {
      const set = listenersFor(key);
      set.add(onChange);
      return () => set.delete(onChange);
    },
    [key]
  );

  const value = useSyncExternalStore(subscribe, read, () => fallback);

  const set = useCallback(
    (next: boolean) => {
      caches.set(key, next);
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* storage blocked */
      }
      listenersFor(key).forEach((l) => l());
    },
    [key]
  );

  return [value, set];
}
