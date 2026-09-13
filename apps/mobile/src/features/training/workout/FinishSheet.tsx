import React from "react";
import { StyleSheet, View } from "react-native";
import type { MuscleDTO } from "@fitfloow/core";
import { fmtDuration, fmtInt, fmtNumber } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { Divider } from "../../../ui/Divider";
import { Icon } from "../../../ui/Icon";
import { Sheet, SheetActions, type SheetRef } from "../../../ui/Sheet";
import { Text } from "../../../ui/Text";
import { TextField } from "../../../ui/TextField";
import type { SessionCompare } from "../lib/present";
import { cardioTotals, doneSets, elapsedMinutes, muscleSets, totalReps, totalSets, totalTonnage, type LoggerState } from "../lib/logger";

const RPE = [5, 6, 7, 8, 9, 10];

export interface FinishSheetProps {
  sheetRef: React.RefObject<SheetRef | null>;
  state: LoggerState | null;
  now: number;
  muscles: readonly MuscleDTO[];
  /** Today against the last time this cycle day came round. */
  compare: SessionCompare | null;
  saving?: boolean;
  onRpe: (value: number | null) => void;
  onNotes: (value: string) => void;
  onFinish: () => void;
  onCancel: () => void;
}

/**
 * Finish: the session read back to you first — how much you moved, for how long, on what, and how
 * that sits against last time. RPE and the note come after, because they are the optional part.
 */
export function FinishSheet({ sheetRef, state, now, muscles, compare, saving, onRpe, onNotes, onFinish, onCancel }: FinishSheetProps) {
  const { colors } = useTheme();

  if (!state) {
    return (
      <Sheet ref={sheetRef}>
        <View testID="finish-sheet-empty" />
      </Sheet>
    );
  }

  const loads = muscleSets(state);
  const run = cardioTotals(state.run);
  const swim = cardioTotals(state.swim);
  const tonnage = totalTonnage(state);
  const nameOf = (key: string) => muscles.find((m) => m.key === key)?.name ?? key;
  const colorOf = (key: string) => muscles.find((m) => m.key === key)?.color;
  const chips = Object.entries(loads).sort((a, b) => b[1] - a[1]);
  const ahead = (compare?.deltaKg ?? 0) > 0 || (compare?.previousDateKey === null && tonnage > 0);

  return (
    <Sheet ref={sheetRef} title="Antrenmanı bitir">
      <View style={styles.body} testID="finish-sheet">
        <View style={styles.summary}>
          {tonnage > 0 ? <Stat label="Toplam yük" value={`${fmtInt(tonnage)} kg`} hero testID="finish-tonnage" /> : null}
          <Stat label="Set" value={`${doneSets(state)}/${totalSets(state)}`} hero={tonnage === 0} />
          <Stat label={state.exercises.some((e) => e.metric === "time") ? "Tekrar / sn" : "Tekrar"} value={fmtNumber(totalReps(state), 0)} />
          <Stat label="Süre" value={fmtDuration(elapsedMinutes(state, now))} />
        </View>

        {compare ? (
          <View style={[styles.compare, { backgroundColor: ahead ? colors.successSoft : colors.surfaceMuted }]} testID="finish-compare">
            <Icon name={ahead ? "trending-up" : "analytics-outline"} size={16} color={ahead ? "success" : "inkMuted"} />
            <Text variant="body" color="inkMuted" style={styles.grow}>
              {compare.summaryTr}
            </Text>
          </View>
        ) : null}

        {run.km > 0 || swim.km > 0 ? (
          <View style={styles.chips}>
            {run.km > 0 ? <Chip label={`Koşu ${fmtNumber(run.km, 2)} km · ${fmtNumber(run.min, 0)} dk`} size="sm" icon="distance" /> : null}
            {swim.km > 0 ? <Chip label={`Yüzme ${fmtNumber(swim.km, 2)} km · ${fmtNumber(swim.min, 0)} dk`} size="sm" icon="swim" /> : null}
          </View>
        ) : null}

        {chips.length > 0 ? (
          <View style={styles.block}>
            <Text variant="caption" color="inkSubtle">
              Çalışan kaslar
            </Text>
            <View style={styles.chips} testID="finish-muscle-chips">
              {chips.map(([key, sets]) => (
                <Chip key={key} label={`${nameOf(key)} ${fmtNumber(sets, sets % 1 === 0 ? 0 : 1)}`} size="sm" dot={colorOf(key)} />
              ))}
            </View>
          </View>
        ) : null}

        <Divider />

        <View style={styles.block}>
          <Text variant="label">Ne kadar zorlandın? (RPE)</Text>
          <View style={styles.chips}>
            {RPE.map((v) => (
              <Chip key={v} label={String(v)} selected={state.rpe === v} onPress={() => onRpe(state.rpe === v ? null : v)} testID={`rpe-${v}`} />
            ))}
          </View>
        </View>

        <TextField label="Not (isteğe bağlı)" value={state.notes} onChangeText={onNotes} placeholder="Bugün nasıl geçti?" multiline testID="finish-note" />

        <SheetActions>
          <Button label="Devam et" variant="ghost" onPress={onCancel} style={styles.grow} testID="finish-cancel" />
          <Button label="Bitir" variant="primary" icon="check" loading={saving} onPress={onFinish} style={styles.grow} testID="finish-confirm" />
        </SheetActions>
      </View>
    </Sheet>
  );
}

function Stat({ label, value, hero, testID }: { label: string; value: string; hero?: boolean; testID?: string }) {
  return (
    <View style={styles.stat} testID={testID}>
      <Text variant="caption" color="inkMuted">
        {label}
      </Text>
      <Text variant={hero ? "display" : "heading"} tabular>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  summary: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", columnGap: spacing.xl, rowGap: spacing.md },
  stat: { gap: 2 },
  compare: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radii.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  block: { gap: spacing.sm },
  grow: { flex: 1 },
});
