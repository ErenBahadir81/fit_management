/**
 * Rest timing. The maths is pure and wall-clock based: a rest is a start timestamp, the duration it
 * was started with, and the live ± the user applied while it ran. Remaining time is always derived
 * from `Date.now()`, never counted in ticks, so a backgrounded or locked phone comes back with the
 * right number instead of a frozen one.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { clamp } from "@fitfloow/core";
import { haptic } from "../../../lib/haptics";
import { cancelRestFinished, scheduleRestFinished } from "../../../lib/notifications";
import { playRestFinished, playRestTick, setMuted as setSoundMuted } from "../../../lib/sound";
import { clampPresetSeconds } from "./restDurations";
import { isRestSoundMuted, readRestPreset, writeRestPreset } from "./restPrefs";

// Re-exported so every existing `from "./restEngine"` import keeps working; the definitions live in
// a leaf module because `restPrefs` needs the clamp too (see restDurations.ts).
export { MAX_PRESET_SECONDS, MIN_PRESET_SECONDS, REST_PRESETS, REST_STEP_SECONDS, clampPresetSeconds } from "./restDurations";

/** A rest in progress. */
export interface RestPlan {
  /** Epoch ms the rest started. */
  startedAt: number;
  /** Duration the rest was started with, in seconds. */
  baseSeconds: number;
  /** Live ± seconds applied after the start, oldest first. */
  adjustments: readonly number[];
}

export interface RestSnapshot {
  /** Seconds left, fractional, never below 0. */
  remaining: number;
  /** Seconds this rest is set to right now (base + adjustments), never below 0. */
  total: number;
  /** Epoch ms the rest ends. */
  endsAt: number;
  /** Seconds burnt so far, clamped into `[0, total]`. */
  elapsed: number;
  /** 0 at the start, 1 at the end. A zero-length rest reads as complete. */
  progress: number;
  finished: boolean;
}

/** The duration the rest is set to after every live adjustment. Clamped at 0 — you cannot owe time. */
export function totalRestSeconds(plan: RestPlan): number {
  const sum = plan.adjustments.reduce((acc, delta) => acc + delta, plan.baseSeconds);
  return Math.max(0, sum);
}

export function restEndsAt(plan: RestPlan): number {
  return plan.startedAt + totalRestSeconds(plan) * 1000;
}

/** Clamped into `[0, total]`: a clock that jumped backwards must not hand out extra rest. */
export function remainingRestSeconds(plan: RestPlan, now: number): number {
  const total = totalRestSeconds(plan);
  return clamp((plan.startedAt + total * 1000 - now) / 1000, 0, total);
}

export function restSnapshot(plan: RestPlan, now: number): RestSnapshot {
  const total = totalRestSeconds(plan);
  const endsAt = plan.startedAt + total * 1000;
  const remaining = clamp((endsAt - now) / 1000, 0, total);
  const elapsed = clamp(total - remaining, 0, total);
  return {
    remaining,
    total,
    endsAt,
    elapsed,
    progress: total > 0 ? elapsed / total : 1,
    finished: remaining <= 0,
  };
}

