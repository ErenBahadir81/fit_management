/**
 * TRAINING data layer — every training screen reads through these hooks, never `getApi()` directly.
 * Mutations are optimistic against the `["program"]` composite and roll back with a toast on failure.
 */
import { useCallback, useMemo } from "react";
import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  buildSchedule,
  currentIndexFor,
  dayOfLog,
  isBreakLog,
  jumpTransition,
  logDayTransition,
  normalizeProgramInput,
  pointerOf,
  programMode,
  reconcilePointer,
  trDateKey,
  type CompleteWorkoutInput,
  type DayDTO,
  type ExerciseDTO,
  type LastPerformance,
  type MuscleDTO,
  type ProgramDTO,
  type ProgramInput,
  type ProgramView,
  type RecoveryView,
  type TrainingStats,
  type WorkoutLogDTO,
  type WorkoutLogLike,
} from "@fitfloow/core";
import type { LogDayRequest } from "@fitfloow/api-client";
import { getApi } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { haptic } from "../../lib/haptics";
import { useToast } from "../../ui/Toast";
import { HOME_QUERY_KEY } from "../home/useHome";
import { REPORT_KEYS } from "../reports/useReport";

export interface WorkoutsParams {
  from?: string;
  to?: string;
  limit?: number;
  before?: string;
}

export const trainingKeys = {
  program: ["program"] as const,
  recovery: ["recovery"] as const,
  workouts: (params: WorkoutsParams = {}) => ["workouts", params] as const,
  stats: (weeks: number) => ["training-stats", weeks] as const,
  exercises: (q: string) => ["exercises", q] as const,
  muscles: ["muscles"] as const,
  lastPerformance: (name: string) => ["last-performance", name] as const,
};

/* --------------------------------- reads ---------------------------------- */

/** `GET /program` — program + today's log + 7-day schedule + weekly volume in one call. */
export function useProgram() {
  return useQuery<ProgramView>({ queryKey: trainingKeys.program, queryFn: () => getApi().training.program() });
}

export function useRecovery() {
  return useQuery<RecoveryView>({ queryKey: trainingKeys.recovery, queryFn: () => getApi().training.recovery() });
}

export function useWorkouts(params: WorkoutsParams = { limit: 50 }) {
  return useQuery<WorkoutLogDTO[]>({
    queryKey: trainingKeys.workouts(params),
    queryFn: async () => (await getApi().training.workouts(params)).logs,
  });
}

export function useTrainingStats(weeks = 8) {
  return useQuery<TrainingStats>({ queryKey: trainingKeys.stats(weeks), queryFn: () => getApi().training.stats(weeks) });
}

/** Exercise catalog for the picker; the catalog barely changes so it is cached for an hour. */
export function useExerciseCatalog(q: string) {
  return useQuery<ExerciseDTO[]>({
    queryKey: trainingKeys.exercises(q.trim()),
    queryFn: async () => (await getApi().catalog.exercises(q.trim() || undefined)).exercises,
    staleTime: 60 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useMuscles() {
  return useQuery<MuscleDTO[]>({
    queryKey: trainingKeys.muscles,
    queryFn: async () => (await getApi().catalog.muscles()).muscles,
    staleTime: 60 * 60_000,
  });
}

/**
 * C1 — "what did I do last time?" for every exercise in the session, fetched in one pass so the
 * pager does not fire a request per pane as the user swipes. Returns a lookup: `null` while a name
 * is still loading or was never asked for, `{ dateKey: null, sets: [] }` when there is no history.
 */
export function useLastPerformances(names: readonly string[]): (name: string) => LastPerformance | null {
  const unique = useMemo(() => [...new Set(names.filter((n) => n.trim().length > 0))], [names]);
  const results = useQueries({
    queries: unique.map((name) => ({
      queryKey: trainingKeys.lastPerformance(name),
      queryFn: () => getApi().training.lastPerformance(name),
      // A past session cannot change while this one is open; one fetch per exercise is plenty.
      staleTime: 30 * 60_000,
      retry: false,
    })),
  });

  const byName = useMemo(() => {
    const map = new Map<string, LastPerformance>();
    unique.forEach((name, i) => {
      const data = results[i]?.data;
      if (data) map.set(name, data);
    });
    return map;
  }, [results, unique]);

  return useCallback((name: string) => byName.get(name) ?? null, [byName]);
}

/** Refresh everything a completed/skipped session touches: program, recovery, history, stats, home and the weekly report. */
export function useInvalidateTraining() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: trainingKeys.program });
    void qc.invalidateQueries({ queryKey: trainingKeys.recovery });
    void qc.invalidateQueries({ queryKey: ["workouts"] });
    void qc.invalidateQueries({ queryKey: ["training-stats"] });
    void qc.invalidateQueries({ queryKey: HOME_QUERY_KEY });
    void qc.invalidateQueries({ queryKey: REPORT_KEYS.all });
    void qc.invalidateQueries({ queryKey: ["mascot"] });
  }, [qc]);
}

