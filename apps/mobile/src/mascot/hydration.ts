/**
 * Floo's hydration axis (0 = parched, 1 = full). The water card sets it from the day's water
 * total; the corner Floo reads it. `null` until the app knows today's water, so a Floo that has
 * never heard about water keeps its default full look instead of starting the day wilted.
 */
import { useSyncExternalStore } from "react";
import { waterProgress } from "@fitfloow/core";

let current: number | null = null;
const listeners = new Set<() => void>();

/** Never below 0.35: an empty glass at 7 AM is not a reason for Floo to look ill. */
export function hydrationFor(totalMl: number, goalMl: number): number {
  return Math.round((0.35 + 0.65 * waterProgress(totalMl, goalMl)) * 100) / 100;
}

export function setFlooHydration(value: number | null): void {
  const next = value == null || !Number.isFinite(value) ? null : Math.max(0, Math.min(1, value));
  if (next === current) return;
  current = next;
  for (const fn of [...listeners]) fn();
}

export function getFlooHydration(): number | null {
  return current;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useFlooHydration(): number | null {
  return useSyncExternalStore(subscribe, getFlooHydration, getFlooHydration);
}