/** `m:ss` — no leading zero on the minutes, so the digits stay as large as possible. */
export function formatRest(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------------------------
// The controller (contract C2). Owns its own ticker — it must keep time whether or not the
// workout screen is re-rendering for other reasons.
// ---------------------------------------------------------------------------------------------

/** How often we re-read the clock. Fine enough that the last three seconds land on time. */
const TICK_MS = 250;
/** Seconds of countdown that get a cue. */
const CUE_FROM = 3;

export interface RestController {
  running: boolean;
  /** Live seconds left. */
  remaining: number;
  /** Seconds this rest was started with, after any live adjustment. */
  total: number;
  /** Start (or restart) a rest. Omit to use the current preset. */
  start: (seconds?: number) => void;
  skip: () => void;
  /** Live ±N seconds on the running rest. Clamps to >= 0; 0 ends it. */
  adjust: (deltaSeconds: number) => void;
  /** Change the preset used for subsequent rests (persisted per exercise). */
  setPreset: (seconds: number) => void;
  presetSeconds: number;
}

interface Visible {
  running: boolean;
  remaining: number;
  total: number;
}

const IDLE: Visible = { running: false, remaining: 0, total: 0 };

function resolvePreset(exerciseKey: string, fallbackSeconds: number): number {
  return readRestPreset(exerciseKey) ?? clampPresetSeconds(fallbackSeconds);
}

/**
 * Rest timing for the workout screen.
 *
 * The running rest lives in a ref as a `RestPlan` and every displayed number is derived from
 * `Date.now()`, so a phone that was locked for two minutes comes back to the right answer rather
 * than to a clock that stopped. `onFinish` fires when the countdown reaches zero — never on skip.
 */
export function useRestController(opts: {
  /** Stable key for per-exercise preset persistence, e.g. the exercise name. */
  exerciseKey: string;
  fallbackSeconds: number;
  onFinish?: () => void;
}): RestController {
  const { exerciseKey, fallbackSeconds, onFinish } = opts;

  const planRef = useRef<RestPlan | null>(null);
  const cuedAtRef = useRef(Number.POSITIVE_INFINITY);
  const onFinishRef = useRef(onFinish);
  const [visible, setVisible] = useState<Visible>(IDLE);

  const [presetSeconds, setPresetSeconds] = useState(() => resolvePreset(exerciseKey, fallbackSeconds));
  // Re-resolve when the screen moves to another exercise (or the day's default changes). Adjusted
  // during render, the React-sanctioned way, so the first paint already shows that exercise's
  // preset instead of flashing the previous one.
  const source = `${exerciseKey}\u0000${fallbackSeconds}`;
  const [presetSource, setPresetSource] = useState(source);
  if (presetSource !== source) {
    setPresetSource(source);
    setPresetSeconds(resolvePreset(exerciseKey, fallbackSeconds));
  }

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  // The mute choice is persisted with the rest prefs; apply it to the audio layer once per session.
  useEffect(() => {
    setSoundMuted(isRestSoundMuted());
  }, []);

  const clear = useCallback(() => {
    planRef.current = null;
    cuedAtRef.current = Number.POSITIVE_INFINITY;
    void cancelRestFinished();
    setVisible((prev) => (prev.running ? IDLE : prev));
  }, []);

  /** @param quiet the rest ended while the app was away — the notification already did the talking. */
  const finish = useCallback(
    (quiet: boolean) => {
      if (!planRef.current) return;
      clear();
      if (!quiet) {
        void haptic.success();
        playRestFinished();
      }
      onFinishRef.current?.();
    },
    [clear]
  );

  const sync = useCallback(
    (quiet = false) => {
      const plan = planRef.current;
      if (!plan) return;
      const snap = restSnapshot(plan, Date.now());
      if (snap.finished) {
        finish(quiet);
        return;
      }
      const seconds = Math.ceil(snap.remaining);
      if (!quiet && seconds <= CUE_FROM && seconds < cuedAtRef.current) {
        cuedAtRef.current = seconds;
        playRestTick();
        void haptic.tap();
      }
      setVisible((prev) =>
        prev.running && prev.remaining === seconds && prev.total === snap.total ? prev : { running: true, remaining: seconds, total: snap.total }
      );
    },
    [finish]
  );

  const start = useCallback(
    (seconds?: number) => {
      const duration = clampPresetSeconds(seconds ?? presetSeconds);
      planRef.current = { startedAt: Date.now(), baseSeconds: duration, adjustments: [] };
      cuedAtRef.current = Number.POSITIVE_INFINITY;
      setVisible({ running: true, remaining: duration, total: duration });
      void scheduleRestFinished(duration);
    },
    [presetSeconds]
  );

  const skip = useCallback(() => {
    clear();
  }, [clear]);

  const adjust = useCallback(
    (deltaSeconds: number) => {
      const plan = planRef.current;
      if (!plan || !Number.isFinite(deltaSeconds) || deltaSeconds === 0) return;
      const next: RestPlan = { ...plan, adjustments: [...plan.adjustments, Math.trunc(deltaSeconds)] };
      const snap = restSnapshot(next, Date.now());
      planRef.current = next;
      if (snap.finished) {
        finish(false);
        return;
      }
      // Re-arm the cues: adding time means the last three seconds have not happened yet.
      cuedAtRef.current = Number.POSITIVE_INFINITY;
      setVisible({ running: true, remaining: Math.ceil(snap.remaining), total: snap.total });
      void scheduleRestFinished(snap.remaining);
    },
    [finish]
  );

  const setPreset = useCallback(
    (seconds: number) => {
      const next = clampPresetSeconds(seconds);
      writeRestPreset(exerciseKey, next);
      setPresetSeconds(next);
    },
    [exerciseKey]
  );

  useEffect(() => {
    if (!visible.running) return;
    const id = setInterval(() => sync(), TICK_MS);
    return () => clearInterval(id);
  }, [visible.running, sync]);

  // Coming back from the lock screen: re-read the clock at once instead of waiting for the tick,
  // and finish quietly if the rest ended while we were away.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") sync(true);
    });
    return () => subscription.remove();
  }, [sync]);

  // Leaving the workout must not leave a notification armed for a rest nobody is taking.
  useEffect(() => () => void cancelRestFinished(), []);

  return useMemo(
    () => ({ running: visible.running, remaining: visible.remaining, total: visible.total, start, skip, adjust, setPreset, presetSeconds }),
    [adjust, presetSeconds, setPreset, skip, start, visible.remaining, visible.running, visible.total]
  );
}
