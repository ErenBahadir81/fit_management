import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { BodyTrends } from "@fitfloow/core";
import { LineTrend } from "../../../charts/LineTrend";
import { fmtDelta } from "../../../lib/format";
import { radii, spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Reveal } from "../../../ui/Reveal";
import { Segmented } from "../../../ui/Segmented";
import { Skeleton, SkeletonGroup } from "../../../ui/Skeleton";
import { Text } from "../../../ui/Text";
import { RANGES, trendPoints, type RangeDays } from "../bodyMath";
import { BODY_HEIGHTS } from "../BodySkeleton";
import { useBodyTrends } from "../useBody";

const CHART_HEIGHT = 200;
const OPTIONS = RANGES.map((r) => ({ value: String(r.days), label: r.label }));

export interface TrendsCardProps {
  /** Goal target weight → dashed line (null when no goal). */
  goalWeightKg: number | null;
  /** Lifted so the hero can show the 7-day delta of the same series. */
  onTrends?: (t: BodyTrends | undefined) => void;
}

/** Weight trend: EWMA line, faded raw dots, dashed goal, scrub with haptic ticks; 30/90/180/365. */
export function TrendsCard({ goalWeightKg }: TrendsCardProps) {
  const [days, setDays] = useState<RangeDays>(90);
  const q = useBodyTrends(days);
  const points = useMemo(() => (q.data ? trendPoints(q.data) : []), [q.data]);
  const s = q.data?.summary;

  return (
    <Card style={styles.min} testID="body-trends">
      <View style={styles.head}>
        <Text variant="title">Trend</Text>
        <Text variant="caption" color="inkSubtle">
          çizgi trend · noktalar tartı
        </Text>
      </View>
      <Segmented options={OPTIONS} value={String(days)} onChange={(v) => setDays(Number(v) as RangeDays)} size="sm" testID="trend-range" style={styles.seg} />
      <Reveal ready={Boolean(q.data)} skeleton={<ChartSkeleton />}>
        {q.data ? <LineTrend points={points} goal={goalWeightKg} unit="kg" height={CHART_HEIGHT} testID="body-trend" /> : null}
      </Reveal>
      {s ? (
        <View style={styles.summary} accessibilityLabel={`Son 30 gün: kilo ${fmtDelta(s.weightDelta30d, "kg")}, yağ ${fmtDelta(s.bfDelta30d, "puan")}, bel ${fmtDelta(s.waistDelta30d, "cm")}`}>
          <Delta label="Kilo · 30 g" value={fmtDelta(s.weightDelta30d, "kg")} tone={toneFor(s.weightDelta30d)} />
          <Delta label="Yağ · 30 g" value={fmtDelta(s.bfDelta30d, "puan")} tone={toneFor(s.bfDelta30d)} />
          <Delta label="Bel · 30 g" value={fmtDelta(s.waistDelta30d, "cm")} tone={toneFor(s.waistDelta30d)} />
        </View>
      ) : null}
    </Card>
  );
}

function toneFor(v: number | null) {
  if (v === null) return "neutral" as const;
  return v < -0.05 ? ("success" as const) : v > 0.05 ? ("warning" as const) : ("neutral" as const);
}

function Delta({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "neutral" }) {
  return (
    <View style={styles.delta}>
      <Text variant="caption" color="inkMuted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="bodyStrong" tone={tone} tabular>
        {value}
      </Text>
    </View>
  );
}

function ChartSkeleton() {
  return (
    <SkeletonGroup style={{ gap: spacing.xs }}>
      <Skeleton width={140} height={30} radius={8} />
      <Skeleton height={CHART_HEIGHT} radius={radii.md} />
      <Skeleton height={18} width="70%" />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  min: { minHeight: BODY_HEIGHTS.trends },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing.md },
  seg: { marginBottom: spacing.md },
  summary: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  delta: { flex: 1, gap: 2 },
});
