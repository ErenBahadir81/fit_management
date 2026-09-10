import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { weekKeyFor, type Weekday } from "@fitfloow/core";
import { todayKey } from "../../lib/dates";
import { Floo } from "../../mascot/Floo";
import { timing } from "../../theme/motion";
import { spacing } from "../../theme/tokens";
import { EmptyState } from "../../ui/EmptyState";
import { Entry } from "../../ui/Entry";
import { Header } from "../../ui/Header";
import { Reveal } from "../../ui/Reveal";
import { Screen } from "../../ui/Screen";
import { useSession } from "../auth/session";
import { HistoryCarousel } from "./components/HistoryCarousel";
import { BodyReportCard, DeficitCard, GoalDistanceCard, Highlights, ScoreHero, TrainingCard } from "./components/ReportCards";
import { WeekSwitcher } from "./components/WeekSwitcher";
import { adjacentWeeks } from "./reportMath";
import { ReportSkeleton } from "./ReportSkeleton";
import { CURRENT_WEEK, useReportHistory, useWeeklyReport } from "./useReport";

export interface WeeklyReportScreenProps {
  /** `"current"` (default) or a week key / any date inside the wanted week. */
  initialWeek?: string;
}

/**
 * The weekly report — a designed page, not a table: score hero with Floo, deficit bars vs the
 * plan, body / training / goal cards, highlights, week switcher and the 12-week history strip.
 */
export function WeeklyReportScreen({ initialWeek }: WeeklyReportScreenProps) {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const measurementDay = (user?.measurementDay ?? 0) as Weekday;
  const today = todayKey();
  const currentKey = weekKeyFor(today, measurementDay);
  const [week, setWeek] = useState<string>(() => (!initialWeek || initialWeek === CURRENT_WEEK ? CURRENT_WEEK : weekKeyFor(initialWeek, measurementDay)));
  const weekKey = week === CURRENT_WEEK ? currentKey : week;
  const q = useWeeklyReport(week);
  const history = useReportHistory();
  const { prev, next } = adjacentWeeks(weekKey, today, measurementDay);

  const select = useCallback((key: string) => setWeek(key === currentKey ? CURRENT_WEEK : key), [currentKey]);
  const goPrev = useCallback(() => select(prev), [select, prev]);
  const goNext = useMemo(() => (next ? () => select(next) : null), [next, select]);
  const goGoal = useCallback(() => router.push(q.data?.goal ? "/(modals)/goal/roadmap" : "/(modals)/goal/setup"), [router, q.data?.goal]);

  // Switching weeks keeps the previous page visible, dimmed, until the new one lands (no skeleton flash).
  const dim = useSharedValue(1);
  useEffect(() => {
    dim.set(withTiming(q.isPlaceholderData ? 0.45 : 1, timing.base));
  }, [q.isPlaceholderData, dim]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.get() }));

  return (
    <Screen tabBar={false} edges={["top", "bottom"]} refreshing={q.isRefetching && !q.isPending && !q.isPlaceholderData} onRefresh={() => void q.refetch()}>
      <Header title="Haftalık rapor" compact left={{ icon: "close", label: "Kapat", onPress: () => router.back() }} />
      <WeekSwitcher weekKey={weekKey} isCurrent={week === CURRENT_WEEK} measurementDay={measurementDay} onPrev={goPrev} onNext={goNext} />
      {q.isError && !q.data ? (
        <EmptyState illustration={<Floo mood="worried" size="m" />} title="Rapor yüklenemedi" body="Bağlantını kontrol edip tekrar dene." action={{ label: "Tekrar dene", onPress: () => void q.refetch(), icon: "refresh" }} />
      ) : (
        <Reveal ready={Boolean(q.data)} skeleton={<ReportSkeleton />}>
          {q.data ? (
            <Animated.View style={[styles.stack, dimStyle]} testID="report-content">
              <Entry index={0}>
                <ScoreHero report={q.data} mascotEnabled={user?.mascotEnabled ?? true} />
              </Entry>
              <Entry index={1}>
                <DeficitCard report={q.data} />
              </Entry>
              <Entry index={2}>
                <BodyReportCard report={q.data} />
              </Entry>
              <Entry index={3}>
                <TrainingCard report={q.data} />
              </Entry>
              <Entry index={4}>
                <GoalDistanceCard report={q.data} onPress={goGoal} />
              </Entry>
              <Entry index={5}>
                <Highlights report={q.data} />
              </Entry>
              <Entry index={6}>
                <HistoryCarousel weeks={history.data} selectedWeekKey={weekKey} onSelect={select} />
              </Entry>
            </Animated.View>
          ) : null}
        </Reveal>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: spacing.lg } });
