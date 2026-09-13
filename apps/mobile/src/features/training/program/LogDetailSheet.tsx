import React from "react";
import { StyleSheet, View } from "react-native";
import type { MuscleDTO, WorkoutLogDTO } from "@fitfloow/core";
import { fmtDate, fmtDuration, fmtInt, fmtNumber } from "../../../lib/format";
import { spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { Divider } from "../../../ui/Divider";
import { Sheet, type SheetRef } from "../../../ui/Sheet";
import { Text } from "../../../ui/Text";
import { logSummary, type LoggedSet } from "../lib/present";

export interface LogDetailSheetProps {
  sheetRef: React.RefObject<SheetRef | null>;
  log: WorkoutLogDTO | null;
  muscles: readonly MuscleDTO[];
  onDelete: (log: WorkoutLogDTO) => void;
}

/** Everything about one logged session: chips, muscle load, set-by-set list. */
export function LogDetailSheet({ sheetRef, log, muscles, onDelete }: LogDetailSheetProps) {
  const s = log ? logSummary(log) : null;
  const nameOf = (key: string) => muscles.find((m) => m.key === key)?.name ?? key;
  const colorOf = (key: string) => muscles.find((m) => m.key === key)?.color;

  return (
    <Sheet ref={sheetRef} title={log ? log.title : "Kayıt"}>
      <View style={styles.body} testID="log-sheet">
        {log && s ? (
          <>
            <Text variant="label" color="inkMuted">
              {fmtDate(log.dateKey, "weekday")} · {log.weekNumber}. hafta
            </Text>

            <View style={styles.chips}>
              {s.tonnageKg > 0 ? <Chip label={`${fmtInt(s.tonnageKg)} kg`} size="sm" icon="strength" tone="primary" /> : null}
              {s.sets > 0 ? <Chip label={`${s.sets} set`} size="sm" icon="sets" /> : null}
              {s.reps > 0 ? <Chip label={`${fmtNumber(s.reps, 0)} tekrar`} size="sm" /> : null}
              {s.km > 0 ? <Chip label={`${fmtNumber(s.km, 1)} km`} size="sm" icon="distance" /> : null}
              {s.pace !== null ? <Chip label={`${fmtNumber(s.pace, 2)} dk/km`} size="sm" icon="pace" /> : null}
              {log.durationMin ? <Chip label={fmtDuration(log.durationMin)} size="sm" icon="duration" /> : null}
              {log.rpe ? <Chip label={`RPE ${log.rpe}`} size="sm" tone="primary" /> : null}
            </View>

            {s.muscles.length > 0 ? (
              <View style={styles.chips} testID="log-muscle-chips">
                {s.muscles.map((m) => (
                  <Chip key={m.key} label={`${nameOf(m.key)} ${fmtNumber(m.sets, m.sets % 1 === 0 ? 0 : 1)}`} size="sm" dot={colorOf(m.key)} />
                ))}
              </View>
            ) : null}

            {log.isOffDay ? (
              <Text variant="body" color="inkMuted">
                Bu gün atlandı — kayıtlı set yok.
              </Text>
            ) : null}

            {log.strength.length > 0 ? (
              <View style={styles.exercises}>
                {log.strength.map((e, i) => (
                  <View key={`${e.name}-${i}`} style={styles.exercise}>
                    <View style={styles.exerciseHead}>
                      <Text variant="bodyStrong" numberOfLines={1} style={styles.grow}>
                        {e.name}
                      </Text>
                      {e.source === "extra" ? <Chip label="Ekstra" size="sm" tone="primary" /> : null}
                      {e.skipped ? <Chip label="Atlandı" size="sm" tone="warning" /> : null}
                    </View>
                    {e.sets.length > 0 ? (
                      <Text variant="caption" color="inkMuted" tabular>
                        {(e.sets as readonly LoggedSet[]).map((set) => setText(set, e.metric === "time")).join(" · ")}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            {log.run ? (
              <Text variant="caption" color="inkMuted" tabular>
                Koşu: {log.run.segments.map((seg) => `${fmtNumber(seg.km, 1)} km / ${fmtNumber(seg.min, 0)} dk`).join(" · ")}
              </Text>
            ) : null}
            {log.swim ? (
              <Text variant="caption" color="inkMuted" tabular>
                Yüzme: {log.swim.segments.map((seg) => `${fmtNumber(seg.km, 1)} km / ${fmtNumber(seg.min, 0)} dk`).join(" · ")}
              </Text>
            ) : null}
            {log.notes ? (
              <Text variant="body" color="inkMuted">
                “{log.notes}”
              </Text>
            ) : null}

            <Divider />
            <Button label="Kaydı sil" variant="danger" icon="delete" onPress={() => onDelete(log)} testID="log-delete" />
          </>
        ) : null}
      </View>
    </Sheet>
  );
}

/** "60 kg × 8 (RIR 2)" — or just the reps for the bodyweight and pre-2.1 sets. */
function setText(set: LoggedSet, isTime: boolean): string {
  const work = typeof set.weightKg === "number" ? `${fmtNumber(set.weightKg, set.weightKg % 1 === 0 ? 0 : 1)} kg × ${set.reps}` : `${set.reps}${isTime ? " sn" : ""}`;
  return set.rir !== null ? `${work} (RIR ${set.rir})` : work;
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  exercises: { gap: spacing.md },
  exercise: { gap: 2 },
  exerciseHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
});
