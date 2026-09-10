/**
 * WORKOUT LOGGER — the pure state machine behind the full-screen logger modal.
 *
 * Everything the screen shows is derived from this state, and every interaction is one action.
 * No I/O, no `Date.now()`: actions that need the clock carry `at`, selectors take `now`. That keeps
 * the reducer trivially testable and makes the MMKV draft (crash/relaunch restore) a plain snapshot.
 */
import { clamp, round } from "@fitfloow/core";
import type { CompleteWorkoutInput, DayDTO, DayKind, ExerciseMetric, MuscleLoad } from "@fitfloow/core";

export const DRAFT_VERSION = 1;
/** Default rest between sets (s). */
export const DEFAULT_REST_SECONDS = 90;

export interface LoggerSet {
  /** Reps, or seconds when the exercise metric is `time`. */
  reps: number;
  rir: number | null;
  done: boolean;
}

export interface LoggerExercise {
  id: string;
  name: string;
  muscles: MuscleLoad[];
  metric: ExerciseMetric;
  plannedSets: number;
  plannedReps: number;
  plannedRIR: number | null;
  source: "planned" | "extra";
  skipped: boolean;
  sets: LoggerSet[];
}

export interface LoggerSegment {
  id: string;
  km: number;
  min: number;
}

export interface LoggerCardio {
  targetKm: number;
  targetMin: number;
  label: string;
  segments: LoggerSegment[];
}

export type CardioSlot = "run" | "swim";

export interface LoggerState {
  version: number;
  programId: string;
  dayIndex: number;
  dayOrder: number;
  title: string;
  focus: string;
  kind: DayKind;
  weekNumber: number;
  dateKey: string;
  startedAt: number;
  exercises: LoggerExercise[];
  activeIndex: number;
  run: LoggerCardio | null;
  swim: LoggerCardio | null;
  restSeconds: number;
  /** Epoch ms the current rest ends at; `null` when no rest is running. */
  restEndsAt: number | null;
  rpe: number | null;
  notes: string;
  /** Monotonic id source so ad-hoc exercises/segments get stable keys without side effects. */
  seq: number;
}

export interface AdHocExercise {
  name: string;
  muscles: MuscleLoad[];
  metric?: ExerciseMetric;
  defaultSets?: number;
  defaultReps?: number;
}

export type LoggerAction =
  | { type: "focus"; index: number }
  | { type: "complete-set"; at: number; exercise?: number; set?: number }
  | { type: "undo-set"; exercise: number; set: number }
  | { type: "set-reps"; exercise: number; set: number; value: number }
  | { type: "set-rir"; exercise: number; set: number; value: number | null }
  | { type: "add-set"; exercise: number }
  | { type: "remove-set"; exercise: number }
  | { type: "toggle-skip"; exercise: number }
  | { type: "add-exercise"; exercise: AdHocExercise }
  | { type: "segment-add"; slot: CardioSlot }
  | { type: "segment-set"; slot: CardioSlot; id: string; km?: number; min?: number }
  | { type: "segment-remove"; slot: CardioSlot; id: string }
  | { type: "rest-skip" }
  | { type: "rest-restart"; at: number }
  | { type: "set-rpe"; value: number | null }
  | { type: "set-notes"; value: string };

/* ------------------------------- creation -------------------------------- */

export interface CreateLoggerOptions {
  day: DayDTO;
  dayIndex: number;
  programId: string;
  weekNumber: number;
  dateKey: string;
  startedAt: number;
  restSeconds?: number;
}

function seedSets(count: number, reps: number, rir: number | null): LoggerSet[] {
  return Array.from({ length: Math.max(1, count) }, () => ({ reps, rir, done: false }));
}

function cardioFrom(target: DayDTO["run"], idPrefix: string): LoggerCardio | null {
  if (!target) return null;
  return {
    targetKm: target.targetKm,
    targetMin: target.targetMin,
    label: target.label ?? "",
    segments: [{ id: `${idPrefix}-0`, km: target.targetKm, min: target.targetMin }],
  };
}

