/**
 * Binds the pure logger reducer to the screen: seeds it from the program's current day, keeps a
 * MMKV draft so a crash or relaunch resumes exactly where the user was, and ticks the clock for the
 * elapsed / rest timers.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import type { ProgramView } from "@fitfloow/core";
import { todayKey } from "../../../lib/dates";
import { getJSON, removeKey, setJSON } from "../../../lib/storage";
import { createLoggerState, loggerReducer, restoreDraft, type LoggerAction, type LoggerState } from "../lib/logger";

/**
 * In-progress workout. Not in `STORAGE_KEYS` because that file belongs to the foundation agent —
 * TODO(F4c): move this key there when the storage catalogue is next touched.
 */
export const WORKOUT_DRAFT_KEY = "training.workout.draft.v1";

export function readDraft(): unknown {
  return getJSON(WORKOUT_DRAFT_KEY);
}
export function clearDraft(): void {
  removeKey(WORKOUT_DRAFT_KEY);
}

export interface WorkoutSession {
  state: LoggerState | null;
  dispatch: (action: LoggerAction) => void;
  /** True when the session came back from a persisted draft (show a gentle "kaldığın yerden" note). */
  restored: boolean;
  /** Epoch ms, ticking once per second while the modal is open. */
  now: number;
  reset: () => void;
  finish: () => void;
}

export function useWorkoutSession(view: ProgramView | null): WorkoutSession {
  const [state, setState] = useState<LoggerState | null>(null);
  const [restored, setRestored] = useState(false);
  const now = useTicker(state !== null);
  const started = useRef(false);

  const dispatch = useCallback((action: LoggerAction) => setState((s) => (s ? loggerReducer(s, action) : s)), []);

  const day = view?.current?.day ?? null;
  useEffect(() => {
    if (started.current || !day || !view) return;
    started.current = true;
    const dateKey = todayKey();
    const draft = restoreDraft(readDraft(), { dayOrder: day.order, dateKey });
    if (draft) {
      setState(draft);
      setRestored(true);
      return;
    }
    setState(
      createLoggerState({
        day,
        dayIndex: view.current.index,
        programId: view.program.id,
        weekNumber: view.program.weekNumber,
        dateKey,
        startedAt: Date.now(),
      })
    );
  }, [day, view]);

  // Persist every change (MMKV writes are synchronous and cheap) and once more on background.
  useEffect(() => {
    if (state) setJSON(WORKOUT_DRAFT_KEY, state);
  }, [state]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active" && state) setJSON(WORKOUT_DRAFT_KEY, state);
    });
    return () => sub.remove();
  }, [state]);

  const reset = useCallback(() => {
    clearDraft();
    started.current = false;
    setState(null);
    setRestored(false);
  }, []);

  const finish = useCallback(() => {
    clearDraft();
    setState((s) => s);
  }, []);

  return useMemo(() => ({ state, dispatch, restored, now, reset, finish }), [dispatch, finish, now, reset, restored, state]);
}

/** `Date.now()` once per second while `active`. One interval for the whole screen. */
export function useTicker(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}
