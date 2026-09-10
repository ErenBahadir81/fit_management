import { useLocalSearchParams } from "expo-router";
import { WeeklyReportScreen } from "../../../src/features/reports/WeeklyReportScreen";

/** /(modals)/report/current or /(modals)/report/2026-09-06 — the weekly report page. */
export default function WeeklyReportRoute() {
  const { week } = useLocalSearchParams<{ week: string }>();
  return <WeeklyReportScreen initialWeek={week} />;
}
