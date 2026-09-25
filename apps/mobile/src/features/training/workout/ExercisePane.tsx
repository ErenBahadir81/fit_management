import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from "react-native-reanimated";
import type { LastPerformance, MuscleDTO } from "@fitfloow/core";
import { relativeDayLabel } from "../../../lib/dates";
import { fmtNumber } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { SlamIn } from "../../../ui/Juice";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { lastPerformanceLabel } from "../lib/present";
import { WEIGHT_STEP_KG, activeSetIndex, exerciseTonnage, type LoggerExercise, type LoggerSet } from "../lib/logger";
import { NumberField } from "./NumberField";

/** RIR is a coach's nicety, not the point of the set: 0-4 covers everything people actually log. */
const RIR_CHOICES = [0, 1, 2, 3, 4];

export interface ExercisePaneProps {
  exercise: LoggerExercise;
  index: number;
  width: number;
  muscles: readonly MuscleDTO[];
  /** C1 — the same exercise, last time it was logged. `null` while it loads. */
  last: LastPerformance | null;
  onSetReps: (setIndex: number, value: number) => void;
  onSetRir: (setIndex: number, value: number | null) => void;
  onSetWeight: (setIndex: number, value: number | null) => void;
  onUndoSet: (setIndex: number) => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
  onToggleSkip: () => void;
}

/** "60 kg × 8" — how one set reads everywhere on this screen. */
export function setLabel(set: LoggerSet, unit: string): string {
  const reps = `${fmtNumber(set.reps, 0)} ${unit}`;
  return set.weightKg === null ? reps : `${fmtNumber(set.weightKg, set.weightKg % 1 === 0 ? 0 : 1)} kg × ${fmtNumber(set.reps, 0)}`;
}

