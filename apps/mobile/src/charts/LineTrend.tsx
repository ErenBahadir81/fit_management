import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Circle, DashPathEffect, Group, Line as SkLine, Path } from "@shopify/react-native-skia";
import { runOnJS, useAnimatedReaction, useDerivedValue } from "react-native-reanimated";
import { CartesianChart, Line, Scatter, useChartPressState, useLinePath } from "victory-native";
import { haptic } from "../lib/haptics";
import { fmtDate, fmtNumber } from "../lib/format";
import { useTheme } from "../theme/ThemeProvider";
import { spacing } from "../theme/tokens";
import { Text } from "../ui/Text";
import { buildTrendSeries, dateTickLabels, ticks, type TrendPoint } from "./chartMath";

export interface LineTrendProps {
  points: TrendPoint[];
  /** Dashed horizontal goal line. */
  goal?: number | null;
  unit?: string;
  height?: number;
  digits?: number;
  testID?: string;
}

/**
 * Skia line chart: EWMA solid, raw as faded dots, dashed goal line, press-and-drag scrub with a
 * haptic tick on every point change. Axis labels are RN text (no Skia font loading needed).
 */
export function LineTrend({ points, goal, unit = "", height = 200, digits = 1, testID }: LineTrendProps) {
  const { colors } = useTheme();
  const series = useMemo(() => buildTrendSeries(points, goal), [points, goal]);
  const xLabels = useMemo(() => dateTickLabels(points.map((p) => p.dateKey), 4), [points]);
  const yTicks = useMemo(() => ticks(series.domainY[0], series.domainY[1], 3), [series.domainY]);
  const [active, setActive] = useState<number | null>(null);
  const { state, isActive } = useChartPressState({ x: 0, y: { ewma: 0, raw: 0, goal: 0 } });

  const onTick = useCallback((index: number) => {
    void haptic.select();
    setActive(index);
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

  if (points.length < 2) {
    return (
      <View testID={testID} style={[styles.empty, { height, backgroundColor: colors.surfaceMuted }]}>
        <Text variant="body" color="inkMuted">
          Trend için yeterli veri yok
        </Text>
      </View>
    );
  }

  const activeRow = active !== null ? series.data[active] : null;
  return (
    <View testID={testID}>
      <View style={styles.tooltip}>
        {activeRow ? (
          <>
            <Text variant="label" color="inkMuted">
              {fmtDate(activeRow.dateKey, "weekday")}
            </Text>
            <Text variant="title" tabular>
              {fmtNumber(activeRow.ewma ?? activeRow.raw, digits)} {unit}
              {activeRow.raw !== null && activeRow.ewma !== null ? (
                <Text variant="caption" color="inkSubtle" tabular>
                  {"  "}ham {fmtNumber(activeRow.raw, digits)}
                </Text>
              ) : null}
            </Text>
          </>
        ) : (
          <Text variant="caption" color="inkSubtle">
            Basılı tutup kaydırarak incele
          </Text>
        )}
      </View>
      <View style={[styles.row, { height }]}>
        <View style={styles.yAxis}>
          {[...yTicks].reverse().map((t) => (
            <Text key={t} variant="caption" color="inkSubtle" tabular>
              {fmtNumber(t, digits)}
            </Text>
          ))}
        </View>
        <View style={styles.canvas}>
          <CartesianChart
            data={series.data}
            xKey="x"
            yKeys={["ewma", "raw", "goal"]}
            domain={{ y: series.domainY }}
            domainPadding={{ left: 8, right: 8, top: 8, bottom: 8 }}
            chartPressState={state}
            frame={{ lineWidth: 0 }}
            xAxis={{ font: null, lineWidth: 0, tickCount: 0 }}
            yAxis={[{ font: null, lineColor: colors.chartGrid, lineWidth: 1, tickValues: yTicks }]}
          >
            {({ points: p }) => (
              <>
                {goal != null && <GoalLine points={p.goal} color={colors.inkSubtle} />}
                <Scatter points={p.raw} radius={3} color={colors.primary} opacity={0.35} />
                <Line points={p.ewma} color={colors.primary} strokeWidth={2.5} curveType="monotoneX" connectMissingData animate={{ type: "timing", duration: 320 }} />
                {isActive && <Cursor x={state.x.position} y={state.y.ewma.position} color={colors.primary} track={colors.border} />}
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

function GoalLine({ points, color }: { points: Parameters<typeof useLinePath>[0]; color: string }) {
  const { path } = useLinePath(points, { connectMissingData: true });
  return (
    <Path path={path} style="stroke" color={color} strokeWidth={1.5} opacity={0.8}>
      <DashPathEffect intervals={[6, 6]} />
    </Path>
  );
}

function Cursor({ x, y, color, track }: { x: { value: number }; y: { value: number }; color: string; track: string }) {
  const sx = x as unknown as import("react-native-reanimated").SharedValue<number>;
  const sy = y as unknown as import("react-native-reanimated").SharedValue<number>;
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

const styles = StyleSheet.create({
  empty: { borderRadius: 18, alignItems: "center", justifyContent: "center" },
  tooltip: { minHeight: 44, justifyContent: "flex-end", marginBottom: spacing.xs },
  row: { flexDirection: "row" },
  yAxis: { width: 44, justifyContent: "space-between", paddingVertical: 8, alignItems: "flex-end", paddingRight: spacing.sm },
  canvas: { flex: 1 },
  xAxis: { height: 18, marginLeft: 44, marginTop: spacing.xs },
});
