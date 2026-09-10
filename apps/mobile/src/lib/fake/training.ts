/**
 * Training scenarios for the FakeApi (F2) — additive helpers on top of `fixtures.ts`.
 *
 * `fakeFetch.ts` already serves every `/program`, `/workouts`, `/recovery` and `/training/stats`
 * route from `FakeState`; what was missing was a way to *put the demo into a given state*. These
 * builders do exactly that, so `EXPO_PUBLIC_API_FAKE=1` can show every branch the training screens
 * handle (cardio day, rest day, finished day, skipped day, cold history, no program) and tests can
 * pick one without hand-rolling fixtures:
 *
 * ```ts
 * setApi(createFakeApi({ latencyMs: 0, signedIn: true, state: withCardioDay(trainingState()) }));
 * ```
 */
import { shiftKey, trDateKey, type DayDTO, type WorkoutLogDTO } from "@fitfloow/core";
import { createFakeState, type FakeState } from "./fakeFetch";
import * as fx from "./fixtures";

/** A fresh demo state (same as the app's default) — the base every scenario starts from. */
export function trainingState(today = trDateKey()): FakeState {
  return createFakeState(today);
}

/** Index of the first cycle day of a given kind, or -1. */
export function dayIndexOfKind(state: FakeState, kind: DayDTO["kind"]): number {
  return state.program.days.findIndex((d) => d.kind === kind);
}

/** Move the program pointer (the "current day") without touching anything else. */
export function withDayIndex(state: FakeState, index: number): FakeState {
  const len = state.program.days.length;
  state.program = { ...state.program, currentIndex: len ? ((index % len) + len) % len : 0 };
  return state;
}

/** Pointer on the run day — the cardio pane of the logger. */
export function withCardioDay(state: FakeState): FakeState {
  const i = dayIndexOfKind(state, "run");
  return withDayIndex(state, i === -1 ? 0 : i);
}

/** Pointer on a rest day — the "dinlenme" branch of the current-day card. */
export function withRestDay(state: FakeState): FakeState {
  const i = dayIndexOfKind(state, "rest");
  return withDayIndex(state, i === -1 ? 0 : i);
}

/** Today already logged: the done state (summary + "geri al"). */
export function withCompletedToday(state: FakeState, today = trDateKey()): FakeState {
  const day = state.program.days[state.program.currentIndex];
  if (!day) return state;
  const log = fx.makeLog(day, today, state.program.weekNumber);
  state.logs = [log, ...state.logs.filter((l) => l.dateKey !== today)];
  return withDayIndex(state, state.program.currentIndex + 1);
}

/** Today skipped: an off-day log, pointer moved on. */
export function withSkippedToday(state: FakeState, today = trDateKey()): FakeState {
  const day = state.program.days[state.program.currentIndex];
  if (!day) return state;
  const log = fx.makeLog(day, today, state.program.weekNumber, true);
  state.logs = [log, ...state.logs.filter((l) => l.dateKey !== today)];
  return withDayIndex(state, state.program.currentIndex + 1);
}

/** Brand-new user: program assigned, nothing logged yet (history empty state). */
export function withEmptyHistory(state: FakeState): FakeState {
  state.logs = [];
  return state;
}

/** No program assigned — the "Program atanmamış" empty state. */
export function withoutProgram(state: FakeState): FakeState {
  state.program = { ...state.program, days: [], currentIndex: 0 };
  state.logs = [];
  return state;
}

/** Only the last `days` days of history — for shorter, faster demo lists. */
export function withRecentHistory(state: FakeState, days: number, today = trDateKey()): FakeState {
  const from = shiftKey(today, -days);
  state.logs = state.logs.filter((l: WorkoutLogDTO) => l.dateKey >= from);
  return state;
}