/** One exercise, one pane: what you did, what you're about to do, and what you did last time. */
export function ExercisePane({ exercise, index, width, muscles, last, onSetReps, onSetRir, onSetWeight, onUndoSet, onAddSet, onRemoveSet, onToggleSkip }: ExercisePaneProps) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const active = activeSetIndex(exercise);
  const rowLayout = reduce ? undefined : LinearTransition.springify().damping(22).stiffness(240);
  const isTime = exercise.metric === "time";
  const unit = isTime ? "sn" : "tekrar";
  const nameOf = (key: string) => muscles.find((m) => m.key === key)?.name ?? key;
  const colorOf = (key: string) => muscles.find((m) => m.key === key)?.color;
  const done = exercise.sets.filter((s) => s.done).length;
  const tonnage = exerciseTonnage(exercise);
  const reference = lastPerformanceLabel(last);

  return (
    <View style={[styles.pane, { width }]} testID={`pane-${index}`}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
            {tonnage > 0 ? ` · ${fmtNumber(tonnage, 0)} kg` : ""}
          </Text>
        </View>

        {exercise.skipped ? (
          <View style={[styles.skipped, { backgroundColor: colors.warningSoft }]} testID={`pane-skipped-${index}`}>
            <Icon icon="skip" size={18} color="warning" />
            <Text variant="bodyStrong" tone="warning" style={styles.grow}>
              Bu hareket atlandı
            </Text>
            <Chip label="Geri al" size="sm" tone="warning" onPress={onToggleSkip} testID={`pane-unskip-${index}`} />
          </View>
        ) : (
          <>
            {reference ? (
              <View style={[styles.reference, { borderColor: colors.border }]} testID={`last-performance-${index}`}>
                <Icon icon="duration" size={14} color="inkSubtle" />
                <Text variant="caption" color="inkMuted" tabular numberOfLines={1} style={styles.grow}>
                  Geçen sefer {reference}
                </Text>
                {last?.dateKey ? (
                  <Text variant="caption" color="inkSubtle">
                    {relativeDayLabel(last.dateKey)}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.setList}>
              {exercise.sets.map((set, i) =>
                set.done ? (
                  <Animated.View key={i} layout={rowLayout} entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)}>
                    {/* A finished set lands: the row slams in and the check spins onto it. */}
                    <SlamIn spin={false} peak={1.06}>
                      <Pressable
                        onPress={() => onUndoSet(i)}
                        haptic="select"
                        testID={`set-done-${index}-${i}`}
                        accessibilityLabel={`${i + 1}. set tamam, ${setLabel(set, unit)}${set.rir !== null ? `, RIR ${set.rir}` : ""}. Geri almak için dokun`}
                        style={[styles.doneRow, { backgroundColor: colors.successSoft }]}
                      >
                        <View style={[styles.badge, { backgroundColor: colors.success }]}>
                          <SlamIn>
                            <Icon icon="check" size={14} color="onPrimary" />
                          </SlamIn>
                        </View>
                        <Text variant="bodyStrong" tabular style={styles.grow}>
                          {setLabel(set, unit)}
                        </Text>
                        {set.rir !== null ? (
                          <Text variant="caption" color="inkMuted" tabular>
                            RIR {set.rir}
                          </Text>
                        ) : null}
                        {/* The whole row undoes; the arrow is there so people know it can be undone. */}
                        <Icon icon="undo" size={16} color="inkSubtle" />
                      </Pressable>
                    </SlamIn>
                  </Animated.View>
                ) : i === active ? (
                  <Animated.View
                    key={i}
                    layout={rowLayout}
                    entering={FadeIn.duration(160)}
                    style={[styles.activeCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}
                    testID={`set-active-${index}`}
                  >
                    <Text variant="label" tone="primary">
                      {i + 1}. SET
                    </Text>

                    {/* A hold is one number; a lift is two. Load leads, because "60 kg × 8" is how
                        the set is spoken and how it is read back everywhere else on this screen. */}
                    {isTime ? (
                      <View style={styles.stack}>
                        <NumberField
                          value={set.reps}
                          onChange={(v) => onSetReps(i, v ?? 0)}
                          unit="sn"
                          label="Süre"
                          min={0}
                          max={3600}
                          step={5}
                          decimals={0}
                          emphasis
                          testID={`reps-${index}`}
                        />
                        <NumberField
                          value={set.weightKg}
                          onChange={(v) => onSetWeight(i, v)}
                          unit="kg"
                          label="Ek ağırlık (isteğe bağlı)"
                          min={0}
                          max={1000}
                          decimals={1}
                          size="sm"
                          testID={`weight-${index}`}
                        />
                      </View>
                    ) : (
                      <View style={styles.fields}>
                        <NumberField
                          value={set.weightKg}
                          onChange={(v) => onSetWeight(i, v)}
                          unit="kg"
                          label="Ağırlık"
                          min={0}
                          max={1000}
                          step={WEIGHT_STEP_KG}
                          decimals={1}
                          emphasis
                          style={styles.field}
                          testID={`weight-${index}`}
                        />
                        <NumberField
                          value={set.reps}
                          onChange={(v) => onSetReps(i, v ?? 0)}
                          unit="tekrar"
                          label="Tekrar"
                          min={0}
                          max={300}
                          step={1}
                          decimals={0}
                          style={styles.field}
                          testID={`reps-${index}`}
                        />
                      </View>
                    )}

                    <View style={styles.rirRow}>
                      <Text variant="caption" color="inkSubtle" style={styles.rirLabel}>
                        RIR
                      </Text>
                      {RIR_CHOICES.map((v) => (
                        <RirChoice
                          key={v}
                          value={v}
                          selected={set.rir === v}
                          onPress={() => onSetRir(i, set.rir === v ? null : v)}
                          testID={`rir-${index}-${v}`}
                        />
                      ))}
                    </View>
                  </Animated.View>
                ) : (
                  <Animated.View key={i} layout={rowLayout} style={[styles.pendingRow, { borderColor: colors.border }]} testID={`set-pending-${index}-${i}`}>
                    <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }]}>
                      <Text variant="caption" color="inkMuted" tabular>
                        {i + 1}
                      </Text>
                    </View>
                    <Text variant="body" color="inkSubtle" tabular style={styles.grow}>
                      {setLabel(set, unit)}
                    </Text>
                  </Animated.View>
                )
              )}
            </View>

            <View style={styles.actions}>
              <Button label="Set ekle" variant="ghost" size="sm" icon="add" onPress={onAddSet} testID={`add-set-${index}`} />
              <Button label="Set sil" variant="ghost" size="sm" icon="minus" onPress={onRemoveSet} testID={`remove-set-${index}`} />
              <Button label="Hareketi atla" variant="ghost" size="sm" icon="skip" onPress={onToggleSkip} testID={`skip-exercise-${index}`} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Tertiary, but still a real target: `Chip` is 30 pt tall, and a thumb needs 44. */
function RirChoice({ value, selected, onPress, testID }: { value: number; selected: boolean; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      haptic="select"
      testID={testID}
      accessibilityRole="radio"
      // A radio is announced by `checked`, not `selected` — with the wrong one a screen reader
      // reads five unlabelled options and never says which is chosen.
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`RIR ${value}`}
      style={[styles.rirChoice, { backgroundColor: selected ? colors.primary : colors.surfaceMuted }]}
    >
      <Text variant="label" tabular color={selected ? "onPrimary" : "inkMuted"}>
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  scroll: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.xxl, gap: spacing.lg },
  head: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  reference: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
  },
  setList: { gap: spacing.sm },
  doneRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.lg, borderRadius: radii.control },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.control,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  activeCard: { gap: spacing.md, padding: spacing.lg, borderRadius: radii.card, borderWidth: 2 },
  fields: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  field: { flex: 1 },
  stack: { gap: spacing.md },
  rirRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  rirLabel: { width: 28 },
  rirChoice: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radii.sm },
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  skipped: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg, borderRadius: radii.md },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  grow: { flex: 1 },
});
