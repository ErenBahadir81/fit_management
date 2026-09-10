"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ApiClientError } from "@fitfloow/api-client";
import type {
  AdminCreateUserInput,
  AdminUpdateUserInput,
  ExerciseInput,
  FoodInput,
  MascotTemplateDTO,
  MuscleDTO,
  ProgramTemplateInput,
  SettingsDTO,
} from "@fitfloow/core";
import { api } from "./api";

/** One namespace per resource so invalidation stays surgical. */
export const qk = {
  me: ["me"] as const,
  dashboard: ["admin", "dashboard"] as const,
  health: ["admin", "health"] as const,
  users: (q?: string) => ["admin", "users", q ?? ""] as const,
  user: (id: string) => ["admin", "user", id] as const,
  userOverview: (id: string) => ["admin", "user", id, "overview"] as const,
  muscles: ["admin", "muscles"] as const,
  exercises: (q?: { q?: string; muscle?: string }) => ["admin", "exercises", q?.q ?? "", q?.muscle ?? ""] as const,
  templates: ["admin", "templates"] as const,
  template: (id: string) => ["admin", "template", id] as const,
  settings: ["admin", "settings"] as const,
  mascot: ["admin", "mascot-messages"] as const,
  foods: (q?: { q?: string; source?: string }) => ["admin", "foods", q?.q ?? "", q?.source ?? ""] as const,
  scans: (limit: number) => ["admin", "scans", limit] as const,
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Beklenmeyen bir hata oluştu";
}

/* ------------------------------- reads ---------------------------------- */

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => api.auth.me(), staleTime: 5 * 60_000 });

export const useDashboard = () => useQuery({ queryKey: qk.dashboard, queryFn: () => api.admin.dashboard() });

export const useHealth = () => useQuery({ queryKey: qk.health, queryFn: () => api.admin.health(), refetchInterval: 60_000 });

export const useUsers = (q?: string) => useQuery({ queryKey: qk.users(q), queryFn: () => api.admin.users(q) });

export const useUserOverview = (id: string) => useQuery({ queryKey: qk.userOverview(id), queryFn: () => api.admin.userOverview(id), enabled: Boolean(id) });

export const useMuscles = () => useQuery({ queryKey: qk.muscles, queryFn: () => api.admin.muscles() });

export const useExercises = (q?: { q?: string; muscle?: string }) => useQuery({ queryKey: qk.exercises(q), queryFn: () => api.admin.exercises(q) });

export const useTemplates = () => useQuery({ queryKey: qk.templates, queryFn: () => api.admin.templates() });

export const useTemplate = (id: string) => useQuery({ queryKey: qk.template(id), queryFn: () => api.admin.template(id), enabled: Boolean(id) });

export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: () => api.admin.settings() });

export const useMascotMessages = () => useQuery({ queryKey: qk.mascot, queryFn: () => api.admin.mascotMessages() });

export const useFoods = (q?: { q?: string; source?: string }) => useQuery({ queryKey: qk.foods(q), queryFn: () => api.admin.foods(q) });

export const useScans = (limit = 40) => useQuery({ queryKey: qk.scans(limit), queryFn: () => api.admin.scans(limit) });

/* ------------------------------ mutations -------------------------------- */

interface MutationFeedback {
  onDone?: () => void;
  onFail?: (error: unknown) => void;
}

export function useCreateUser(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminCreateUserInput) => api.admin.createUser(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

export function useUpdateUser(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminUpdateUserInput }) => api.admin.updateUser(id, input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
      void qc.invalidateQueries({ queryKey: qk.userOverview(vars.id) });
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

export function useDeleteUser(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.admin.deleteUser(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

export function useResetPassword(fb: MutationFeedback = {}) {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => api.admin.resetPassword(id, password),
    onSuccess: () => fb.onDone?.(),
    onError: fb.onFail,
  });
}

export function useAssignProgram(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, templateId }: { id: string; templateId: string }) => api.admin.assignProgram(id, templateId),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: qk.userOverview(vars.id) });
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

