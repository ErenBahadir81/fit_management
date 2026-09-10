import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Circle, DashPathEffect, Group, Line as SkLine, Path } from "@shopify/react-native-skia";
import { runOnJS, useAnimatedReaction, useDerivedValue, type SharedValue } from "react-native-reanimated";
import { CartesianChart, Line, Scatter, useChartPressState, useLinePath } from "victory-native";
import { dateTickLabels, niceDomain, ticks } from "../../../charts/chartMath";
import { fmtDate, fmtNumber } from "../../../lib/format";
import { haptic } from "../../../lib/haptics";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Text } from "../../../ui/Text";
import type { PlanRow } from "../goalMath";

export interface PlanTrendChartProps {
  rows: PlanRow[];
  targetWeightKg: number;
  todayKey: string;
  height?: number;
  testID?: string;
}

type Row = { x: number; dateKey: string; expected: number; actual: number | null; raw: number | null };

/**
 * Expected (dashed) vs actual trend (solid) with faded weigh-ins, a "today" marker and the target
 * line; press-and-drag scrub with a haptic tick per day. Same visual grammar as `LineTrend`.
 */
export function PlanTrendChart({ rows, targetWeightKg, todayKey, height = 200, testID }: PlanTrendChartProps) {
  const { colors } = useTheme();
  const data = useMemo<Row[]>(() => rows.map((r) => ({ x: r.x, dateKey: r.dateKey, expected: r.expected, actual: r.actual, raw: r.raw })), [rows]);
  const domainY = useMemo(() => niceDomain([...rows.map((r) => r.expected), ...rows.map((r) => r.actual), ...rows.map((r) => r.raw), targetWeightKg], 0.1), [rows, targetWeightKg]);
  const yTicks = useMemo(() => ticks(domainY[0], domainY[1], 3), [domainY]);
  const xLabels = useMemo(() => dateTickLabels(rows.map((r) => r.dateKey), 4), [rows]);
  const todayIndex = useMemo(() => rows.findIndex((r) => r.dateKey === todayKey), [rows, todayKey]);
  const [active, setActive] = useState<number | null>(null);
  const { state, isActive } = useChartPressState({ x: 0, y: { expected: 0, actual: 0, raw: 0 } });

  const onTick = useCallback((i: number) => {
    void haptic.select();
    setActive(i);
  }, []);
  const onRelease = useCallback(() => setActive(null), []);
  useAnimatedReaction(
    () => ({ i: state.matchedIndex.value, on: state.isActive.value }),
    (cur, prev) => {
      if (cur.on && cur.i >= 0 && cur.i !== prev?.i) runOnJS(onTick)(cur.i);
      if (!cur.on && prev?.on) runOnJS(onRelease)();
    },
    [onTick, onRelease]
  );

  if (rows.length < 2) {
    return (
      <View testID={testID} style={[styles.empty, { height, backgroundColor: colors.surfaceMuted }]}>
        <Text variant="body" color="inkMuted">
          Plan için yeterli veri yok
        </Text>
      </View>
    );
  }

  const row = active !== null ? data[active] : null;
  return (
    <View testID={testID}>
      <View style={styles.tooltip}>
        {row ? (
          <>
            <Text variant="label" color="inkMuted">
              {fmtDate(row.dateKey, "weekday")}
            </Text>
            <Text variant="title" tabular>
              {row.actual !== null ? `${fmtNumber(row.actual, 1)} kg` : "—"}
              <Text variant="caption" color="inkSubtle" tabular>
                {"  "}beklenen {fmtNumber(row.expected, 1)}
              </Text>
            </Text>
          </>
        ) : (
          <View style={styles.legend}>
            <Legend color={colors.primary} label="gerçek trend" />
            <Legend color={colors.inkSubtle} dashed label="plan" />
            <Legend color={colors.success} dashed label="hedef" />
          </View>
        )}
      </View>
      <View style={[styles.row, { height }]}>
        <View style={styles.yAxis}>
          {[...yTicks].reverse().map((t) => (
            <Text key={t} variant="caption" color="inkSubtle" tabular>
              {fmtNumber(t, 1)}
            </Text>
          ))}
        </View>
        <View style={styles.canvas}>
          <CartesianChart
            data={data}
            xKey="x"
            yKeys={["expected", "actual", "raw"]}
            domain={{ y: domainY }}
            domainPadding={{ left: 8, right: 8, top: 8, bottom: 8 }}
            chartPressState={state}
            frame={{ lineWidth: 0 }}
            xAxis={{ font: null, lineWidth: 0, tickCount: 0 }}
            yAxis={[{ font: null, lineColor: colors.chartGrid, lineWidth: 1, tickValues: yTicks }]}
          >
            {({ points, chartBounds, yScale }) => (
              <>
                <SkLine p1={{ x: chartBounds.left, y: yScale(targetWeightKg) }} p2={{ x: chartBounds.right, y: yScale(targetWeightKg) }} color={colors.success} strokeWidth={1.5} opacity={0.8}>
                  <DashPathEffect intervals={[6, 6]} />
                </SkLine>
                <DashedLine points={points.expected} color={colors.inkSubtle} />
                {todayIndex >= 0 && points.expected[todayIndex] ? (
                  <SkLine p1={{ x: points.expected[todayIndex].x, y: chartBounds.top }} p2={{ x: points.expected[todayIndex].x, y: chartBounds.bottom }} color={colors.border} strokeWidth={1} />
                ) : null}
                <Scatter points={points.raw} radius={2.5} color={colors.primary} opacity={0.3} animate={{ type: "timing", duration: 320 }} />
                <Line points={points.actual} color={colors.primary} strokeWidth={2.5} curveType="monotoneX" connectMissingData={false} animate={{ type: "timing", duration: 320 }} />
                {isActive && <Cursor x={state.x.position} y={state.y.actual.position} color={colors.primary} track={colors.border} />}
              </>
            )}
          </CartesianChart>
        </View>
      </View>
      <View style={styles.xAxis}>
        {xLabels.map((l, i) => (
          <Text key={i} variant="caption" color="inkSubtle" style={{ opacity: l ? 1 : 0, position: "absolute", left: `${(i / Math.max(1, xLabels.length - 1)) * 100}%`, transform: [{ translateX: i === 0 ? 0 : i === xLabels.length - 1 ? -34 : -17 }] }}>
            {l || "·"}
          </Text>
        ))}
      </View>
    </View>
  );
}

