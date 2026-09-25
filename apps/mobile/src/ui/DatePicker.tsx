import React, { useCallback, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { spacing } from "../theme/tokens";
import { Button } from "./Button";
import { Text } from "./Text";
import { WheelPicker, type WheelOption } from "./WheelPicker";

/** Turkish month names, index 0 = Ocak. */
const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"] as const;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad = (n: number) => String(n).padStart(2, "0");
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export interface DatePickerProps {
  /** `YYYY-MM-DD`, or null when nothing has been chosen yet. */
  value: string | null;
  onChange: (dateKey: string) => void;
  /** Screen-reader name for the group. */
  label: string;
  minYear?: number;
  maxYear?: number;
  testID?: string;
}

/**
 * Day / month / year as three snapping wheels — the control people expect for a birthday, instead
 * of a text field that asks them to spell out `YYYY-AA-GG`. A day that does not exist in the new
 * month clamps to the last one, so the picker can never emit an impossible date.
 *
 * With no value yet the wheels still have to rest somewhere (1 Ocak of a default year), so they
 * are dimmed and a line under them says nothing is chosen, with a button to take the shown date
 * as is; otherwise the resting date looks picked while the form still counts it as empty.
 */
export function DatePicker({ value, onChange, label, minYear = 1930, maxYear = new Date().getUTCFullYear(), testID }: DatePickerProps) {
  const fallbackYear = Math.min(Math.max(1995, minYear), maxYear);
  const [y, m, d] = useMemo(() => {
    const parts = value?.split("-").map(Number);
    if (!parts || parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return [fallbackYear, 1, 1];
    return parts as [number, number, number];
  }, [value, fallbackYear]);

  const years = useMemo<WheelOption<number>[]>(() => {
    const out: WheelOption<number>[] = [];
    for (let year = maxYear; year >= minYear; year--) out.push({ value: year, label: String(year) });
    return out;
  }, [minYear, maxYear]);
  const months = useMemo<WheelOption<number>[]>(() => MONTHS_TR.map((name, i) => ({ value: i + 1, label: name })), []);
  const days = useMemo<WheelOption<number>[]>(() => Array.from({ length: daysInMonth(y, m) }, (_, i) => ({ value: i + 1, label: String(i + 1) })), [y, m]);

  const emit = useCallback(
    (year: number, month: number, day: number) => onChange(key(year, month, Math.min(day, daysInMonth(year, month)))),
    [onChange]
  );

  const empty = value === null;

  return (
    <View accessibilityLabel={label} style={styles.wrap}>
      <View style={[styles.row, empty && styles.dim]}>
        <Column flex={2} caption="Gün">
          <WheelPicker options={days} value={Math.min(d, days.length)} onChange={(next) => emit(y, m, next)} label="Gün" testID={testID ? `${testID}-day` : undefined} />
        </Column>
        <Column flex={3} caption="Ay">
          <WheelPicker options={months} value={m} onChange={(next) => emit(y, next, d)} label="Ay" testID={testID ? `${testID}-month` : undefined} />
        </Column>
        <Column flex={2} caption="Yıl">
          <WheelPicker options={years} value={y} onChange={(next) => emit(next, m, d)} label="Yıl" testID={testID ? `${testID}-year` : undefined} />
        </Column>
      </View>
      {empty ? (
        <View style={styles.pending} testID={testID ? `${testID}-pending` : undefined}>
          <Text variant="caption" color="inkMuted" style={styles.pendingText} accessibilityLiveRegion="polite">
            Henüz seçilmedi; tekerlekleri kaydır.
          </Text>
          <Button
            label={`${d} ${MONTHS_TR[m - 1]} ${y} seç`}
            onPress={() => emit(y, m, d)}
            variant="secondary"
            size="sm"
            testID={testID ? `${testID}-accept` : undefined}
          />
        </View>
      ) : null}
    </View>
  );
}

function Column({ flex, caption, children }: { flex: number; caption: string; children: React.ReactNode }) {
  return (
    <View style={{ flex }}>
      <Text variant="caption" color="inkSubtle" align="center" style={styles.caption}>
        {caption}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: "row", gap: spacing.sm },
  caption: { marginBottom: spacing.xxs },
  dim: { opacity: 0.5 },
  pending: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pendingText: { flex: 1 },
});