/* muscles — optimistic everywhere, this table is edited constantly */

type MusclesData = { muscles: MuscleDTO[] };

function setMuscles(qc: QueryClient, next: MuscleDTO[]) {
  qc.setQueryData<MusclesData>(qk.muscles, { muscles: next });
}

export function useReorderMuscles(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keys: string[]) => api.admin.reorderMuscles(keys),
    onMutate: async (keys) => {
      await qc.cancelQueries({ queryKey: qk.muscles });
      const previous = qc.getQueryData<MusclesData>(qk.muscles);
      if (previous) {
        const byKey = new Map(previous.muscles.map((m) => [m.key, m]));
        const next = keys.map((k, i) => ({ ...(byKey.get(k) as MuscleDTO), order: i })).filter(Boolean);
        setMuscles(qc, next);
      }
      return { previous };
    },
    onError: (error, _keys, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.muscles, ctx.previous);
      fb.onFail?.(error);
    },
    onSuccess: () => fb.onDone?.(),
  });
}

export function useUpdateMuscle(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, input }: { key: string; input: Partial<Omit<MuscleDTO, "key">> }) => api.admin.updateMuscle(key, input),
    onMutate: async ({ key, input }) => {
      await qc.cancelQueries({ queryKey: qk.muscles });
      const previous = qc.getQueryData<MusclesData>(qk.muscles);
      if (previous) setMuscles(qc, previous.muscles.map((m) => (m.key === key ? { ...m, ...input } : m)));
      return { previous };
    },
    onError: (error, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.muscles, ctx.previous);
      fb.onFail?.(error);
    },
    onSuccess: () => fb.onDone?.(),
  });
}

export function useCreateMuscle(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<MuscleDTO, "order"> & { order?: number }) => api.admin.createMuscle(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.muscles });
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

export function useDeleteMuscle(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.admin.deleteMuscle(key),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.muscles });
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

/* exercises */

export function useSaveExercise(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: ExerciseInput }) =>
      id ? api.admin.updateExercise(id, input) : api.admin.createExercise(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "exercises"] });
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

export function useDeleteExercise(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.admin.deleteExercise(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "exercises"] });
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

/* templates */

export function useSaveTemplate(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: ProgramTemplateInput }) =>
      id ? api.admin.updateTemplate(id, input) : api.admin.createTemplate(input),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: qk.templates });
      void qc.invalidateQueries({ queryKey: qk.template(data.template.id) });
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

export function useDeleteTemplate(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.admin.deleteTemplate(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.templates });
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

export function useDuplicateTemplate(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.admin.duplicateTemplate(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.templates });
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

/* settings */

export function useSaveSettings(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsDTO) => api.admin.updateSettings(input),
    onSuccess: (data) => {
      qc.setQueryData(qk.settings, data);
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

/* mascot */

export function useSaveMascotMessage(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: Omit<MascotTemplateDTO, "id"> }) =>
      id ? api.admin.updateMascotMessage(id, input) : api.admin.createMascotMessage(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.mascot });
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

export function useDeleteMascotMessage(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.admin.deleteMascotMessage(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.mascot });
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

export function useResetMascotMessages(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.admin.resetMascotMessages(),
    onSuccess: (data) => {
      qc.setQueryData(qk.mascot, data);
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

/* foods */

export function useSaveFood(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: FoodInput }) => (id ? api.admin.updateFood(id, input) : api.admin.createFood(input)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "foods"] });
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

export function useDeleteFood(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.admin.deleteFood(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "foods"] });
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}

export function useImportFoods(fb: MutationFeedback = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { query: string; source: "off" | "usda"; limit?: number }) => api.admin.importFoods(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "foods"] });
      fb.onDone?.();
    },
    onError: fb.onFail,
  });
}