function DashedLine({ points, color }: { points: Parameters<typeof useLinePath>[0]; color: string }) {
  const { path } = useLinePath(points, { curveType: "monotoneX", connectMissingData: true });
  return (
    <Path path={path} style="stroke" color={color} strokeWidth={2}>
      <DashPathEffect intervals={[5, 5]} />
    </Path>
  );
}

function Cursor({ x, y, color, track }: { x: { value: number }; y: { value: number }; color: string; track: string }) {
  const sx = x as unknown as SharedValue<number>;
  const sy = y as unknown as SharedValue<number>;
  const p1 = useDerivedValue(() => ({ x: sx.value, y: 0 }));
  const p2 = useDerivedValue(() => ({ x: sx.value, y: 10_000 }));
  return (
    <Group>
      <SkLine p1={p1} p2={p2} color={track} strokeWidth={1} />
      <Circle cx={sx} cy={sy} r={7} color={color} opacity={0.25} />
      <Circle cx={sx} cy={sy} r={4} color={color} />
    </Group>
  );
}

function Legend({ color, dashed, label }: { color: string; dashed?: boolean; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }, dashed && styles.dashed]} />
      <Text variant="caption" color="inkMuted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  tooltip: { minHeight: 44, justifyContent: "flex-end", marginBottom: spacing.xs },
  legend: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  swatch: { width: 16, height: 3, borderRadius: 2 },
  dashed: { opacity: 0.7 },
  row: { flexDirection: "row" },
  yAxis: { width: 44, justifyContent: "space-between", paddingVertical: 8, alignItems: "flex-end", paddingRight: spacing.sm },
  canvas: { flex: 1 },
  xAxis: { height: 18, marginLeft: 44, marginTop: spacing.xs },
});
