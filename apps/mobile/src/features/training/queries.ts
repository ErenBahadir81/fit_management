/**
 * TRAINING data layer — every training screen reads through these hooks, never `getApi()` directly.
 * Mutations are optimistic against the `["program"]` composite and roll back with a toast on failure.
 */
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  advancePointer,
  jumpTo as jumpPointer,
  normalizeIndex,
  trDateKey,
  type CompleteWorkoutInput,
  type ExerciseDTO,
  type MuscleDTO,
  type ProgramInput,
  type ProgramView,
  type RecoveryView,
  type TrainingStats,
  type WorkoutLogDTO,
} from "@fitfloow/core";
import { getApi } from "../../lib/api";
import { haptic } from "../../lib/haptics";
import { useToast } from "../../ui/Toast";
import { HOME_QUERY_KEY } from "../home/useHome";

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

/** Refresh everything a completed/skipped session touches. */
export function useInvalidateTraining() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: trainingKeys.program });
    void qc.invalidateQueries({ queryKey: trainingKeys.recovery });
    void qc.invalidateQueries({ queryKey: ["workouts"] });
    void qc.invalidateQueries({ queryKey: ["training-stats"] });
    void qc.invalidateQueries({ queryKey: HOME_QUERY_KEY });
  }, [qc]);
}

/* ----------------------------- optimistic helpers -------------------------- */

function todayEntry(view: ProgramView, patch: Partial<ProgramView["schedule"][number]>): ProgramView["schedule"] {
  return view.schedule.map((s) => (s.isToday ? { ...s, ...patch } : s));
}

/** A stand-in log so the UI can settle immediately; the server's real log replaces it on success. */
function draftLog(view: ProgramView, input: CompleteWorkoutInput | null, dateKey: string): WorkoutLogDTO {
  const day = view.current.day;
  const isOffDay = input === null;
  return {
    id: `optimistic-${dateKey}`,
    date: new Date().toISOString(),
    dateKey,
    dayOrder: day?.order ?? 0,
    weekNumber: view.program.weekNumber,
    title: day?.title ?? "",
    kind: day?.kind ?? "rest",
    isOffDay,
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

/** Writes today's log + the advanced pointer into the cached composite. */
function applySession(view: ProgramView, input: CompleteWorkoutInput | null, dateKey: string): ProgramView {
  const log = draftLog(view, input, dateKey);
  const pointer = advancePointer(view.program);
  const days = view.program.days;
  const index = normalizeIndex(pointer.currentIndex, days.length);
  return {
    ...view,
    program: { ...view.program, currentIndex: index, weekNumber: pointer.weekNumber, lastActionAt: log.date },
    current: days.length ? { index, day: days[index] } : view.current,
    todayLog: log,
    schedule: todayEntry(view, { status: input === null ? "skipped" : "done", logId: log.id }),
  };
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
    (ctx: ProgramCtx | undefined, message: string) => {
      if (ctx?.prev) qc.setQueryData(trainingKeys.program, ctx.prev);
      else void qc.invalidateQueries({ queryKey: trainingKeys.program });
      toast.show({ message, kind: "error" });
    },
    [qc, toast]
  );
}

/** `POST /program/skip` — today becomes an off-day, the pointer moves on. */
export function useSkipDay() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTraining();
  const rollback = useRollback();
  return useMutation<{ log: WorkoutLogDTO }, unknown, string | undefined, ProgramCtx>({
    mutationFn: async (reason) => getApi().training.skip(reason),
    onMutate: async () => {
      const prev = await snapshotProgram(qc);
      if (prev) qc.setQueryData(trainingKeys.program, applySession(prev, null, trDateKey()));
      return { prev };
    },
    onError: (_e, _v, ctx) => rollback(ctx, "Gün atlanamadı. Tekrar dene."),
    onSuccess: () => {
      void haptic.select();
      invalidate();
    },
  });
}

/** `POST /program/complete` — the finish action of the workout logger. */
export function useCompleteWorkout() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTraining();
  const rollback = useRollback();
  return useMutation<{ log: WorkoutLogDTO }, unknown, CompleteWorkoutInput, ProgramCtx>({
    mutationFn: async (input) => getApi().training.complete(input),
    onMutate: async (input) => {
      const prev = await snapshotProgram(qc);
      if (prev) qc.setQueryData(trainingKeys.program, applySession(prev, input, trDateKey()));
      return { prev };
    },
    onError: (_e, _v, ctx) => rollback(ctx, "Antrenman kaydedilemedi. Tekrar dene."),
    onSuccess: () => {
      void haptic.success();
      invalidate();
    },
  });
}

/** `POST /program/jump` — "buradan devam et". */
export function useJumpTo() {
  const qc = useQueryClient();
  const rollback = useRollback();
  return useMutation<unknown, unknown, number, ProgramCtx>({
    mutationFn: async (index) => getApi().training.jump(index),
    onMutate: async (index) => {
      const prev = await snapshotProgram(qc);
      if (prev) {
        const pointer = jumpPointer(prev.program, index);
        const days = prev.program.days;
        qc.setQueryData(trainingKeys.program, {
          ...prev,
          program: { ...prev.program, currentIndex: pointer.currentIndex },
          current: days.length ? { index: pointer.currentIndex, day: days[pointer.currentIndex] } : prev.current,
        } satisfies ProgramView);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => rollback(ctx, "Gün değiştirilemedi."),
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
      if (prev) {
        const days = input.days.map((d, i) => ({ ...d, order: i + 1 })) as ProgramView["program"]["days"];
        const index = normalizeIndex(prev.program.currentIndex, days.length);
        qc.setQueryData(trainingKeys.program, {
          ...prev,
          program: { ...prev.program, name: input.name ?? prev.program.name, days, currentIndex: index },
          current: days.length ? { index, day: days[index] } : prev.current,
        } satisfies ProgramView);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => rollback(ctx, "Program kaydedilemedi. Tekrar dene."),
    onSuccess: () => {
      void haptic.success();
      void qc.invalidateQueries({ queryKey: trainingKeys.program });
      void qc.invalidateQueries({ queryKey: HOME_QUERY_KEY });
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
    onError: (_e, _id, ctx) => {
      for (const [key, logs] of ctx?.lists ?? []) qc.setQueryData(key, logs);
      toast.show({ message: "Kayıt silinemedi.", kind: "error" });
    },
    onSuccess: () => invalidate(),
  });
}

/** `POST /program/undo-last` — undo today's complete/skip. */
export function useUndoLast() {
  const invalidate = useInvalidateTraining();
  const toast = useToast();
  return useMutation<unknown, unknown, void>({
    mutationFn: async () => getApi().training.undoLast(),
    onError: () => toast.show({ message: "Geri alınamadı.", kind: "error" }),
    onSuccess: () => {
      void haptic.select();
      invalidate();
    },
  });
}
