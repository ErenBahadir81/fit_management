import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GoalDTO, GoalInput, GoalPreview, GoalProfile, GoalView, Recalibration } from "@fitfloow/core";
import { getApi } from "../../lib/api";
import { haptic } from "../../lib/haptics";
import { useToast } from "../../ui/Toast";
import { HOME_QUERY_KEY } from "../home/useHome";

export const GOAL_KEY = ["goal"] as const;
export const GOAL_PREVIEW_KEY = (target: number, profile: GoalProfile) => ["goal", "preview", target, profile] as const;
export const PREVIEW_DEBOUNCE_MS = 350;

/** `/goals/current` — goal + progress. Shared by the body tab, roadmap and report screens. */
export function useGoalView() {
  return useQuery<GoalView>({ queryKey: GOAL_KEY, queryFn: () => getApi().goals.current() });
}

export interface GoalPreviewInput {
  targetBodyFatPct: number;
  profile: GoalProfile;
  enabled?: boolean;
  debounceMs?: number;
}

/**
 * Authoritative plan from `POST /goals/preview`, debounced while the slider moves. The screen shows
 * the instant core-computed plan meanwhile (see `goalMath.instantPlan`) and swaps in the server
 * numbers when they land. `pending` is true from the first change until the server answer for the
 * *current* input arrives.
 */
export function useGoalPreview({ targetBodyFatPct, profile, enabled = true, debounceMs = PREVIEW_DEBOUNCE_MS }: GoalPreviewInput) {
  const [settled, setSettled] = useState({ targetBodyFatPct, profile });
  useEffect(() => {
    if (settled.targetBodyFatPct === targetBodyFatPct && settled.profile === profile) return;
    const t = setTimeout(() => setSettled({ targetBodyFatPct, profile }), debounceMs);
    return () => clearTimeout(t);
  }, [targetBodyFatPct, profile, debounceMs, settled.targetBodyFatPct, settled.profile]);

  const q = useQuery<GoalPreview>({
    queryKey: GOAL_PREVIEW_KEY(settled.targetBodyFatPct, settled.profile),
    queryFn: () => getApi().goals.preview({ targetBodyFatPct: settled.targetBodyFatPct, profile: settled.profile }),
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: 0,
  });
  const isCurrent = settled.targetBodyFatPct === targetBodyFatPct && settled.profile === profile && !q.isPlaceholderData;
  return {
    server: q.data,
    /** The server answer matches what the user currently sees. */
    isCurrent: isCurrent && q.isSuccess,
    pending: enabled && (!isCurrent || q.isFetching),
    isError: q.isError,
  };
}

function useGoalMutationEffects() {
  const qc = useQueryClient();
  return (goal: GoalDTO | null) => {
    if (goal) qc.setQueryData<GoalView>(GOAL_KEY, (prev) => ({ goal, progress: prev?.goal?.id === goal.id ? (prev.progress ?? null) : null }));
    void qc.invalidateQueries({ queryKey: GOAL_KEY });
    void qc.invalidateQueries({ queryKey: HOME_QUERY_KEY });
    void qc.invalidateQueries({ queryKey: ["report"] });
    void qc.invalidateQueries({ queryKey: ["mascot"] });
  };
}

export function useCreateGoal() {
  const toast = useToast();
  const after = useGoalMutationEffects();
  return useMutation<GoalDTO, unknown, GoalInput>({
    mutationFn: async (input) => (await getApi().goals.create(input)).goal,
    onSuccess: (goal) => {
      void haptic.success();
      after(goal);
    },
    onError: () => toast.show({ message: "Hedef oluşturulamadı. Tekrar dene.", kind: "error" }),
  });
}

export function useUpdateGoal() {
  const toast = useToast();
  const after = useGoalMutationEffects();
  return useMutation<GoalDTO, unknown, Partial<GoalInput>>({
    mutationFn: async (input) => (await getApi().goals.update(input)).goal,
    onSuccess: (goal) => {
      void haptic.success();
      after(goal);
    },
    onError: () => toast.show({ message: "Hedef güncellenemedi. Tekrar dene.", kind: "error" }),
  });
}

export function useRecalibrateGoal() {
  const toast = useToast();
  const after = useGoalMutationEffects();
  return useMutation<{ goal: GoalDTO; recalibration: Recalibration }, unknown, void>({
    mutationFn: () => getApi().goals.recalibrate(),
    onSuccess: ({ goal, recalibration }) => {
      if (recalibration.applied) void haptic.success();
      else void haptic.warning();
      after(goal);
    },
    onError: () => toast.show({ message: "Kalibrasyon yapılamadı. Tekrar dene.", kind: "error" }),
  });
}

export function useAbandonGoal() {
  const toast = useToast();
  const after = useGoalMutationEffects();
  const qc = useQueryClient();
  return useMutation<GoalDTO, unknown, void>({
    mutationFn: async () => (await getApi().goals.abandon()).goal,
    onSuccess: () => {
      qc.setQueryData<GoalView>(GOAL_KEY, { goal: null, progress: null });
      after(null);
      void haptic.select();
    },
    onError: () => toast.show({ message: "Hedef bırakılamadı. Tekrar dene.", kind: "error" }),
  });
}

export function useCompleteGoal() {
  const toast = useToast();
  const after = useGoalMutationEffects();
  const qc = useQueryClient();
  return useMutation<GoalDTO, unknown, void>({
    mutationFn: async () => (await getApi().goals.complete()).goal,
    onSuccess: () => {
      qc.setQueryData<GoalView>(GOAL_KEY, { goal: null, progress: null });
      after(null);
      void haptic.success();
    },
    onError: () => toast.show({ message: "İşlem yapılamadı. Tekrar dene.", kind: "error" }),
  });
}
