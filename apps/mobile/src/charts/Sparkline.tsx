import React from "react";
import { View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import { useTheme } from "../theme/ThemeProvider";
import { niceDomain } from "./chartMath";

export interface SparklineProps {
  values: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
  testID?: string;
}

/** Tiny trend line for list rows and tiles. Needs ≥ 2 finite points, otherwise an empty box. */
export function Sparkline({ values, width = 84, height = 28, color, testID }: SparklineProps) {
  const { colors } = useTheme();
  const stroke = color ?? colors.primary;
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => typeof p[1] === "number");
  if (pts.length < 2) return <View testID={testID} style={{ width, height }} />;
  const [min, max] = niceDomain(pts.map((p) => p[1]), 0.15);
  const n = values.length;
  const pad = 3;
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / (max - min)) * (height - pad * 2);
  const last = pts[pts.length - 1];
  return (
    <View testID={testID} style={{ width, height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>
        <Polyline points={pts.map((p) => `${x(p[0])},${y(p[1])}`).join(" ")} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={x(last[0])} cy={y(last[1])} r={3} fill={stroke} />
      </Svg>
    </View>
  );
}