/** A fresh session for the pointer's day: one pending set per planned set. */
export function createLoggerState(opts: CreateLoggerOptions): LoggerState {
  const { day } = opts;
  return {
    version: DRAFT_VERSION,
    programId: opts.programId,
    dayIndex: opts.dayIndex,
    dayOrder: day.order,
    title: day.title,
    focus: day.focus ?? "",
    kind: day.kind,
    weekNumber: opts.weekNumber,
    dateKey: opts.dateKey,
    startedAt: opts.startedAt,
    exercises: day.exercises.map((e, i) => ({
      id: `ex-${i}`,
      name: e.name,
      muscles: e.muscles ?? [],
      metric: e.metric ?? "reps",
      plannedSets: e.targetSets,
      plannedReps: e.targetReps,
      plannedRIR: e.targetRIR ?? null,
      source: "planned" as const,
      skipped: false,
      sets: seedSets(e.targetSets, e.targetReps, e.targetRIR ?? null),
    })),
    activeIndex: 0,
    run: cardioFrom(day.run, "run"),
    swim: cardioFrom(day.swim, "swim"),
    restSeconds: opts.restSeconds ?? DEFAULT_REST_SECONDS,
    restEndsAt: null,
    rpe: null,
    notes: "",
    seq: 1,
  };
}

/* -------------------------------- selectors ------------------------------- */

/** First not-yet-completed set of an exercise, or `-1` when it is finished. */
export function activeSetIndex(ex: LoggerExercise): number {
  return ex.sets.findIndex((s) => !s.done);
}

export function exerciseDone(ex: LoggerExercise): boolean {
  return ex.sets.length > 0 && ex.sets.every((s) => s.done);
}

export function totalSets(state: LoggerState): number {
  return state.exercises.reduce((a, e) => a + (e.skipped ? 0 : e.sets.length), 0);
}

export function doneSets(state: LoggerState): number {
  return state.exercises.reduce((a, e) => a + (e.skipped ? 0 : e.sets.filter((s) => s.done).length), 0);
}

export function progress(state: LoggerState): number {
  const total = totalSets(state);
  return total === 0 ? 0 : doneSets(state) / total;
}

/** The set the logger should focus next: active exercise first, then forward through the list. */
export function nextPending(state: LoggerState): { exercise: number; set: number } | null {
  const n = state.exercises.length;
  for (let step = 0; step < n; step++) {
    const i = (state.activeIndex + step) % n;
    const ex = state.exercises[i];
    if (ex.skipped) continue;
    const set = activeSetIndex(ex);
    if (set !== -1) return { exercise: i, set };
  }
  return null;
}

/** Seconds left on the rest timer (0 when none / finished). */
export function restRemaining(state: LoggerState, now: number): number {
  if (state.restEndsAt === null) return 0;
  return Math.max(0, Math.ceil((state.restEndsAt - now) / 1000));
}

/** Load-weighted sets per muscle key — the chips on the finish sheet. */
export function muscleSets(state: LoggerState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ex of state.exercises) {
    if (ex.skipped) continue;
    const done = ex.sets.filter((s) => s.done).length;
    if (done === 0) continue;
    for (const m of ex.muscles) out[m.key] = round((out[m.key] ?? 0) + done * m.load, 1);
  }
  return out;
}

/** Total completed reps (or seconds for `time` exercises) — the "hacim" number. */
export function totalReps(state: LoggerState): number {
  return state.exercises.reduce((a, e) => (e.skipped ? a : a + e.sets.filter((s) => s.done).reduce((b, s) => b + s.reps, 0)), 0);
}

export function elapsedMinutes(state: LoggerState, now: number): number {
  return Math.max(0, Math.round((now - state.startedAt) / 60_000));
}

export function cardioTotals(cardio: LoggerCardio | null): { km: number; min: number } {
  if (!cardio) return { km: 0, min: 0 };
  return {
    km: round(cardio.segments.reduce((a, s) => a + s.km, 0), 2),
    min: round(cardio.segments.reduce((a, s) => a + s.min, 0), 1),
  };
}

