import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import type { MuscleDTO } from "@fitfloow/core";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Stepper } from "../../../ui/Stepper";
import { Text } from "../../../ui/Text";
import { activeSetIndex, type LoggerExercise } from "../lib/logger";

export interface ExercisePaneProps {
  exercise: LoggerExercise;
  index: number;
  width: number;
  muscles: readonly MuscleDTO[];
  onSetReps: (setIndex: number, value: number) => void;
  onSetRir: (setIndex: number, value: number) => void;
  onUndoSet: (setIndex: number) => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
  onToggleSkip: () => void;
}

/** One exercise, one pane: logged sets above, the set you are on as the hero. */
export function ExercisePane({ exercise, index, width, muscles, onSetReps, onSetRir, onUndoSet, onAddSet, onRemoveSet, onToggleSkip }: ExercisePaneProps) {
  const { colors } = useTheme();
  const active = activeSetIndex(exercise);
  const isTime = exercise.metric === "time";
  const unit = isTime ? "sn" : "tekrar";
  const nameOf = (key: string) => muscles.find((m) => m.key === key)?.name ?? key;
  const colorOf = (key: string) => muscles.find((m) => m.key === key)?.color;
  const done = exercise.sets.filter((s) => s.done).length;

  return (
    <View style={[styles.pane, { width }]} testID={`pane-${index}`}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Text variant="display" numberOfLines={2}>
            {exercise.name}
          </Text>
          <View style={styles.chips}>
            {exercise.source === "extra" ? <Chip label="Ekstra" size="sm" tone="primary" /> : null}
            {exercise.muscles.map((m) => (
              <Chip key={m.key} label={nameOf(m.key)} size="sm" dot={colorOf(m.key)} />
            ))}
          </View>
          <Text variant="body" color="inkMuted" tabular>
            Hedef {exercise.plannedSets}×{exercise.plannedReps} {isTime ? "sn" : ""}
            {exercise.plannedRIR !== null ? ` · RIR ${exercise.plannedRIR}` : ""} · {done}/{exercise.sets.length} set
          </Text>
        </View>

        {exercise.skipped ? (
          <View style={[styles.skipped, { backgroundColor: colors.warningSoft }]} testID={`pane-skipped-${index}`}>
            <Icon name="play-skip-forward" size={18} color="warning" />
            <Text variant="bodyStrong" tone="warning" style={styles.grow}>
              Bu hareket atlandı
            </Text>
            <Chip label="Geri al" size="sm" tone="warning" onPress={onToggleSkip} testID={`pane-unskip-${index}`} />
          </View>
        ) : (
          <>
            <View style={styles.setList}>
              {exercise.sets.map((set, i) =>
                set.done ? (
                  <Pressable
                    key={i}
                    onPress={() => onUndoSet(i)}
                    haptic="select"
                    testID={`set-done-${index}-${i}`}
                    accessibilityLabel={`${i + 1}. set tamam, ${set.reps} ${unit}${set.rir !== null ? `, RIR ${set.rir}` : ""}. Geri almak için dokun`}
                    style={[styles.doneRow, { backgroundColor: colors.successSoft }]}
                  >
                    <View style={[styles.badge, { backgroundColor: colors.success }]}>
                      <Icon name="checkmark" size={14} color={colors.inkInverse} />
                    </View>
                    <Text variant="bodyStrong" tabular style={styles.grow}>
                      {set.reps} {unit}
                    </Text>
                    {set.rir !== null ? (
                      <Text variant="caption" color="inkMuted" tabular>
                        RIR {set.rir}
                      </Text>
                    ) : null}
                  </Pressable>
                ) : i === active ? (
                  <Animated.View key={i} entering={FadeIn.duration(160)} style={[styles.activeCard, { backgroundColor: colors.surface, borderColor: colors.primary }]} testID={`set-active-${index}`}>
                    <Text variant="label" tone="primary">
                      {i + 1}. SET
                    </Text>
                    <View style={styles.field}>
                      <Text variant="caption" color="inkMuted">
                        {isTime ? "Saniye" : "Tekrar"}
                      </Text>
                      <Stepper value={set.reps} onChange={(v) => onSetReps(i, v)} min={0} max={isTime ? 3600 : 300} step={isTime ? 5 : 1} label={isTime ? "Saniye" : "Tekrar"} testID={`reps-${index}`} />
                    </View>
                    <View style={styles.field}>
                      <Text variant="caption" color="inkMuted">
                        RIR
                      </Text>
                      <Stepper value={set.rir ?? 0} onChange={(v) => onSetRir(i, v)} min={0} max={10} label="RIR" testID={`rir-${index}`} />
                    </View>
                  </Animated.View>
                ) : (
                  <View key={i} style={[styles.pendingRow, { borderColor: colors.border }]} testID={`set-pending-${index}-${i}`}>
                    <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }]}>
                      <Text variant="caption" color="inkMuted" tabular>
                        {i + 1}
                      </Text>
                    </View>
                    <Text variant="body" color="inkSubtle" tabular style={styles.grow}>
                      {set.reps} {unit}
                    </Text>
                  </View>
                )
              )}
            </View>

            <View style={styles.actions}>
              <Button label="Set ekle" variant="ghost" size="sm" icon="add" onPress={onAddSet} testID={`add-set-${index}`} />
              <Button label="Set sil" variant="ghost" size="sm" icon="remove" onPress={onRemoveSet} testID={`remove-set-${index}`} />
              <Button label="Hareketi atla" variant="ghost" size="sm" icon="play-skip-forward-outline" onPress={onToggleSkip} testID={`skip-exercise-${index}`} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  scroll: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.xxl, gap: spacing.lg },
  head: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  setList: { gap: spacing.sm },
  doneRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.lg, borderRadius: radii.control },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.lg, borderRadius: radii.control, borderWidth: 1, borderStyle: "dashed" },
  activeCard: { gap: spacing.md, padding: spacing.lg, borderRadius: radii.card, borderWidth: 2 },
  field: { gap: spacing.xs },
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  skipped: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg, borderRadius: radii.md },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  grow: { flex: 1 },
});
