import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Line, Rect } from "react-native-svg";
import { fmtKcal } from "../lib/format";
import { useTheme } from "../theme/ThemeProvider";
import { springs, timing } from "../theme/motion";
import { spacing } from "../theme/tokens";
import { Text } from "../ui/Text";
import { barLayout, niceDomain } from "./chartMath";

const ARect = Animated.createAnimatedComponent(Rect);

export interface BarWeekDay {
  label: string;
  value: number;
  logged: boolean;
}
export interface BarWeekProps {
  days: BarWeekDay[];
  target: number;
  todayIndex?: number | null;
  height?: number;
  /** Format for the a11y summary (default kcal). */
  format?: (v: number) => string;
  testID?: string;
}

/** 7 bars vs a dashed target line; bars grow in with a staggered spring. */
export function BarWeek({ days, target, todayIndex = null, height = 120, format = fmtKcal, testID }: BarWeekProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [, max] = niceDomain([...days.map((d) => d.value), target], 0.15);
  const scaleY = (v: number) => (max > 0 ? (v / max) * height : 0);
  const { step, barWidth, x } = barLayout(days.length, width, 8);
  const targetY = height - scaleY(target);

  return (
    <View testID={testID} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityLabel={`Haftalık dağılım, hedef ${format(target)}`}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {days.map((d, i) => (
            <Bar
              key={i}
              index={i}
              x={x(i) + 0}
              width={barWidth}
              height={height}
              h={scaleY(d.value)}
              color={i === todayIndex ? colors.primary : d.logged ? colors.primaryStrong : colors.ringTrack}
              opacity={i === todayIndex ? 1 : d.logged ? 0.55 : 1}
            />
          ))}
          <Line x1={0} x2={width} y1={targetY} y2={targetY} stroke={colors.inkSubtle} strokeWidth={1.5} strokeDasharray="5 5" />
        </Svg>
      )}
      <View style={[styles.labels, width > 0 && { width }]}>
        {days.map((d, i) => (
          <View key={i} style={{ width: step, alignItems: "center" }}>
            <Text variant="caption" color={i === todayIndex ? "primary" : "inkMuted"} weight={i === todayIndex ? "700" : undefined}>
              {d.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Bar({ index, x, width, height, h, color, opacity }: { index: number; x: number; width: number; height: number; h: number; color: string; opacity: number }) {
  const reduce = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = reduce ? withTiming(h, timing.reduced) : withDelay(index * 30, withSpring(h, springs.gentle));
  }, [h, index, reduce, v]);
  const props = useAnimatedProps(() => ({ y: height - Math.max(v.value, 4), height: Math.max(v.value, 4) }));
  return <ARect x={x} width={width} rx={Math.min(6, width / 2)} fill={color} opacity={opacity} animatedProps={props} />;
}

const styles = StyleSheet.create({ labels: { flexDirection: "row", marginTop: spacing.xs } });