/* ----------------------------- optimistic helpers -------------------------- */
/*
 * Every optimistic write below mirrors `apps/api/src/modules/training/program.routes.ts` through
 * the same core transitions (`logDayTransition`, `jumpTransition`, `reconcilePointer`,
 * `currentIndexFor`, `buildSchedule`), so the cache and the server can never disagree on where
 * the pointer is (B2). The server's answer replaces the guess on settle anyway.
 */

type LogFields = Partial<CompleteWorkoutInput> | null;

/** A stand-in log so the UI can settle immediately; the server's real log replaces it on success. */
export function draftLog(
  view: ProgramView,
  day: DayDTO | null,
  input: LogFields,
  dateKey: string,
  opts: { isBreak?: boolean; id?: string } = {}
): WorkoutLogDTO {
  const isBreak = opts.isBreak === true;
  const cycleNumber = view.program.cycleNumber ?? view.program.weekNumber;
  return {
    id: opts.id ?? `optimistic-${dateKey}`,
    date: new Date().toISOString(),
    dateKey,
    dayId: isBreak ? null : (day?.id ?? null),
    dayOrder: day?.order ?? 0,
    cycleNumber,
    weekNumber: cycleNumber,
    isBreak,
    title: isBreak ? "Ara" : (day?.title ?? ""),
    kind: isBreak ? "rest" : (day?.kind ?? "rest"),
    // A rest *day* is an off-day too, but it is done — not a break.
    isOffDay: isBreak || day?.kind === "rest",
    strength: (input?.strength ?? []).map((e) => ({
      name: e.name,
      muscles: e.muscles ?? [],
      plannedSets: e.plannedSets ?? 0,
      plannedReps: e.plannedReps ?? 0,
      plannedRIR: e.plannedRIR ?? null,
      source: e.source ?? "planned",
      skipped: e.skipped ?? false,
      metric: e.metric ?? "reps",
      sets: e.sets,
    })),
    run: input?.run
      ? {
          segments: input.run.segments,
          totalKm: input.run.segments.reduce((a, s) => a + s.km, 0),
          totalMin: input.run.segments.reduce((a, s) => a + s.min, 0),
          targetKm: input.run.targetKm ?? 0,
          targetMin: input.run.targetMin ?? 0,
        }
      : null,
    swim: input?.swim
      ? {
          segments: input.swim.segments,
          totalKm: input.swim.segments.reduce((a, s) => a + s.km, 0),
          totalMin: input.swim.segments.reduce((a, s) => a + s.min, 0),
          targetKm: input.swim.targetKm ?? 0,
          targetMin: input.swim.targetMin ?? 0,
        }
      : null,
    durationMin: input?.durationMin ?? null,
    notes: input?.notes ?? null,
    rpe: input?.rpe ?? null,
  };
}

/**
 * Re-derives `current` and the strip for a changed program/today-log, exactly as `GET /program`
 * does. The strip's logged dates are rebuilt from the entries themselves (the view carries no
 * other logs), with today's entry taken from `todayLog`.
 */
