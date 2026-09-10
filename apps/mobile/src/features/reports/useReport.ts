import { useQuery } from "@tanstack/react-query";
import type { WeeklyReportDTO, WeeklyReportSummary } from "@fitfloow/core";
import { getApi } from "../../lib/api";

export const CURRENT_WEEK = "current";
export const REPORT_KEYS = {
  all: ["report"] as const,
  weekly: (week: string) => ["report", "weekly", week] as const,
  history: ["report", "history"] as const,
};

/** `/reports/weekly?week=` — pass `"current"` for the live week (no query param). */
export function useWeeklyReport(week: string = CURRENT_WEEK) {
  return useQuery<WeeklyReportDTO>({
    queryKey: REPORT_KEYS.weekly(week),
    queryFn: () => getApi().reports.weekly(week === CURRENT_WEEK ? undefined : week),
  });
}

/** Last 12 finished weeks, most recent first. */
export function useReportHistory(limit = 12) {
  return useQuery<WeeklyReportSummary[]>({
    queryKey: REPORT_KEYS.history,
    queryFn: async () => (await getApi().reports.history(limit)).weeks,
    staleTime: 5 * 60_000,
  });
}
