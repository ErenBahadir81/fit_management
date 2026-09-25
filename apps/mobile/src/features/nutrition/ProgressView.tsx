import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { BodyTrends } from "@fitfloow/core";
import { LineTrend } from "../../charts/LineTrend";
import type { TrendPoint } from "../../charts/chartMath";
import { fmtPct } from "../../lib/format";
import { Floo } from "../../mascot";
import { radii, spacing } from "../../theme/tokens";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Chip } from "../../ui/Chip";
import { Entry } from "../../ui/Entry";
import { Skeleton, SkeletonGroup } from "../../ui/Skeleton";
import { Text } from "../../ui/Text";
import { useBodyTrends } from "../body/useBody";
import { PlanTrendChart } from "../goals/components/PlanTrendChart";
import { planChartRows } from "../goals/goalMath";
import { useGoalView } from "../goals/useGoal";
import { adherencePct } from "./WeekView";
import { useNutritionWeek } from "./useNutrition";

const CHART_HEIGHT = 160;

/** Sparse measurements (body fat, waist) as their own series: one point per reading. */
function measurePoints(trends: BodyTrends | undefined, pick: (p: BodyTrends["points"][number]) => number | null): TrendPoint[] {
  if (!trends) return [];
  return trends.points.flatMap((p) => {
    const v = pick(p);
    return v === null ? [] : [{ dateKey: p.dateKey, raw: v, ewma: v }];
  });
}

export interface ProgressViewProps {
  todayKey: string;
  onOpenRoadmap: () => void;
  onSetGoal: () => void;
  onAddMeasurement: () => void;
}

/**
 * İlerleme: is the eating working? Floo's read of the latest data and this week's adherence, then
 * weight against the plan, then body fat and waist, the two numbers the goal is really about.
 */
export function ProgressView({ todayKey, onOpenRoadmap, onSetGoal, onAddMeasurement }: ProgressViewProps) {
  const goalQ = useGoalView();
  const trendsQ = useBodyTrends(365);
  const week = useNutritionWeek(todayKey);
  const goal = goalQ.data?.goal?.status === "active" ? goalQ.data.goal : null;
  const feedback = goalQ.data?.feedback ?? null;
  const planRows = useMemo(() => (goal ? planChartRows(goal, trendsQ.data, todayKey) : []), [goal, trendsQ.data, todayKey]);
  const bf = useMemo(() => measurePoints(trendsQ.data, (p) => p.bodyFatPct), [trendsQ.data]);
  const waist = useMemo(() => measurePoints(trendsQ.data, (p) => p.waistCm), [trendsQ.data]);

  if (!goalQ.data || !trendsQ.data) return <ProgressSkeleton />;

  const pct = week.data ? adherencePct(week.data.adherence) : null;
  const tone = pct === null ? "neutral" : pct >= 70 ? "success" : pct >= 40 ? "warning" : "danger";

  return (
    <View style={styles.stack} testID="nutrition-progress">
      <Entry index={0}>
        <Card style={styles.gap} testID="progress-feedback">
          <View style={styles.floo}>
            <Floo mood={feedback?.mood ?? (goal ? "happy" : "think")} size="s" />
            <Text variant="body" style={styles.flex} testID="progress-feedback-text">
              {feedback?.textTr ?? (goal ? "İlk tartıdan sonra planla gerçeği karşılaştırmaya başlarım." : "Bir hedef seçersen yediklerinin seni nereye götürdüğünü burada gösteririm.")}
            </Text>
          </View>
          <View style={styles.row}>
            {pct !== null ? <Chip testID="progress-adherence" label={`Bu hafta ${fmtPct(pct, 0)} hedefte`} size="sm" tone={tone} /> : null}
            <View style={styles.flex} />
            {goal ? (
              <Button label="Yol haritası" variant="secondary" size="sm" icon="goal" onPress={onOpenRoadmap} testID="progress-roadmap" />
            ) : (
              <Button label="Hedef belirle" size="sm" icon="goal" onPress={onSetGoal} testID="progress-set-goal" />
            )}
          </View>
        </Card>
      </Entry>

      {goal ? (
        <Entry index={1}>
          <Card testID="progress-plan">
            <Text variant="title">Plan ve gerçek</Text>
            <Text variant="caption" color="inkSubtle">
              kilo · kesikli çizgi plan, düz çizgi trend
            </Text>
            <PlanTrendChart rows={planRows} targetWeightKg={goal.plan.targetWeightKg} todayKey={todayKey} height={CHART_HEIGHT} testID="progress-plan-chart" />
          </Card>
        </Entry>
      ) : null}

      <Entry index={2}>
        <MeasureCard title="Yağ oranı" unit="%" points={bf} goal={goal?.targetBodyFatPct ?? null} onAdd={onAddMeasurement} testID="progress-bf" />
      </Entry>
      <Entry index={3}>
        <MeasureCard title="Bel" unit="cm" points={waist} goal={null} onAdd={onAddMeasurement} testID="progress-waist" />
      </Entry>
    </View>
  );
}

function MeasureCard({ title, unit, points, goal, onAdd, testID }: { title: string; unit: string; points: TrendPoint[]; goal: number | null; onAdd: () => void; testID: string }) {
  return (
    <Card testID={testID}>
      <Text variant="title">{title}</Text>
      {points.length >= 2 ? (
        <LineTrend points={points} goal={goal} unit={unit} height={CHART_HEIGHT} testID={`${testID}-chart`} />
      ) : (
        <View style={styles.gap}>
          <Text variant="body" color="inkMuted">
            Çizgi için en az iki ölçüm gerekiyor.
          </Text>
          <Button label="Ölçüm ekle" variant="secondary" size="sm" icon="weighIn" onPress={onAdd} testID={`${testID}-add`} />
        </View>
      )}
    </Card>
  );
}

function ProgressSkeleton() {
  return (
    <SkeletonGroup testID="progress-skeleton" style={styles.stack}>
      <Skeleton height={120} radius={radii.card} />
      <Skeleton height={CHART_HEIGHT + 80} radius={radii.card} />
      <Skeleton height={CHART_HEIGHT + 60} radius={radii.card} />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  gap: { gap: spacing.md },
  floo: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
});
