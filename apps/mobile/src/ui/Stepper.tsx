import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { clamp, round } from "@fitfloow/core";
import { useTheme } from "../theme/ThemeProvider";
import { radii, spacing } from "../theme/tokens";
import { Icon } from "./Icon";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

export interface StepperProps extends ViewProps {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  label?: string;
  size?: "sm" | "md";
}

function decimalsOf(step: number): number {
  const s = String(step);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

/** −/+ stepper with clamping and press-and-hold repeat. Value is tabular. */
export function Stepper({ value, onChange, step = 1, min = -Infinity, max = Infinity, format, label, size = "md", testID, style, ...rest }: StepperProps) {
  const { colors } = useTheme();
  const digits = decimalsOf(step);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const apply = useCallback(
    (dir: 1 | -1) => {
      const next = round(clamp(latest.current + dir * step, min, max), digits);
      if (next !== latest.current) {
        latest.current = next;
        onChange(next);
      }
    },
    [digits, max, min, onChange, step]
  );
  const stopRepeat = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  const startRepeat = useCallback(
    (dir: 1 | -1) => {
      stopRepeat();
      timer.current = setInterval(() => apply(dir), 90);
    },
    [apply, stopRepeat]
  );
  useEffect(() => stopRepeat, [stopRepeat]);

  const canDec = value > min;
  const canInc = value < max;
  const btn = size === "sm" ? 36 : 44;
  const display = format ? format(value) : value.toFixed(digits);

  return (
    <View {...rest} testID={testID} style={[styles.row, style]} accessibilityLabel={label}>
      <Pressable
        testID={testID ? `${testID}-dec` : undefined}
        onPress={() => apply(-1)}
        onLongPress={() => startRepeat(-1)}
        onPressOut={stopRepeat}
        disabled={!canDec}
        accessibilityLabel="Azalt"
        minTarget={false}
        style={[styles.btn, { width: btn, height: btn, backgroundColor: colors.surfaceMuted }]}
      >
        <Icon name="remove" size={20} color="ink" />
      </Pressable>
      <Text variant={size === "sm" ? "title" : "heading"} tabular align="center" style={styles.value} accessibilityLiveRegion="polite">
        {display}
      </Text>
      <Pressable
        testID={testID ? `${testID}-inc` : undefined}
        onPress={() => apply(1)}
        onLongPress={() => startRepeat(1)}
        onPressOut={stopRepeat}
        disabled={!canInc}
        accessibilityLabel="Artır"
        minTarget={false}
        style={[styles.btn, { width: btn, height: btn, backgroundColor: colors.primarySoft }]}
      >
        <Icon name="add" size={20} color="primary" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, alignSelf: "flex-start" },
  btn: { borderRadius: radii.control, alignItems: "center", justifyContent: "center" },
  value: { minWidth: 88 },
});
