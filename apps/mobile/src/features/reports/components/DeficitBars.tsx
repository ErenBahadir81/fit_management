import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Line, Rect } from "react-native-svg";
import { barLayout } from "../../../charts/chartMath";
import { fmtKcal } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { springs, timing } from "../../../theme/motion";
import { spacing } from "../../../theme/tokens";
import { Text } from "../../../ui/Text";
import type { DeficitBar } from "../reportMath";

const ARect = Animated.createAnimatedComponent(Rect);

export interface DeficitBarsProps {
  bars: DeficitBar[];
  /** Planned daily deficit → dashed line (0 hides it). */
  plannedPerDay: number;
  height?: number;
  testID?: string;
}

/**
 * Seven deficit bars around a zero baseline: green up = kcal banked, red down = over the TDEE,
 * dotted = not logged, faint = not happened yet, today outlined. Dashed line = planned per day.
 */
export function DeficitBars({ bars, plannedPerDay, height = 140, testID }: DeficitBarsProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const { step, barWidth, x } = barLayout(bars.length, width, 10);
  const maxPos = Math.max(300, plannedPerDay, ...bars.map((b) => Math.max(0, b.deficit)));
  const maxNeg = Math.max(0, ...bars.map((b) => Math.max(0, -b.deficit)));
  const hasNeg = maxNeg > 0;
  const pad = 8;
  const baseline = hasNeg ? Math.round(height * 0.68) : height - pad;
  const k = Math.min((baseline - pad) / maxPos, hasNeg ? (height - baseline - pad) / maxNeg : Infinity);
  const plannedY = baseline - plannedPerDay * k;
  const logged = bars.filter((b) => b.logged).length;

  return (
    <View testID={testID} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityLabel={`Günlük kalori açığı, planlanan günde ${fmtKcal(plannedPerDay)}, ${logged} gün kayıtlı`}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Line x1={0} x2={width} y1={baseline} y2={baseline} stroke={colors.chartGrid} strokeWidth={1} />
          {bars.map((b, i) => {
            const h = Math.abs(b.deficit) * k;
            const up = b.deficit >= 0;
            const fill = b.future ? colors.ringTrack : !b.logged ? colors.ringTrack : up ? colors.success : colors.danger;
            return (
              <Bar
                key={b.dateKey}
                index={i}
                x={x(i)}
                width={barWidth}
                baseline={baseline}
                h={b.logged ? Math.max(h, 3) : 3}
                up={up}
                fill={fill}
                opacity={b.future ? 0.35 : b.logged ? 0.9 : 0.8}
                dashed={!b.logged && !b.future}
                stroke={b.isToday ? colors.primary : undefined}
              />
            );
          })}
          {plannedPerDay > 0 ? <Line x1={0} x2={width} y1={plannedY} y2={plannedY} stroke={colors.success} strokeWidth={1.5} strokeDasharray="5 5" /> : null}
        </Svg>
      )}
      <View style={[styles.labels, width > 0 && { width }]}>
        {bars.map((b) => (
          <View key={b.dateKey} style={{ width: step, alignItems: "center" }}>
            <Text variant="caption" color={b.isToday ? "primary" : b.future ? "inkSubtle" : "inkMuted"} weight={b.isToday ? "700" : undefined}>
              {b.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Bar({ index, x, width, baseline, h, up, fill, opacity, dashed, stroke }: { index: number; x: number; width: number; baseline: number; h: number; up: boolean; fill: string; opacity: number; dashed: boolean; stroke?: string }) {
  const reduce = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = reduce ? withTiming(h, timing.reduced) : withDelay(index * 30, withSpring(h, springs.gentle));
  }, [h, index, reduce, v]);
  const props = useAnimatedProps(() => ({ y: up ? baseline - v.value : baseline, height: Math.max(v.value, 2) }));
  return <ARect x={x} width={width} rx={Math.min(6, width / 2)} fill={fill} opacity={opacity} stroke={stroke} strokeWidth={stroke ? 2 : 0} strokeDasharray={dashed ? "3 3" : undefined} animatedProps={props} />;
}

const styles = StyleSheet.create({ labels: { flexDirection: "row", marginTop: spacing.xs } });