export function recompose(view: ProgramView, program: ProgramDTO, todayLog: WorkoutLogDTO | null, dateKey: string): ProgramView {
  const days = program.days;
  const todayAt = view.schedule.findIndex((s) => s.dateKey === dateKey);
  const logs: WorkoutLogLike[] = view.schedule
    .filter((s) => s.dateKey !== dateKey && s.logId !== null)
    .map((s) => ({ id: s.logId ?? undefined, date: s.dateKey, dateKey: s.dateKey, dayId: s.day?.id ?? null, dayOrder: s.day?.order, isBreak: s.status === "skipped" }));
  if (todayLog) logs.push(todayLog);
  const index = currentIndexFor(program, dateKey, Boolean(todayLog));
  const schedule =
    todayAt >= 0 && days.length > 0
      ? buildSchedule(program, logs, dateKey, { count: view.schedule.length, daysBefore: todayAt })
      : view.schedule;
  return {
    ...view,
    program,
    current: days.length ? { index, day: days[index] } : view.current,
    todayLog,
    schedule,
  };
}

/** The day `complete`/`skip` mean when no day is named (server's `plannedDayFor`). */
export function plannedDay(view: ProgramView, dateKey: string): DayDTO | null {
  const days = view.program.days;
  if (days.length === 0) return null;
  const today = view.todayLog;
  if (today && !isBreakLog(today)) {
    const done = dayOfLog(days, today);
    if (done) return done;
  }
  return days[currentIndexFor(view.program, dateKey, false)] ?? null;
}

/**
 * "Today I did `dayId`" (server's `logDay`): re-logging the day already done today edits it in
 * place and never moves the pointer twice (B3); anything else writes today's log and moves the
 * pointer via `logDayTransition`.
 */
export function applyLogDay(
  view: ProgramView,
  dayId: string,
  input: LogFields,
  dateKey: string,
  opts: { resumePlanned?: boolean } = {}
): ProgramView {
  const program = view.program;
  const day = program.days.find((d) => d.id === dayId) ?? null;
  if (!day) return view;
  const existing = view.todayLog;

  if (existing && !isBreakLog(existing) && dayOfLog(program.days, existing)?.id === dayId) {
    const log = { ...draftLog(view, day, input, dateKey, { id: existing.id }), cycleNumber: existing.cycleNumber, weekNumber: existing.weekNumber };
    return recompose(view, program, log, dateKey);
  }

  // Replacing a *done* log of another day: the server first takes that log's pointer move back,
  // which the client cannot see (logs carry no pointer history). Only a non-resume move lands on a
  // known day (the one after `dayId`), so the guess stays exact there and waits for the server otherwise.
  const replacingDone = Boolean(existing && !isBreakLog(existing));
  const t = logDayTransition(program, dayId, { resumePlanned: opts.resumePlanned });
  if (!t) return view;
  const weekly = programMode(program) === "weekly";
  const move = replacingDone && opts.resumePlanned && !weekly ? pointerOf(program) : t.after;
  const cycleNumber = weekly || replacingDone ? pointerOf(program).cycleNumber : move.cycleNumber;
  const log = { ...draftLog(view, day, input, dateKey), cycleNumber: t.before.cycleNumber, weekNumber: t.before.cycleNumber };
  const next: ProgramDTO = {
    ...program,
    currentDayId: move.currentDayId,
    currentIndex: move.currentIndex,
    cycleNumber,
    weekNumber: cycleNumber,
    lastActionAt: log.date,
  };
  return recompose(view, next, log, dateKey);
}

/**
 * `POST /program/skip` (B1/B2): on a rest day the rest day is *done* and the cycle moves on; on any
 * other day it is a break — an off-day log, the pointer stays. A day that already has a log is
 * left as it is (the server answers idempotently or refuses).
 */
export function applySkip(view: ProgramView, reason: string | undefined, dateKey: string): ProgramView {
  if (view.todayLog) return view;
  const days = view.program.days;
  if (days.length === 0) return view;
  const planned = days[currentIndexFor(view.program, dateKey, false)];
  if (!planned) return view;
  if (planned.kind === "rest") return applyLogDay(view, planned.id, { notes: reason ?? null }, dateKey);
  const log = draftLog(view, planned, { notes: reason ?? null }, dateKey, { isBreak: true });
  return recompose(view, { ...view.program, lastActionAt: log.date }, log, dateKey);
}

