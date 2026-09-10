import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { HomeDTO } from "@fitfloow/core";
import { getApi } from "../../lib/api";

export const HOME_QUERY_KEY = ["home"] as const;

/** `/reports/home` — one call for the whole home screen. Cached (MMKV) so warm starts paint instantly. */
export function useHome() {
  return useQuery<HomeDTO>({ queryKey: HOME_QUERY_KEY, queryFn: () => getApi().reports.home() });
}

/** Feature agents: call after any mutation that changes today's state (workout, meal, weigh-in, goal). */
export function useInvalidateHome() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: HOME_QUERY_KEY });
}
