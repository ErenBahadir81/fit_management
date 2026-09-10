import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { GoalDTO, GoalProgress, Recalibration } from "@fitfloow/core";
import { todayKey } from "../../lib/dates";
import { fmtDate, fmtDelta, fmtInt, fmtKg, fmtNumber, fmtPct } from "../../lib/format";
import { Floo } from "../../mascot/Floo";
import { useTheme } from "../../theme/ThemeProvider";
import { radii, spacing } from "../../theme/tokens";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Chip } from "../../ui/Chip";
import { EmptyState } from "../../ui/EmptyState";
import { Entry } from "../../ui/Entry";
import { Header } from "../../ui/Header";
import { Reveal } from "../../ui/Reveal";
import { Ring } from "../../ui/Ring";
import { Screen } from "../../ui/Screen";
import { useSheet } from "../../ui/Sheet";
import { Skeleton, SkeletonGroup } from "../../ui/Skeleton";
import { Text } from "../../ui/Text";
import { useBodyTrends } from "../body/useBody";
import { ON_TRACK_TR } from "../home/components/GoalCard";
import { CountUp } from "../reports/components/CountUp";
import { PlanTrendChart } from "./components/PlanTrendChart";
import { RecalibrateSheet, RoadmapMenuSheet } from "./components/RoadmapSheets";
import { RoadmapWeekRow, WEEK_ROW_HEIGHT } from "./components/RoadmapWeekRow";
import { planChartRows, roadmapRows, type RoadmapRow } from "./goalMath";
import { useAbandonGoal, useCompleteGoal, useGoalView, useRecalibrateGoal } from "./useGoal";

const fmt0 = (v: number) => fmtNumber(v, 0);
const HEIGHTS = { header: 196, chart: 316, recal: 132 } as const;

/** Roadmap: progress header, expected-vs-actual chart, recalibration, week list, overflow menu. */
export function RoadmapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const goalQ = useGoalView();
  const trendsQ = useBodyTrends(365);
  const recal = useRecalibrateGoal();
  const abandon = useAbandonGoal();
  const complete = useCompleteGoal();
  const recalSheet = useSheet();
  const menu = useSheet();
  const [recalResult, setRecalResult] = useState<Recalibration | null>(null);
  const today = todayKey();

  const goal = goalQ.data?.goal?.status === "active" ? goalQ.data.goal : null;
  const progress = goal ? (goalQ.data?.progress ?? null) : null;
  const rows = useMemo(() => (goal ? roadmapRows(goal, trendsQ.data, today) : []), [goal, trendsQ.data, today]);
  const chart = useMemo(() => (goal ? planChartRows(goal, trendsQ.data, today) : []), [goal, trendsQ.data, today]);

  const onRecalibrate = useCallback(() => {
    recal.mutate(undefined, {
      onSuccess: ({ recalibration }) => {
        setRecalResult(recalibration);
        recalSheet.present();
      },
    });
  }, [recal, recalSheet]);
  const onEdit = useCallback(() => {
    menu.dismiss();
    router.push({ pathname: "/(modals)/goal/setup", params: { mode: "edit" } });
  }, [menu, router]);
  const onComplete = useCallback(() => complete.mutate(undefined, { onSuccess: () => router.back() }), [complete, router]);
  const onAbandon = useCallback(() => abandon.mutate(undefined, { onSuccess: () => router.back() }), [abandon, router]);

  if (goalQ.isError && !goalQ.data) {
    return (
      <Screen tabBar={false} edges={["top", "bottom"]}>
        <Header title="Yol haritası" compact left={{ icon: "close", label: "Kapat", onPress: () => router.back() }} />
        <EmptyState illustration={<Floo mood="worried" size="m" />} title="Bir şeyler ters gitti" body="Hedef yüklenemedi." action={{ label: "Tekrar dene", onPress: () => void goalQ.refetch(), icon: "refresh" }} />
      </Screen>
    );
  }
  if (goalQ.data && !goal) {
    return (
      <Screen tabBar={false} edges={["top", "bottom"]}>
        <Header title="Yol haritası" compact left={{ icon: "close", label: "Kapat", onPress: () => router.back() }} />
        <EmptyState illustration={<Floo mood="think" size="m" />} title="Aktif hedef yok" body="Bir yağ oranı seç; kaç hafta süreceğini ve günlük kaloriyi hesaplayayım." action={{ label: "Hedef belirle", onPress: () => router.replace("/(modals)/goal/setup"), icon: "flag" }} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} tabBar={false}>
      <View style={styles.headerWrap}>
        <Header title="Yol haritası" compact left={{ icon: "close", label: "Kapat", onPress: () => router.back() }} right={{ icon: "ellipsis-horizontal", label: "Daha fazla", onPress: menu.present, testID: "roadmap-menu" }} />
      </View>
      <Reveal ready={Boolean(goal)} skeleton={<RoadmapSkeleton />} style={styles.flex}>
        {goal ? (
          <FlashList<RoadmapRow>
            data={rows}
            keyExtractor={(r) => String(r.week.weekIndex)}
            renderItem={({ item }) => <RoadmapWeekRow row={item} />}
            ListHeaderComponent={<RoadmapHeader goal={goal} progress={progress} chart={chart} today={today} onRecalibrate={onRecalibrate} recalibrating={recal.isPending} />}
            contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: insets.bottom + spacing.xl }}
            refreshing={goalQ.isRefetching && !goalQ.isPending}
            onRefresh={() => {
              void goalQ.refetch();
              void trendsQ.refetch();
            }}
            showsVerticalScrollIndicator={false}
            testID="roadmap-list"
          />
        ) : null}
      </Reveal>
      <RecalibrateSheet ref={recalSheet.ref} result={recalResult} onClose={recalSheet.dismiss} />
      <RoadmapMenuSheet ref={menu.ref} onEdit={onEdit} onComplete={onComplete} onAbandon={onAbandon} busy={abandon.isPending || complete.isPending} />
    </Screen>
  );
}