/** `POST /program/jump`: move the pointer by id, log nothing. */
export function applyJump(view: ProgramView, dayId: string, dateKey: string): ProgramView {
  const next = jumpTransition(view.program, dayId);
  if (!next) return view;
  return recompose(view, { ...view.program, currentDayId: next.currentDayId, currentIndex: next.currentIndex }, view.todayLog, dateKey);
}

/** `PUT /program`: days keep their ids, so the pointer stays on the same day (B5). */
export function applyProgramUpdate(view: ProgramView, input: ProgramInput, dateKey: string): ProgramView {
  const mode = input.mode ?? programMode(view.program);
  // Same id rules as the server (kept when known, fresh `d<n>` otherwise) — muscles stay as sent.
  const { days } = normalizeProgramInput(input.days, [], { mode, existingIds: view.program.days.map((d) => d.id) });
  const pointer = reconcilePointer(view.program, days);
  return recompose(
    view,
    { ...view.program, name: input.name ?? view.program.name, mode, days, currentDayId: pointer.currentDayId, currentIndex: pointer.currentIndex },
    view.todayLog,
    dateKey
  );
}

async function snapshotProgram(qc: QueryClient) {
  await qc.cancelQueries({ queryKey: trainingKeys.program });
  return qc.getQueryData<ProgramView>(trainingKeys.program) ?? null;
}

/* -------------------------------- mutations ------------------------------- */

interface ProgramCtx {
  prev: ProgramView | null;
}

/** Shared error handling: put the cache back and say so once, quietly. */
function useRollback() {
  const qc = useQueryClient();
  const toast = useToast();
  return useCallback(
    (ctx: ProgramCtx | undefined, error: unknown, message: string) => {
      if (ctx?.prev) qc.setQueryData(trainingKeys.program, ctx.prev);
      else void qc.invalidateQueries({ queryKey: trainingKeys.program });
      toast.show({ message: describeError(error, message), kind: "error" });
    },
    [qc, toast]
  );
}

/**
 * `POST /program/skip` — "Dinlendim" / "bugün ara". A rest day is done and the pointer moves on;
 * a training day becomes a break and stays next (see `applySkip`).
 */
export function useSkipDay() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTraining();
  const rollback = useRollback();
  return useMutation<{ log: WorkoutLogDTO }, unknown, string | undefined, ProgramCtx>({
    mutationFn: async (reason) => getApi().training.skip(reason),
    onMutate: async (reason) => {
      const prev = await snapshotProgram(qc);
      if (prev) qc.setQueryData(trainingKeys.program, applySkip(prev, reason, trDateKey()));
      return { prev };
    },
    onError: (e, _v, ctx) => rollback(ctx, e, "Gün atlanamadı. Tekrar dene."),
    onSuccess: () => {
      void haptic.select();
      invalidate();
    },
  });
}

/** `POST /program/complete` — the finish action of the workout logger (today's planned day). */
export function useCompleteWorkout() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTraining();
  const rollback = useRollback();
  return useMutation<{ log: WorkoutLogDTO }, unknown, CompleteWorkoutInput, ProgramCtx>({
    mutationFn: async (input) => getApi().training.complete(input),
    onMutate: async (input) => {
      const prev = await snapshotProgram(qc);
      if (prev) {
        const dateKey = trDateKey();
        const day = plannedDay(prev, dateKey);
        if (day) qc.setQueryData(trainingKeys.program, applyLogDay(prev, day.id, input, dateKey));
      }
      return { prev };
    },
    onError: (e, _v, ctx) => rollback(ctx, e, "Antrenman kaydedilemedi. Tekrar dene."),
    // The success haptic belongs to the SuccessCheck the logger shows — one big moment, one buzz.
    onSuccess: () => invalidate(),
  });
}

/**
 * `POST /program/log-day` — "Bugün başka bir şey yaptım": today I did `dayId` (any day of the
 * program). The cycle continues after that day, or with `resumePlanned` keeps the planned day next.
 */
export function useLogDay() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTraining();
  const rollback = useRollback();
  return useMutation<{ log: WorkoutLogDTO }, unknown, LogDayRequest, ProgramCtx>({
    mutationFn: async (input) => getApi().training.logDay(input),
    onMutate: async (input) => {
      const prev = await snapshotProgram(qc);
      if (prev) {
        const { dayId, resumePlanned, ...fields } = input;
        qc.setQueryData(trainingKeys.program, applyLogDay(prev, dayId, fields, trDateKey(), { resumePlanned }));
      }
      return { prev };
    },
    onError: (e, _v, ctx) => rollback(ctx, e, "Gün kaydedilemedi. Tekrar dene."),
    onSuccess: () => {
      void haptic.success();
      invalidate();
    },
  });
}

