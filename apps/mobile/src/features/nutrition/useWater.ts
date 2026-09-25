/**
 * Water data layer: `["nutrition-water", dateKey]`. One tap adds a glass optimistically, tells
 * Floo (`waterLogged`), and keeps Floo's hydration in step with today's total.
 */
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WATER_DEFAULT_GOAL_ML, type WaterDay } from "@fitfloow/core";
import { getApi } from "../../lib/api";
import { todayKey } from "../../lib/dates";
import { describeError } from "../../lib/errors";
import { flooBus } from "../../mascot/events";
import { hydrationFor, setFlooHydration } from "../../mascot/hydration";
import { useToast } from "../../ui/Toast";

export const nutritionWaterKey = (dateKey: string) => ["nutrition-water", dateKey] as const;

export function useWaterDay(dateKey: string) {
  const q = useQuery<WaterDay>({ queryKey: nutritionWaterKey(dateKey), queryFn: () => getApi().nutrition.water(dateKey) });
  const data = q.data;
  // Only today's water says how Floo feels now; browsing yesterday leaves him alone.
  useEffect(() => {
    if (data && dateKey === todayKey()) setFlooHydration(hydrationFor(data.totalMl, data.goalMl));
  }, [data, dateKey]);
  return q;
}

type Ctx = { prev: WaterDay | undefined };

export function useAddWater(dateKey: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = nutritionWaterKey(dateKey);
  return useMutation<WaterDay, unknown, number, Ctx>({
    mutationFn: (ml) => getApi().nutrition.addWater(ml, dateKey),
    onMutate: async (ml) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WaterDay>(key);
      const base = prev ?? { dateKey, totalMl: 0, goalMl: WATER_DEFAULT_GOAL_ML, count: 0 };
      const next = { ...base, totalMl: base.totalMl + ml, count: base.count + 1 };
      qc.setQueryData<WaterDay>(key, next);
      flooBus.emit("waterLogged", { ml, totalMl: next.totalMl, goalMl: next.goalMl });
      return { prev };
    },
    onError: (e, _ml, ctx) => {
      qc.setQueryData(key, ctx?.prev);
      toast.show({ message: describeError(e, "Su kaydedilemedi"), kind: "error" });
    },
    onSuccess: (day) => qc.setQueryData(key, day),
  });
}

export function useUndoWater(dateKey: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = nutritionWaterKey(dateKey);
  return useMutation<WaterDay, unknown, void, Ctx>({
    mutationFn: () => getApi().nutrition.undoWater(dateKey),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WaterDay>(key);
      qc.setQueryData<WaterDay>(key, (d) => (d && d.count > 0 ? { ...d, totalMl: Math.max(0, d.totalMl - d.totalMl / d.count), count: d.count - 1 } : d));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      qc.setQueryData(key, ctx?.prev);
      toast.show({ message: describeError(e, "Geri alınamadı"), kind: "error" });
    },
    onSuccess: (day) => qc.setQueryData(key, day),
  });
}
