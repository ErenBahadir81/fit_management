import { useEffect, useRef } from "react";
import type { VolumeAdvice } from "@fitfloow/core";
import { useFloo, type FlooAction } from "../../../mascot/voice";
import { newVolumeAlerts } from "../lib/volume";

/** Quiet time after the last edit before Floo speaks: a stepper held down is one edit, not ten. */
export const VOLUME_FLOO_DELAY_MS = 700;

/**
 * Floo's side of the live volume bars. When an edit pushes a muscle into a warning (too little to
 * even maintain, or heading toward overuse) Floo says core's `volumeAdvice` line for it, once the
 * user pauses. Opening the editor is silent, the same warning is never repeated, and only the
 * worst new one is said — the bars already show the rest.
 *
 * `suggestFor(key)` may return a one-tap fix for an under-trained muscle ("Lateral Raise ekle").
 */
export function useVolumeFloo(advice: readonly VolumeAdvice[] | null, suggestFor?: (key: string) => FlooAction | null) {
  const floo = useFloo();
  const baseline = useRef<readonly VolumeAdvice[] | null>(null);
  const pending = useRef(new Map<string, VolumeAdvice>());
  const latest = useRef<readonly VolumeAdvice[] | null>(null);
  const suggest = useRef(suggestFor);
  const say = useRef(floo.say);
  useEffect(() => {
    suggest.current = suggestFor;
    say.current = floo.say;
  });

  useEffect(() => {
    if (!advice) return;
    latest.current = advice;
    for (const a of newVolumeAlerts(baseline.current, advice)) pending.current.set(a.key, a);
    baseline.current = advice;
    if (pending.current.size === 0) return;
    const timer = setTimeout(() => {
      const now = latest.current ?? [];
      // Only what is still a warning after the pause, worst first (core sorts `advice` that way).
      const still = now.filter((a) => pending.current.has(a.key) && (a.severity === "warn" || a.severity === "alert"));
      pending.current.clear();
      const top = still[0];
      if (!top) return;
      const low = top.kind === "low" || top.kind === "missing" || top.kind === "maintain";
      const action = low ? (suggest.current?.(top.key) ?? undefined) : undefined;
      say.current({
        text: top.message,
        mood: low ? "think" : "worried",
        trigger: "volumeWarning",
        tone: "warning",
        priority: "normal",
        dedupeKey: `editor-volume:${top.key}`,
        ...(action ? { action } : {}),
      });
    }, VOLUME_FLOO_DELAY_MS);
    return () => clearTimeout(timer);
  }, [advice]);
}
