import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View, type GestureResponderEvent } from "react-native";
import Svg, { Circle, G, Line, Polyline } from "react-native-svg";

/**
 * Plain `react-native-svg` line chart used **on web only**.
 *
 * `@shopify/react-native-skia` (and therefore `victory-native`'s `CartesianChart`) needs the
 * CanvasKit WASM runtime, which this app does not ship for web: every Skia chart threw
 * `Cannot read properties of undefined (reading 'XYWHRect')`, which blanked the Vücut tab
 * ("Bu ekran yüklenemedi") and the whole Yol haritası screen. Charts are read-only pixels, so web
 * draws the same grammar — solid trend, faded raw dots, dashed reference lines — with SVG instead.
 * Native keeps Skia untouched.
 */
export interface SvgSeries {
  values: (number | null)[];
  color: string;
  /** Stroke width for lines; ignored for dot series. */
  width?: number;
  dashed?: boolean;
  /** Draw points instead of a line. */
  dots?: boolean;
  dotRadius?: number;
  opacity?: number;
  /** Bridge gaps instead of breaking the line. */
  connectMissing?: boolean;
}

export interface SvgRefLine {
  value: number;
  color: string;
  dashed?: boolean;
}

export interface SvgLineChartProps {
  /** Number of x slots (all series share it). */
  count: number;
  series: SvgSeries[];
  domainY: [number, number];
  height: number;
  gridColor: string;
  /** Horizontal grid values, in data space. */
  yTicks?: number[];
  refLines?: SvgRefLine[];
  /** Vertical rule (e.g. "today"). */
  markerIndex?: number | null;
  markerColor?: string;
  /** Scrub: index under the finger/pointer, or null on release. */
  onActiveIndexChange?: (index: number | null) => void;
  activeIndex?: number | null;
  activeColor?: string;
  testID?: string;
}

const PAD = 8;

export function SvgLineChart({
  count,
  series,
  domainY,
  height,
  gridColor,
  yTicks = [],
  refLines = [],
  markerIndex = null,
  markerColor,
  onActiveIndexChange,
  activeIndex = null,
  activeColor,
  testID,
}: SvgLineChartProps) {
  const [width, setWidth] = useState(0);
  const [lo, hi] = domainY;
  const span = hi - lo || 1;

  const xAt = useCallback((i: number) => (count <= 1 ? width / 2 : PAD + (i / (count - 1)) * Math.max(0, width - PAD * 2)), [count, width]);
  const yAt = useCallback((v: number) => height - PAD - ((v - lo) / span) * Math.max(0, height - PAD * 2), [height, lo, span]);

  /** Polyline point strings, split on gaps unless the series bridges them. */
  const paths = useMemo(
    () =>
      series.map((s) => {
        if (s.dots) return [];
        const segments: string[] = [];
        let current: string[] = [];
        for (let i = 0; i < count; i++) {
          const v = s.values[i];
          if (v === null || v === undefined || !Number.isFinite(v)) {
            if (!s.connectMissing && current.length) {
              segments.push(current.join(" "));
              current = [];
            }
            continue;
          }
          current.push(`${xAt(i)},${yAt(v)}`);
        }
        if (current.length) segments.push(current.join(" "));
        return segments.filter((seg) => seg.includes(" "));
      }),
    [count, series, xAt, yAt]
  );

  const report = useCallback(
    (e: GestureResponderEvent) => {
      if (!onActiveIndexChange || width <= 0 || count <= 1) return;
      const usable = Math.max(1, width - PAD * 2);
      const ratio = (e.nativeEvent.locationX - PAD) / usable;
      const i = Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
      onActiveIndexChange(i);
    },
    [count, onActiveIndexChange, width]
  );
  const release = useCallback(() => onActiveIndexChange?.(null), [onActiveIndexChange]);

  const responder = onActiveIndexChange
    ? {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderGrant: report,
        onResponderMove: report,
        onResponderRelease: release,
        onResponderTerminate: release,
      }
    : null;

  return (
    <View testID={testID} style={[styles.fill, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...responder}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <G>
            {yTicks.map((t) => (
              <Line key={`grid-${t}`} x1={0} y1={yAt(t)} x2={width} y2={yAt(t)} stroke={gridColor} strokeWidth={1} />
            ))}
            {refLines.map((r, i) => (
              <Line key={`ref-${i}`} x1={0} y1={yAt(r.value)} x2={width} y2={yAt(r.value)} stroke={r.color} strokeWidth={1.5} opacity={0.8} strokeDasharray={r.dashed === false ? undefined : "6,6"} />
            ))}
            {markerIndex !== null && markerIndex >= 0 && markerIndex < count ? (
              <Line x1={xAt(markerIndex)} y1={PAD} x2={xAt(markerIndex)} y2={height - PAD} stroke={markerColor ?? gridColor} strokeWidth={1} />
            ) : null}
            {series.map((s, si) =>
              s.dots
                ? s.values.map((v, i) =>
                    v === null || v === undefined || !Number.isFinite(v) ? null : (
                      <Circle key={`d-${si}-${i}`} cx={xAt(i)} cy={yAt(v)} r={s.dotRadius ?? 3} fill={s.color} opacity={s.opacity ?? 0.35} />
                    )
                  )
                : paths[si].map((points, pi) => (
                    <Polyline
                      key={`p-${si}-${pi}`}
                      points={points}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={s.width ?? 2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={s.opacity ?? 1}
                      strokeDasharray={s.dashed ? "5,5" : undefined}
                    />
                  ))
            )}
            {activeIndex !== null && activeIndex >= 0 && activeIndex < count ? (
              <Line x1={xAt(activeIndex)} y1={PAD} x2={xAt(activeIndex)} y2={height - PAD} stroke={activeColor ?? gridColor} strokeWidth={1} opacity={0.6} />
            ) : null}
          </G>
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { width: "100%" } });