interface RoadmapHeaderProps {
  goal: GoalDTO;
  progress: GoalProgress | null;
  chart: ReturnType<typeof planChartRows>;
  today: string;
  onRecalibrate: () => void;
  recalibrating: boolean;
}

function RoadmapHeader({ goal, progress, chart, today, onRecalibrate, recalibrating }: RoadmapHeaderProps) {
  const { colors } = useTheme();
  const pct = progress?.percentComplete ?? 0;
  const track = progress ? ON_TRACK_TR[progress.onTrack] : null;
  const ringTone = track ? (track.tone === "danger" ? "warning" : track.tone) : "primary";
  const weekIndex = progress?.weekIndexInPlan ?? 1;
  return (
    <View style={styles.stack}>
      <Entry index={0}>
        <Card style={styles.headerCard} testID="roadmap-header" accessibilityLabel={`İlerleme ${fmtPct(pct, 0)}, ${fmtKg(progress?.kgToGo ?? goal.plan.totalLossKg)} kaldı${track ? `, ${track.label}` : ""}`}>
          <View style={styles.headerRow}>
            <Ring value={pct / 100} size={112} tone={ringTone} gradient={ringTone === "primary"} testID="roadmap-ring">
              <CountUp value={pct} format={fmt0} variant="display" testID="roadmap-pct" />
              <Text variant="caption" color="inkMuted">
                %
              </Text>
            </Ring>
            <View style={styles.headerTexts}>
              <Text variant="label" color="inkMuted">
                Hedef {fmtPct(goal.targetBodyFatPct, 1)} · hafta {weekIndex}/{goal.plan.estimatedWeeks}
              </Text>
              <Text variant="display" tabular>
                {fmtKg(progress?.kgToGo ?? goal.plan.totalLossKg)}
                <Text variant="body" color="inkMuted">
                  {" "}
                  kaldı
                </Text>
              </Text>
              <View style={styles.chips}>
                {track ? <Chip label={track.label} tone={track.tone} size="sm" testID="roadmap-track" /> : null}
                <Text variant="caption" color="inkMuted" tabular>
                  tahmini {progress?.projectedDate ? fmtDate(progress.projectedDate, "short") : fmtDate(goal.plan.targetDate, "short")}
                </Text>
              </View>
            </View>
          </View>
          {progress ? (
            <View style={[styles.expected, { backgroundColor: colors.surfaceMuted }]}>
              <Mini label="Trend kilo" value={fmtKg(progress.actualWeightKg)} />
              <Mini label="Beklenen" value={fmtKg(progress.expectedWeightKg)} />
              <Mini label="Fark" value={progress.actualWeightKg === null ? "—" : fmtDelta(progress.actualWeightKg - progress.expectedWeightKg, "kg")} tone={progress.actualWeightKg !== null && progress.actualWeightKg - progress.expectedWeightKg > 0.4 ? "warning" : "success"} />
            </View>
          ) : null}
        </Card>
      </Entry>
      <Entry index={1}>
        <Card style={styles.chartCard}>
          <Text variant="title" style={styles.cardTitle}>
            Beklenen ve gerçek
          </Text>
          <PlanTrendChart rows={chart} targetWeightKg={goal.plan.targetWeightKg} todayKey={today} testID="plan-chart" />
        </Card>
      </Entry>
      <Entry index={2}>
        <Card variant="muted" style={styles.recal}>
          <View style={styles.recalTexts}>
            <Text variant="bodyStrong">Yeniden kalibre et</Text>
            <Text variant="caption" color="inkMuted" tabular>
              {goal.tdeeOverride ? `Ölçülen harcama ${fmtInt(goal.tdeeOverride)} kcal kullanılıyor` : `Formül harcaması ${fmtInt(goal.plan.tdee)} kcal. Gerçek verinle ölçelim mi?`}
            </Text>
          </View>
          <Button label="Kalibre et" variant="secondary" size="sm" icon="analytics-outline" onPress={onRecalibrate} loading={recalibrating} testID="roadmap-recalibrate" />
        </Card>
      </Entry>
      <Entry index={3}>
        <View style={styles.sectionHead}>
          <Text variant="title">Haftalar</Text>
          <Text variant="caption" color="inkMuted">
            planlanan kalori · açık · beklenen kilo
          </Text>
        </View>
      </Entry>
    </View>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" }) {
  return (
    <View style={styles.mini}>
      <Text variant="caption" color="inkMuted">
        {label}
      </Text>
      <Text variant="bodyStrong" tone={tone} tabular>
        {value}
      </Text>
    </View>
  );
}

function RoadmapSkeleton() {
  return (
    <SkeletonGroup testID="roadmap-skeleton" style={[styles.stack, { paddingHorizontal: spacing.gutter }]}>
      <Skeleton height={HEIGHTS.header} radius={radii.card} />
      <Skeleton height={HEIGHTS.chart} radius={radii.card} />
      <Skeleton height={HEIGHTS.recal} radius={radii.card} />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} height={WEEK_ROW_HEIGHT - 12} radius={radii.md} />
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerWrap: { paddingHorizontal: spacing.gutter },
  stack: { gap: spacing.lg, paddingBottom: spacing.sm },
  headerCard: { minHeight: HEIGHTS.header, gap: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  headerTexts: { flex: 1, gap: spacing.xs },
  chips: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  expected: { flexDirection: "row", gap: spacing.md, borderRadius: radii.md, padding: spacing.md },
  mini: { flex: 1, gap: 2 },
  chartCard: { minHeight: HEIGHTS.chart },
  cardTitle: { marginBottom: spacing.sm },
  recal: { minHeight: HEIGHTS.recal, flexDirection: "row", alignItems: "center", gap: spacing.md },
  recalTexts: { flex: 1, gap: 2 },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
});
