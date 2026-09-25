import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { GoalView, OnTrack } from "@fitfloow/core";
import { SvgLineChart } from "../../../charts/SvgLineChart";
import { niceDomain } from "../../../charts/chartMath";
import { fmtPct } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { Text } from "../../../ui/Text";
import { useBodyTrends } from "../../body/useBody";
import { ON_TRACK_TR } from "../../goals/goalIntent";
import { planChartRows } from "../../goals/goalMath";
import { useGoalView } from "../../goals/useGoal";

export const GOAL_STRIP_CHART_HEIGHT = 56;

/** The verdict as a short spoken line, the way Floo would say it. */
const VERDICT_TR: Record<OnTrack, string> = {
  ahead: "plandan öndesin",
  onTrack: "yolundasın",
  behind: "biraz gerideyiz",
  stalled: "trend durdu",
};

export interface NutritionGoalStripProps {
  todayKey: string;
  onOpenRoadmap: () => void;
  testID?: string;
}

/**
 * "%18 → %12 · 9 hafta · yolundasın" over a small plan-vs-trend line.
 *
 * The body-fat goal is what the day's calories serve, so it sits above the ring. Read-only on
 * purpose: the whole card is one tap to the roadmap, where the full chart scrubs.
 * Renders nothing without an active goal; the energy card below already invites setting one.
 */
export function NutritionGoalStrip({ todayKey, onOpenRoadmap, testID = "nutrition-goal-strip" }: NutritionGoalStripProps) {
  const goalQ = useGoalView();
  const goal = goalQ.data?.goal?.status === "active" ? goalQ.data.goal : null;
  if (!goal) return null;
  return <Strip view={goalQ.data!} todayKey={todayKey} onOpenRoadmap={onOpenRoadmap} testID={testID} />;
}

function Strip({ view, todayKey, onOpenRoadmap, testID }: { view: GoalView; todayKey: string; onOpenRoadmap: () => void; testID: string }) {
  const { colors } = useTheme();
  const goal = view.goal!;
  const progress = view.progress;
  const trendsQ = useBodyTrends(365);
  const rows = useMemo(() => planChartRows(goal, trendsQ.data, todayKey), [goal, trendsQ.data, todayKey]);
  const domainY = useMemo(() => niceDomain([...rows.map((r) => r.expected), ...rows.map((r) => r.actual), goal.plan.targetWeightKg], 0.1), [rows, goal.plan.targetWeightKg]);
  const todayIndex = useMemo(() => rows.findIndex((r) => r.dateKey === todayKey), [rows, todayKey]);

  const fromBf = progress?.actualBodyFatPct ?? goal.start.bodyFatPct;
  const weeks = progress ? Math.max(0, Math.round(progress.weeksRemainingProjected ?? progress.weeksRemainingPlan)) : goal.plan.estimatedWeeks;
  const track = progress ? ON_TRACK_TR[progress.onTrack] : null;
  const verdict = progress ? VERDICT_TR[progress.onTrack] : "plan başladı";
  const route = `${fmtPct(fromBf, 0)} → ${fmtPct(goal.targetBodyFatPct, 0)}`;
  const line = `${weeks} hafta · ${verdict}`;

  return (
    <Card onPress={onOpenRoadmap} style={styles.card} testID={testID} accessibilityRole="button" accessibilityLabel={`Hedefin ${route.replace(/%/g, "yüzde ")}, ${line}. Yol haritasını aç.`}>
      <View style={styles.head}>
        <Icon icon="goal" size={16} color="primary" />
        <Text variant="label" color="inkMuted" style={styles.flex}>
          Hedefin
        </Text>
        {track ? <Chip label={track.label} tone={track.tone} size="sm" testID={`${testID}-track`} /> : null}
        <Icon icon="forward" size={16} color="inkSubtle" />
      </View>
      <Text variant="heading" tabular numberOfLines={1} testID={`${testID}-route`}>
        {route}
        <Text variant="body" color="inkMuted" tabular testID={`${testID}-line`}>
          {`  ·  ${line}`}
        </Text>
      </Text>
      {rows.length >= 2 ? (
        <View pointerEvents="none" testID={`${testID}-chart`}>
          <SvgLineChart
            count={rows.length}
            height={GOAL_STRIP_CHART_HEIGHT}
            domainY={domainY}
            gridColor={colors.chartGrid}
            refLines={[{ value: goal.plan.targetWeightKg, color: colors.success, dashed: true }]}
            markerIndex={todayIndex}
            markerColor={colors.border}
            series={[
              { values: rows.map((r) => r.expected), color: colors.inkSubtle, width: 1.5, dashed: true, connectMissing: true },
              { values: rows.map((r) => r.actual), color: colors.primary, width: 2.5, connectMissing: true },
            ]}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, marginBottom: spacing.lg },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 24 },
  flex: { flex: 1 },
});
