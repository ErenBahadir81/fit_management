import React from "react";
import { StyleSheet, View } from "react-native";
import type { MuscleDTO } from "@fitfloow/core";
import { fmtDuration, fmtNumber } from "../../../lib/format";
import { spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { Divider } from "../../../ui/Divider";
import { Sheet, SheetActions, type SheetRef } from "../../../ui/Sheet";
import { Text } from "../../../ui/Text";
import { TextField } from "../../../ui/TextField";
import { cardioTotals, doneSets, elapsedMinutes, muscleSets, totalReps, totalSets, type LoggerState } from "../lib/logger";

const RPE = [5, 6, 7, 8, 9, 10];

export interface FinishSheetProps {
  sheetRef: React.RefObject<SheetRef | null>;
  state: LoggerState | null;
  now: number;
  muscles: readonly MuscleDTO[];
  saving?: boolean;
  onRpe: (value: number | null) => void;
  onNotes: (value: string) => void;
  onFinish: () => void;
  onCancel: () => void;
}

/** Finish: what you actually did, an optional RPE + note, then one button. */
export function FinishSheet({ sheetRef, state, now, muscles, saving, onRpe, onNotes, onFinish, onCancel }: FinishSheetProps) {
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
  const nameOf = (key: string) => muscles.find((m) => m.key === key)?.name ?? key;
  const colorOf = (key: string) => muscles.find((m) => m.key === key)?.color;
  const chips = Object.entries(loads).sort((a, b) => b[1] - a[1]);

  return (
    <Sheet ref={sheetRef} title="Antrenmanı bitir">
      <View style={styles.body} testID="finish-sheet">
        <View style={styles.summary}>
          <Stat label="Set" value={`${doneSets(state)}/${totalSets(state)}`} />
          <Stat label={state.exercises.some((e) => e.metric === "time") ? "Tekrar / sn" : "Tekrar"} value={fmtNumber(totalReps(state), 0)} />
          <Stat label="Süre" value={fmtDuration(elapsedMinutes(state, now))} />
        </View>

        {run.km > 0 || swim.km > 0 ? (
          <View style={styles.chips}>
            {run.km > 0 ? <Chip label={`Koşu ${fmtNumber(run.km, 2)} km · ${fmtNumber(run.min, 0)} dk`} size="sm" icon="navigate-outline" /> : null}
            {swim.km > 0 ? <Chip label={`Yüzme ${fmtNumber(swim.km, 2)} km · ${fmtNumber(swim.min, 0)} dk`} size="sm" icon="water-outline" /> : null}
          </View>
        ) : null}

        {chips.length > 0 ? (
          <View style={styles.chips} testID="finish-muscle-chips">
            {chips.map(([key, sets]) => (
              <Chip key={key} label={`${nameOf(key)} ${fmtNumber(sets, sets % 1 === 0 ? 0 : 1)}`} size="sm" dot={colorOf(key)} />
            ))}
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
          <Button label="Bitir" variant="primary" icon="checkmark" loading={saving} onPress={onFinish} style={styles.grow} testID="finish-confirm" />
        </SheetActions>
      </View>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="caption" color="inkMuted">
        {label}
      </Text>
      <Text variant="heading" tabular>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  summary: { flexDirection: "row", gap: spacing.xxl },
  stat: { gap: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  block: { gap: spacing.sm },
  grow: { flex: 1 },
});