/** Pace in min/km, or `null` when nothing usable was logged. */
export function pace(cardio: LoggerCardio | null): number | null {
  const { km, min } = cardioTotals(cardio);
  return km > 0 && min > 0 ? round(min / km, 2) : null;
}

/** Is there anything worth sending? (an empty session should not create a log) */
export function hasAnything(state: LoggerState): boolean {
  return doneSets(state) > 0 || cardioTotals(state.run).km > 0 || cardioTotals(state.swim).km > 0 || cardioTotals(state.run).min > 0 || cardioTotals(state.swim).min > 0;
}

function cardioInput(cardio: LoggerCardio | null): CompleteWorkoutInput["run"] {
  if (!cardio) return null;
  const segments = cardio.segments.filter((s) => s.km > 0 || s.min > 0).map((s) => ({ km: s.km, min: s.min }));
  if (segments.length === 0) return null;
  return { segments, targetKm: cardio.targetKm, targetMin: cardio.targetMin };
}

/** The `POST /program/complete` body. Only completed sets travel. */
export function toCompleteInput(state: LoggerState, now: number): CompleteWorkoutInput {
  return {
    strength: state.exercises.map((e) => ({
      name: e.name,
      muscles: e.muscles,
      plannedSets: e.plannedSets,
      plannedReps: e.plannedReps,
      plannedRIR: e.plannedRIR,
      source: e.source,
      skipped: e.skipped,
      metric: e.metric,
      sets: e.skipped ? [] : e.sets.filter((s) => s.done).map((s) => ({ reps: s.reps, rir: s.rir })),
    })),
    run: cardioInput(state.run),
    swim: cardioInput(state.swim),
    durationMin: elapsedMinutes(state, now),
    notes: state.notes.trim() || null,
    rpe: state.rpe,
  };
}

/* --------------------------------- reducer -------------------------------- */

function mapExercise(state: LoggerState, index: number, fn: (ex: LoggerExercise) => LoggerExercise): LoggerState {
  if (!state.exercises[index]) return state;
  const exercises = state.exercises.map((e, i) => (i === index ? fn(e) : e));
  return { ...state, exercises };
}

function mapCardio(state: LoggerState, slot: CardioSlot, fn: (c: LoggerCardio) => LoggerCardio): LoggerState {
  const current = state[slot];
  if (!current) return state;
  return { ...state, [slot]: fn(current) };
}

