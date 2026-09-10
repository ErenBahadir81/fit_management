/**
 * Binds the pure logger reducer to the screen: seeds it from the program's current day, keeps a
 * MMKV draft so a crash or relaunch resumes exactly where the user was, and ticks the clock for the
 * elapsed / rest timers.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import type { ProgramView } from "@fitfloow/core";
import { todayKey } from "../../../lib/dates";
import { STORAGE_KEYS, getJSON, removeKey, setJSON } from "../../../lib/storage";
import { createLoggerState, loggerReducer, restoreDraft, type LoggerAction, type LoggerState } from "../lib/logger";

/** In-progress workout (see `STORAGE_KEYS`). */
export const WORKOUT_DRAFT_KEY = STORAGE_KEYS.workoutDraft;

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

type Session = { state: LoggerState; restored: boolean } | null;

/** Seed the session from the persisted draft (same day, same date) or a fresh logger state. */
function seedSession(view: ProgramView): Session {
  const day = view.current?.day;
  if (!day) return null;
  const dateKey = todayKey();
  const draft = restoreDraft(readDraft(), { dayOrder: day.order, dateKey });
  if (draft) return { state: draft, restored: true };
  return {
    state: createLoggerState({ day, dayIndex: view.current.index, programId: view.program.id, weekNumber: view.program.weekNumber, dateKey, startedAt: Date.now() }),
    restored: false,
  };
}

export function useWorkoutSession(view: ProgramView | null): WorkoutSession {
  // Seeded lazily once the program is known; a session never re-seeds while the modal is open.
  const [session, setSession] = useState<Session>(() => (view ? seedSession(view) : null));
  if (session === null && view && view.current?.day) {
    // The program arrived after mount (cold cache): adopt it during render, the React-sanctioned
    // way to derive state from a prop change without an extra effect pass.
    const seeded = seedSession(view);
    if (seeded) setSession(seeded);
  }
  const state = session?.state ?? null;
  const restored = session?.restored ?? false;
  const now = useTicker(state !== null);

  const dispatch = useCallback((action: LoggerAction) => setSession((s) => (s ? { ...s, state: loggerReducer(s.state, action) } : s)), []);

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
    setSession(null);
  }, []);

  const finish = useCallback(() => {
    clearDraft();
  }, []);

  return useMemo(() => ({ state, dispatch, restored, now, reset, finish }), [dispatch, finish, now, reset, restored, state]);
}

/** `Date.now()` once per second while `active`. One interval for the whole screen. */
export function useTicker(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}
