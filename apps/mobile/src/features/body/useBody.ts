import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BodyEntryDTO, BodyEntryInput, BodySummary, BodyTrends, WeighInDTO } from "@fitfloow/core";
import { getApi } from "../../lib/api";
import { todayKey } from "../../lib/dates";
import { haptic } from "../../lib/haptics";
import { useToast } from "../../ui/Toast";
import { GOAL_KEY } from "../goals/useGoal";
import { HOME_QUERY_KEY } from "../home/useHome";
import { REPORT_KEYS } from "../reports/useReport";
import { optimisticSummary, optimisticTrends, type RangeDays } from "./bodyMath";

export const BODY_KEYS = {
  all: ["body"] as const,
  summary: ["body", "summary"] as const,
  trends: (days: number) => ["body", "trends", days] as const,
  entries: ["body", "entries"] as const,
};

export function useBodySummary() {
  return useQuery<BodySummary>({ queryKey: BODY_KEYS.summary, queryFn: () => getApi().body.summary() });
}

export function useBodyTrends(days: RangeDays) {
  return useQuery<BodyTrends>({ queryKey: BODY_KEYS.trends(days), queryFn: () => getApi().body.trends(days) });
}

export interface BodyEntriesView {
  entries: BodyEntryDTO[];
  profile: { gender: BodyEntryDTO["gender"]; heightCm: number | null };
}
export function useBodyEntries() {
  return useQuery<BodyEntriesView>({ queryKey: BODY_KEYS.entries, queryFn: () => getApi().body.entries(60) });
}

/** Everything a weigh-in or measurement changes: body caches, goal progress, reports, home. */
export function useInvalidateBody() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: BODY_KEYS.all }),
      qc.invalidateQueries({ queryKey: GOAL_KEY }),
      qc.invalidateQueries({ queryKey: REPORT_KEYS.all }),
      qc.invalidateQueries({ queryKey: HOME_QUERY_KEY }),
    ]);
}

interface WeighInCtx {
  summary?: BodySummary;
  trends: Array<[readonly unknown[], BodyTrends | undefined]>;
}

/**
 * One-tap weigh-in. Optimistic: the hero numeral and every cached trend range get the new point
 * (EWMA continued client-side) before the request resolves; rollback + error toast on failure.
 */
export function useQuickWeighIn() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = useInvalidateBody();
  return useMutation<WeighInDTO, unknown, { weightKg: number; dateKey?: string }, WeighInCtx>({
    mutationFn: async (input) => (await getApi().body.createWeighIn(input)).weighIn,
    onMutate: async (input) => {
      const dateKey = input.dateKey ?? todayKey();
      await qc.cancelQueries({ queryKey: BODY_KEYS.all });
      const summary = qc.getQueryData<BodySummary>(BODY_KEYS.summary);
      const trends = qc.getQueriesData<BodyTrends>({ queryKey: ["body", "trends"] });
      const optimistic: WeighInDTO = { id: `optimistic-${dateKey}`, dateKey, weightKg: input.weightKg, source: "manual", createdAt: new Date().toISOString() };
      if (summary) qc.setQueryData(BODY_KEYS.summary, optimisticSummary(summary, optimistic));
      for (const [key, data] of trends) if (data) qc.setQueryData(key, optimisticTrends(data, dateKey, input.weightKg));
      return { summary, trends };
    },
    onError: (_e, _input, ctx) => {
      if (ctx?.summary) qc.setQueryData(BODY_KEYS.summary, ctx.summary);
      for (const [key, data] of ctx?.trends ?? []) if (data) qc.setQueryData(key, data);
      toast.show({ message: "Tartı kaydedilemedi. Tekrar dene.", kind: "error" });
    },
    onSuccess: () => {
      void haptic.success();
    },
    onSettled: () => void invalidate(),
  });
}

/** POST /body/entries — a full measurement (also upserts the day's weigh-in server-side). */
export function useCreateBodyEntry() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = useInvalidateBody();
  return useMutation<BodyEntryDTO, unknown, BodyEntryInput>({
    mutationFn: async (input) => (await getApi().body.createEntry(input)).entry,
    onSuccess: (entry) => {
      qc.setQueryData<BodyEntriesView>(BODY_KEYS.entries, (prev) =>
        prev ? { ...prev, entries: [...prev.entries.filter((e) => e.dateKey !== entry.dateKey), entry].sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1)) } : prev
      );
      void haptic.success();
    },
    onError: () => toast.show({ message: "Ölçüm kaydedilemedi. Tekrar dene.", kind: "error" }),
    onSettled: () => void invalidate(),
  });
}

/** DELETE /body/entries/:id — optimistic removal from the history list with rollback. */
export function useDeleteBodyEntry() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = useInvalidateBody();
  return useMutation<void, unknown, string, { prev?: BodyEntriesView }>({
    mutationFn: (id) => getApi().body.deleteEntry(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: BODY_KEYS.entries });
      const prev = qc.getQueryData<BodyEntriesView>(BODY_KEYS.entries);
      if (prev) qc.setQueryData<BodyEntriesView>(BODY_KEYS.entries, { ...prev, entries: prev.entries.filter((e) => e.id !== id) });
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(BODY_KEYS.entries, ctx.prev);
      toast.show({ message: "Silinemedi. Tekrar dene.", kind: "error" });
    },
    onSuccess: () => void haptic.select(),
    onSettled: () => void invalidate(),
  });
}
