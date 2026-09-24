import React from "react";
import { StyleSheet, View } from "react-native";
import type { DayKind, ExerciseTargetDTO } from "@fitfloow/core";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Stepper } from "../../../ui/Stepper";
import { Text } from "../../../ui/Text";
import { TextField } from "../../../ui/TextField";
import { KIND_TR, type DraftDay, type EditorAction } from "../lib/editorDraft";

const KINDS: DayKind[] = ["strength", "run", "swim", "stretch", "rest"];

export interface DayEditorProps {
  day: DraftDay;
  index: number;
  /** "Pazartesi" / "3. gün". */
  label: string;
  dispatch: (a: EditorAction) => void;
  onAdd: () => void;
  onBack: () => void;
  /** The live volume bars for the muscles this day works — rendered under the exercises. */
  volume: React.ReactNode;
}

/** One day: name, focus, kind, cardio target or exercises (targets, order, add/remove). */
export function DayEditor({ day, index, label, dispatch, onAdd, onBack, volume }: DayEditorProps) {
  const lifts = day.kind === "strength" || day.kind === "stretch";
  const cardio = day.kind === "run" || day.kind === "swim" ? day[day.kind] : null;
  return (
    <View style={styles.stack} testID="editor-day">
      <Chip label="Günler" icon="back" onPress={onBack} testID="editor-back" />
      <Text variant="label" color="inkMuted">
        {label}
      </Text>
      <TextField
        label="Gün adı"
        value={day.title}
        onChangeText={(title) => dispatch({ type: "rename-day", index, title })}
        error={day.title.trim() ? undefined : "Güne bir ad ver"}
        maxLength={40}
        testID="editor-title"
      />
      <TextField label="Odak" value={day.focus} onChangeText={(focus) => dispatch({ type: "set-focus", index, focus })} placeholder="Göğüs · Sırt" maxLength={60} testID="editor-focus" />
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Gün türü">
        {KINDS.map((k) => (
          <Chip key={k} label={KIND_TR[k]} selected={day.kind === k} onPress={() => dispatch({ type: "set-kind", index, kind: k })} testID={`editor-kind-${k}`} />
        ))}
      </View>

      {cardio ? (
        <Card variant="muted" style={styles.gapSm}>
          <Text variant="label">{day.kind === "run" ? "Koşu hedefi" : "Yüzme hedefi"}</Text>
          <View style={styles.stepperRow}>
            <StepperField label="km" value={cardio.targetKm} min={0} max={200} step={0.5} onChange={(v) => dispatch({ type: "set-cardio", index, km: v, min: cardio.targetMin })} testID="editor-target-km" />
            <StepperField label="dakika" value={cardio.targetMin} min={0} max={600} step={1} onChange={(v) => dispatch({ type: "set-cardio", index, km: cardio.targetKm, min: v })} testID="editor-target-min" />
          </View>
        </Card>
      ) : null}

      {day.kind === "rest" ? (
        <Text variant="body" color="inkMuted">
          Dinlenme günü: kayıt için «Dinlendim» demen yeterli, döngü ilerler.
        </Text>
      ) : null}

      {lifts ? (
        <>
          <Text variant="title">Hareketler</Text>
          {day.exercises.length === 0 ? (
            <Text variant="body" color="inkMuted">
              Henüz hareket yok. Katalogdan ekle ya da kendi hareketini yaz.
            </Text>
          ) : null}
          {day.exercises.map((e, i) => (
            <ExerciseRow key={`${e.name}-${i}`} exercise={e} i={i} count={day.exercises.length} dayIndex={index} dispatch={dispatch} />
          ))}
          <Button label="Hareket ekle" variant="secondary" icon="add" onPress={onAdd} testID="editor-add-exercise" />
          {volume}
        </>
      ) : null}
    </View>
  );
}

function ExerciseRow({ exercise: e, i, count, dayIndex, dispatch }: { exercise: ExerciseTargetDTO; i: number; count: number; dayIndex: number; dispatch: (a: EditorAction) => void }) {
  const { colors } = useTheme();
  const set = (patch: Partial<ExerciseTargetDTO>) => dispatch({ type: "set-exercise", index: dayIndex, exercise: i, patch });
  const moveTo = (to: number) => dispatch({ type: "move-exercise", index: dayIndex, from: i, to });
  return (
    <View style={[styles.exercise, { borderColor: colors.border, backgroundColor: colors.surface }]} testID={`editor-exercise-${i}`}>
      <View style={styles.exerciseHead}>
        <Text variant="bodyStrong" numberOfLines={2} style={styles.grow}>
          {e.name}
        </Text>
        <IconAction icon="chevron-up" label={`${e.name} yukarı taşı`} disabled={i === 0} onPress={() => moveTo(i - 1)} testID={`editor-ex-up-${i}`} />
        <IconAction icon="chevron-down" label={`${e.name} aşağı taşı`} disabled={i === count - 1} onPress={() => moveTo(i + 1)} testID={`editor-ex-down-${i}`} />
        <IconAction icon="close" label={`${e.name} hareketini kaldır`} danger onPress={() => dispatch({ type: "remove-exercise", index: dayIndex, exercise: i })} testID={`editor-remove-${i}`} />
      </View>
      <View style={styles.stepperRow}>
        <StepperField label="Set" value={e.targetSets} min={1} max={20} onChange={(v) => set({ targetSets: v })} testID={`editor-sets-${i}`} />
        <StepperField
          label={e.metric === "time" ? "Saniye" : "Tekrar"}
          value={e.targetReps}
          min={1}
          max={600}
          step={e.metric === "time" ? 5 : 1}
          onChange={(v) => set({ targetReps: v })}
          testID={`editor-reps-${i}`}
        />
        {e.metric === "reps" ? <StepperField label="RIR" value={e.targetRIR ?? 0} min={0} max={10} onChange={(v) => set({ targetRIR: v })} testID={`editor-rir-${i}`} /> : null}
      </View>
    </View>
  );
}

function IconAction({ icon, label, onPress, disabled, danger, testID }: { icon: "chevron-up" | "chevron-down" | "close"; label: string; onPress: () => void; disabled?: boolean; danger?: boolean; testID: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} haptic="select" accessibilityLabel={label} testID={testID} style={[styles.iconAction, disabled && styles.dim]}>
      <Icon name={icon === "close" ? "close-outline" : icon === "chevron-up" ? "chevron-up-outline" : "chevron-down-outline"} size={20} color={danger ? "danger" : "inkMuted"} />
    </Pressable>
  );
}

function StepperField({ label, value, onChange, min, max, step, testID }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; testID: string }) {
  return (
    <View style={styles.stepperField}>
      <Text variant="caption" color="inkMuted">
        {label}
      </Text>
      <Stepper value={value} onChange={onChange} min={min} max={max} step={step} size="sm" testID={testID} label={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  back: { alignSelf: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  gapSm: { gap: spacing.sm },
  exercise: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth },
  exerciseHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  iconAction: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radii.sm },
  dim: { opacity: 0.35 },
  stepperRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  stepperField: { gap: spacing.xs },
  grow: { flex: 1 },
});