export function loggerReducer(state: LoggerState, action: LoggerAction): LoggerState {
  switch (action.type) {
    case "focus":
      return { ...state, activeIndex: clamp(Math.trunc(action.index), 0, Math.max(0, state.exercises.length - 1)) };

    case "complete-set": {
      const target = action.exercise !== undefined && action.set !== undefined ? { exercise: action.exercise, set: action.set } : nextPending(state);
      if (!target) return state;
      const ex = state.exercises[target.exercise];
      if (!ex || !ex.sets[target.set] || ex.sets[target.set].done) return state;
      const next = mapExercise(state, target.exercise, (e) => ({
        ...e,
        sets: e.sets.map((s, i) => (i === target.set ? { ...s, done: true } : s)),
      }));
      const after = nextPending(next);
      return {
        ...next,
        // Auto-advance the pane when this exercise is finished and something else is pending.
        activeIndex: after && exerciseDone(next.exercises[target.exercise]) ? after.exercise : next.activeIndex,
        restEndsAt: after ? action.at + next.restSeconds * 1000 : null,
      };
    }

    case "undo-set": {
      const next = mapExercise(state, action.exercise, (e) => ({
        ...e,
        sets: e.sets.map((s, i) => (i === action.set ? { ...s, done: false } : s)),
      }));
      return { ...next, restEndsAt: null };
    }

    case "set-reps":
      return mapExercise(state, action.exercise, (e) => ({
        ...e,
        sets: e.sets.map((s, i) => (i === action.set ? { ...s, reps: clamp(Math.round(action.value), 0, 10_000) } : s)),
      }));

    case "set-rir":
      return mapExercise(state, action.exercise, (e) => ({
        ...e,
        sets: e.sets.map((s, i) => (i === action.set ? { ...s, rir: action.value === null ? null : clamp(Math.round(action.value), 0, 10) } : s)),
      }));

    case "add-set":
      return mapExercise(state, action.exercise, (e) => {
        if (e.sets.length >= 20) return e;
        const last = e.sets[e.sets.length - 1];
        return { ...e, sets: [...e.sets, { reps: last?.reps ?? e.plannedReps, rir: last?.rir ?? e.plannedRIR, done: false }] };
      });

    case "remove-set":
      return mapExercise(state, action.exercise, (e) => {
        // Never drop logged work: only trailing pending sets can go, and one always remains.
        if (e.sets.length <= 1 || e.sets[e.sets.length - 1].done) return e;
        return { ...e, sets: e.sets.slice(0, -1) };
      });

    case "toggle-skip": {
      const next = mapExercise(state, action.exercise, (e) => ({ ...e, skipped: !e.skipped }));
      if (!next.exercises[action.exercise]?.skipped) return next;
      const after = nextPending(next);
      return { ...next, activeIndex: after ? after.exercise : next.activeIndex, restEndsAt: null };
    }

    case "add-exercise": {
      const e = action.exercise;
      const sets = clamp(Math.round(e.defaultSets ?? 3), 1, 20);
      const reps = clamp(Math.round(e.defaultReps ?? 10), 1, 600);
      const exercise: LoggerExercise = {
        id: `extra-${state.seq}`,
        name: e.name,
        muscles: e.muscles,
        metric: e.metric ?? "reps",
        plannedSets: sets,
        plannedReps: reps,
        plannedRIR: null,
        source: "extra",
        skipped: false,
        sets: seedSets(sets, reps, null),
      };
      return { ...state, exercises: [...state.exercises, exercise], activeIndex: state.exercises.length, seq: state.seq + 1 };
    }

    case "segment-add":
      return {
        ...mapCardio(state, action.slot, (c) => ({ ...c, segments: [...c.segments, { id: `${action.slot}-${state.seq}`, km: 0, min: 0 }] })),
        seq: state.seq + 1,
      };

    case "segment-set":
      return mapCardio(state, action.slot, (c) => ({
        ...c,
        segments: c.segments.map((s) =>
          s.id === action.id
            ? { ...s, km: action.km === undefined ? s.km : clamp(round(action.km, 2), 0, 200), min: action.min === undefined ? s.min : clamp(round(action.min, 1), 0, 1440) }
            : s
        ),
      }));

    case "segment-remove":
      return mapCardio(state, action.slot, (c) => (c.segments.length <= 1 ? c : { ...c, segments: c.segments.filter((s) => s.id !== action.id) }));

    case "rest-skip":
      return state.restEndsAt === null ? state : { ...state, restEndsAt: null };

    case "rest-restart":
      return { ...state, restEndsAt: action.at + state.restSeconds * 1000 };

    case "set-rpe":
      return { ...state, rpe: action.value === null ? null : clamp(Math.round(action.value), 1, 10) };

    case "set-notes":
      return { ...state, notes: action.value.slice(0, 500) };

    default:
      return state;
  }
}

/* --------------------------------- drafts --------------------------------- */

/**
 * Validate a persisted draft against the day the program is actually on. A draft from another day,
 * another date or an older schema is dropped rather than confusing the user.
 */
export function restoreDraft(raw: unknown, expect: { dayOrder: number; dateKey: string }): LoggerState | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<LoggerState>;
  if (d.version !== DRAFT_VERSION) return null;
  if (d.dayOrder !== expect.dayOrder || d.dateKey !== expect.dateKey) return null;
  if (!Array.isArray(d.exercises) || typeof d.startedAt !== "number") return null;
  return d as LoggerState;
}