/** `POST /program/jump` — "buradan devam et", by day id. */
export function useJumpTo() {
  const qc = useQueryClient();
  const rollback = useRollback();
  return useMutation<unknown, unknown, string, ProgramCtx>({
    mutationFn: async (dayId) => getApi().training.jump(dayId),
    onMutate: async (dayId) => {
      const prev = await snapshotProgram(qc);
      if (prev) qc.setQueryData(trainingKeys.program, applyJump(prev, dayId, trDateKey()));
      return { prev };
    },
    onError: (e, _v, ctx) => rollback(ctx, e, "Gün değiştirilemedi."),
    onSuccess: () => {
      void haptic.select();
      void qc.invalidateQueries({ queryKey: trainingKeys.program });
      void qc.invalidateQueries({ queryKey: HOME_QUERY_KEY });
    },
  });
}

/** `PUT /program` — the day editor. */
export function useUpdateProgram() {
  const qc = useQueryClient();
  const rollback = useRollback();
  return useMutation<unknown, unknown, ProgramInput, ProgramCtx>({
    mutationFn: async (input) => getApi().training.updateProgram(input),
    onMutate: async (input) => {
      const prev = await snapshotProgram(qc);
      if (prev) qc.setQueryData(trainingKeys.program, applyProgramUpdate(prev, input, trDateKey()));
      return { prev };
    },
    onError: (e, _v, ctx) => rollback(ctx, e, "Program kaydedilemedi. Tekrar dene."),
    onSuccess: () => {
      void haptic.success();
      void qc.invalidateQueries({ queryKey: trainingKeys.program });
      void qc.invalidateQueries({ queryKey: HOME_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: REPORT_KEYS.all }); // planned sessions per week
    },
  });
}

/** `DELETE /workouts/:id` — removes the log from every cached list first. */
export function useDeleteWorkout() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTraining();
  const toast = useToast();
  return useMutation<void, unknown, string, { lists: [readonly unknown[], WorkoutLogDTO[]][] }>({
    mutationFn: async (id) => getApi().training.deleteWorkout(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["workouts"] });
      const lists = qc.getQueriesData<WorkoutLogDTO[]>({ queryKey: ["workouts"] }).filter((e): e is [readonly unknown[], WorkoutLogDTO[]] => Array.isArray(e[1]));
      for (const [key, logs] of lists) qc.setQueryData(key, logs.filter((l) => l.id !== id));
      return { lists };
    },
    onError: (e, _id, ctx) => {
      for (const [key, logs] of ctx?.lists ?? []) qc.setQueryData(key, logs);
      toast.show({ message: describeError(e, "Kayıt silinemedi."), kind: "error" });
    },
    onSuccess: () => invalidate(),
  });
}

/**
 * Taking today's break back is exact on the client (a break never moved the pointer). A done day's
 * undo depends on pointer history the client does not have (`undoTransition` runs on the server),
 * so that one simply waits for the refetch.
 */
export function applyUndoBreak(view: ProgramView, dateKey: string): ProgramView {
  if (!view.todayLog || !isBreakLog(view.todayLog)) return view;
  return recompose(view, view.program, null, dateKey);
}

/** `POST /program/undo-last` — undo today's log (complete, rest day, other day or break). */
export function useUndoLast() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTraining();
  const rollback = useRollback();
  return useMutation<unknown, unknown, void, ProgramCtx>({
    mutationFn: async () => getApi().training.undoLast(),
    onMutate: async () => {
      const prev = await snapshotProgram(qc);
      if (prev) qc.setQueryData(trainingKeys.program, applyUndoBreak(prev, trDateKey()));
      return { prev };
    },
    onError: (e, _v, ctx) => rollback(ctx, e, "Geri alınamadı."),
    onSuccess: () => {
      void haptic.select();
      invalidate();
    },
  });
}
