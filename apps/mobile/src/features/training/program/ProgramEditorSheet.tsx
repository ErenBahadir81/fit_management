import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, type SharedValue } from "react-native-reanimated";
import type { DayDTO, ExerciseDTO, ExerciseTargetDTO, ProgramDTO } from "@fitfloow/core";
import { fmtNumber } from "../../../lib/format";
import { haptic } from "../../../lib/haptics";
import { useTheme } from "../../../theme/ThemeProvider";
import { springs } from "../../../theme/motion";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { Divider } from "../../../ui/Divider";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Sheet, type SheetRef } from "../../../ui/Sheet";
import { Stepper } from "../../../ui/Stepper";
import { Text } from "../../../ui/Text";
import { TextField } from "../../../ui/TextField";
import { dayCounts } from "../lib/present";
import { useExerciseCatalog, useUpdateProgram } from "../queries";

const ROW_H = 64;
const KINDS: { value: DayDTO["kind"]; label: string }[] = [
  { value: "strength", label: "Güç" },
  { value: "run", label: "Koşu" },
  { value: "swim", label: "Yüzme" },
  { value: "stretch", label: "Esneme" },
  { value: "rest", label: "Dinlenme" },
];

type Mode = { kind: "days" } | { kind: "day"; index: number } | { kind: "picker"; index: number };

export interface ProgramEditorSheetProps {
  sheetRef: React.RefObject<SheetRef | null>;
  program: ProgramDTO;
  onClose: () => void;
}

/**
 * The program editor: one sheet, three modes (day list → one day → exercise picker). Everything is
 * edited on a local draft and committed with a single optimistic `PUT /program`.
 */
export function ProgramEditorSheet({ sheetRef, program, onClose }: ProgramEditorSheetProps) {
  // `null` = untouched → the editor mirrors the server; a local draft never gets clobbered by refetches.
  const [draft, setDraft] = useState<DayDTO[] | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "days" });
  const save = useUpdateProgram();
  const days = draft ?? program.days;
  const dirty = draft !== null;

  const move = useCallback(
    (from: number, to: number) => {
      setDraft((prev) => {
        const base = prev ?? program.days;
        const clamped = Math.max(0, Math.min(base.length - 1, to));
        if (clamped === from) return prev;
        const next = [...base];
        const [row] = next.splice(from, 1);
        next.splice(clamped, 0, row);
        return next.map((d, i) => ({ ...d, order: i + 1 }));
      });
      void haptic.select();
    },
    [program.days]
  );

  const updateDay = useCallback((index: number, day: DayDTO) => setDraft((prev) => (prev ?? program.days).map((d, i) => (i === index ? day : d))), [program.days]);

  const commit = useCallback(() => {
    save.mutate(
      { name: program.name, days: days.map((d, i) => ({ ...d, order: i + 1 })) },
      {
        onSuccess: () => {
          setDraft(null);
          setMode({ kind: "days" });
          onClose();
        },
      }
    );
  }, [days, onClose, program.name, save]);

  const close = useCallback(() => {
    setMode({ kind: "days" });
    setDraft(null);
    onClose();
  }, [onClose]);

  const title = mode.kind === "days" ? "Programı düzenle" : mode.kind === "day" ? days[mode.index]?.title ?? "Gün" : "Hareket ekle";

  return (
    <Sheet ref={sheetRef} title={title} snapPoints={["88%"]} enableDynamicSizing={false} contentStyle={styles.sheet}>
      <BottomSheetScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} testID="editor-sheet">
        {mode.kind === "days" ? (
          <DayList days={days} onMove={move} onOpen={(index) => setMode({ kind: "day", index })} />
        ) : mode.kind === "day" ? (
          <DayEditor
            day={days[mode.index]}
            onChange={(day) => updateDay(mode.index, day)}
            onAdd={() => setMode({ kind: "picker", index: mode.index })}
            onBack={() => setMode({ kind: "days" })}
          />
        ) : (
          <ExercisePicker
            onPick={(exercise) => {
              const day = days[mode.index];
              if (day) updateDay(mode.index, { ...day, exercises: [...day.exercises, targetFrom(exercise)] });
              setMode({ kind: "day", index: mode.index });
            }}
            onBack={() => setMode({ kind: "day", index: mode.index })}
          />
        )}
      </BottomSheetScrollView>
      <View style={styles.footer}>
        <Button label="Vazgeç" variant="ghost" onPress={close} style={styles.grow} testID="editor-cancel" />
        <Button label="Kaydet" variant="primary" icon="checkmark" loading={save.isPending} disabled={!dirty} onPress={commit} style={styles.grow} testID="editor-save" />
      </View>
    </Sheet>
  );
}

export function targetFrom(exercise: ExerciseDTO): ExerciseTargetDTO {
  return {
    name: exercise.name,
    muscles: exercise.muscles,
    targetSets: exercise.defaultSets,
    targetReps: exercise.defaultReps,
    targetRIR: exercise.metric === "time" ? null : 2,
    metric: exercise.metric,
  };
}

/* -------------------------------- day list -------------------------------- */

function DayList({ days, onMove, onOpen }: { days: DayDTO[]; onMove: (from: number, to: number) => void; onOpen: (index: number) => void }) {
  const dragIndex = useSharedValue(-1);
  const offsetY = useSharedValue(0);
  return (
    <View style={styles.list} testID="editor-days">
      <Text variant="caption" color="inkMuted">
        Günleri sürükleyerek sırala, düzenlemek için dokun.
      </Text>
      {days.map((day, index) => (
        <DayRow key={`${day.title}-${index}`} day={day} index={index} count={days.length} dragIndex={dragIndex} offsetY={offsetY} onMove={onMove} onOpen={onOpen} />
      ))}
    </View>
  );
}

function DayRow({
  day,
  index,
  count,
  dragIndex,
  offsetY,
  onMove,
  onOpen,
}: {
  day: DayDTO;
  index: number;
  count: number;
  dragIndex: SharedValue<number>;
  offsetY: SharedValue<number>;
  onMove: (from: number, to: number) => void;
  onOpen: (index: number) => void;
}) {
  const { colors } = useTheme();
  const counts = dayCounts(day);

  // Rows the dragged one passes over slide out of the way, on the UI thread.
  const shift = useDerivedValue(() => {
    const drag = dragIndex.get();
    if (drag === -1 || drag === index) return 0;
    const target = drag + Math.round(offsetY.get() / ROW_H);
    if (drag < index && target >= index) return -ROW_H;
    if (drag > index && target <= index) return ROW_H;
    return 0;
  });

  const style = useAnimatedStyle(() => {
    const dragging = dragIndex.get() === index;
    return {
      transform: [{ translateY: dragging ? offsetY.get() : withSpring(shift.get(), springs.snappy) }, { scale: withSpring(dragging ? 1.02 : 1, springs.snappy) }],
      zIndex: dragging ? 10 : 0,
      opacity: dragging ? 0.96 : 1,
    };
  });

  const pan = Gesture.Pan()
    .activateAfterLongPress(120)
    .onStart(() => {
      dragIndex.set(index);
      offsetY.set(0);
    })
    .onUpdate((e) => {
      offsetY.set(e.translationY);
    })
    .onEnd(() => {
      const to = index + Math.round(offsetY.get() / ROW_H);
      dragIndex.set(-1);
      offsetY.set(0);
      if (to !== index) runOnJS(onMove)(index, to);
    })
    .onFinalize(() => {
      dragIndex.set(-1);
      offsetY.set(0);
    });

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={() => onOpen(index)}
        testID={`editor-day-${index}`}
        accessibilityLabel={`${index + 1}. gün, ${day.title}`}
        accessibilityHint="Düzenlemek için dokun, sırayı değiştirmek için yukarı/aşağı taşı"
        accessibilityActions={[
          { name: "moveUp", label: "Yukarı taşı" },
          { name: "moveDown", label: "Aşağı taşı" },
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "moveUp" && index > 0) onMove(index, index - 1);
          if (e.nativeEvent.actionName === "moveDown" && index < count - 1) onMove(index, index + 1);
        }}
        style={[styles.dayRow, { backgroundColor: colors.surfaceMuted }]}
      >
        <GestureDetector gesture={pan}>
          <Animated.View style={styles.handle} testID={`editor-handle-${index}`} accessibilityLabel="Sıralama tutamacı">
            <Icon name="reorder-three-outline" size={22} color="inkSubtle" />
          </Animated.View>
        </GestureDetector>
        <View style={styles.texts}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {index + 1}. {day.title}
          </Text>
          <Text variant="caption" color="inkMuted" tabular numberOfLines={1}>
            {day.kind === "rest" ? "Dinlenme" : counts.km > 0 ? `${fmtNumber(counts.km, 1)} km` : `${counts.exercises} hareket · ${counts.sets} set`}
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color="inkSubtle" />
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------- day editor ------------------------------- */

function DayEditor({ day, onChange, onAdd, onBack }: { day: DayDTO | undefined; onChange: (day: DayDTO) => void; onAdd: () => void; onBack: () => void }) {
  if (!day) return null;
  const setExercise = (i: number, patch: Partial<ExerciseTargetDTO>) => onChange({ ...day, exercises: day.exercises.map((e, x) => (x === i ? { ...e, ...patch } : e)) });

  return (
    <View style={styles.list} testID="editor-day">
      <Chip label="Günler" icon="chevron-back" onPress={onBack} testID="editor-back" />
      <TextField label="Gün adı" value={day.title} onChangeText={(title) => onChange({ ...day, title })} testID="editor-title" />
      <TextField label="Odak" value={day.focus} onChangeText={(focus) => onChange({ ...day, focus })} placeholder="Göğüs · Sırt" testID="editor-focus" />
      <View style={styles.chips}>
        {KINDS.map((k) => (
          <Chip key={k.value} label={k.label} selected={day.kind === k.value} onPress={() => onChange({ ...day, kind: k.value })} testID={`editor-kind-${k.value}`} />
        ))}
      </View>

      {day.kind === "run" || day.kind === "swim" ? (
        <View style={styles.cardio}>
          <CardioTargets
            label={day.kind === "run" ? "Koşu hedefi" : "Yüzme hedefi"}
            km={(day.kind === "run" ? day.run?.targetKm : day.swim?.targetKm) ?? 0}
            min={(day.kind === "run" ? day.run?.targetMin : day.swim?.targetMin) ?? 0}
            onChange={(km, min) =>
              onChange(day.kind === "run" ? { ...day, run: { targetKm: km, targetMin: min, label: day.run?.label ?? "" } } : { ...day, swim: { targetKm: km, targetMin: min, label: day.swim?.label ?? "" } })
            }
          />
        </View>
      ) : null}

      {day.exercises.map((e, i) => (
        <View key={`${e.name}-${i}`} style={styles.exercise} testID={`editor-exercise-${i}`}>
          <View style={styles.exerciseHead}>
            <Text variant="bodyStrong" numberOfLines={1} style={styles.grow}>
              {e.name}
            </Text>
            <Pressable
              onPress={() => onChange({ ...day, exercises: day.exercises.filter((_, x) => x !== i) })}
              testID={`editor-remove-${i}`}
              accessibilityLabel={`${e.name} hareketini kaldır`}
              minTarget={false}
              style={styles.remove}
            >
              <Icon name="close" size={18} color="danger" />
            </Pressable>
          </View>
          <View style={styles.stepperRow}>
            <StepperField label="Set" value={e.targetSets} min={1} max={20} onChange={(v) => setExercise(i, { targetSets: v })} testID={`editor-sets-${i}`} />
            <StepperField
              label={e.metric === "time" ? "Saniye" : "Tekrar"}
              value={e.targetReps}
              min={1}
              max={600}
              step={e.metric === "time" ? 5 : 1}
              onChange={(v) => setExercise(i, { targetReps: v })}
              testID={`editor-reps-${i}`}
            />
            <StepperField label="RIR" value={e.targetRIR ?? 0} min={0} max={10} onChange={(v) => setExercise(i, { targetRIR: v })} testID={`editor-rir-${i}`} />
          </View>
          <Divider />
        </View>
      ))}

      <Button label="Hareket ekle" variant="secondary" icon="add" onPress={onAdd} testID="editor-add-exercise" />
    </View>
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

function CardioTargets({ label, km, min, onChange }: { label: string; km: number; min: number; onChange: (km: number, min: number) => void }) {
  return (
    <View style={styles.list}>
      <Text variant="label">{label}</Text>
      <View style={styles.stepperRow}>
        <StepperField label="km" value={km} min={0} max={200} step={0.5} onChange={(v) => onChange(v, min)} testID="editor-target-km" />
        <StepperField label="dakika" value={min} min={0} max={600} step={1} onChange={(v) => onChange(km, v)} testID="editor-target-min" />
      </View>
    </View>
  );
}

/* ----------------------------- exercise picker ---------------------------- */

function ExercisePicker({ onPick, onBack }: { onPick: (exercise: ExerciseDTO) => void; onBack: () => void }) {
  const [q, setQ] = useState("");
  const { colors } = useTheme();
  const catalog = useExerciseCatalog(q);
  const results = useMemo(() => catalog.data ?? [], [catalog.data]);

  return (
    <View style={styles.list} testID="editor-picker">
      <Chip label="Geri" icon="chevron-back" onPress={onBack} testID="picker-back" />
      <TextField label="Hareket ara" value={q} onChangeText={setQ} icon="search" autoCorrect={false} testID="picker-search" />
      {results.length === 0 && !catalog.isPending ? (
        <Text variant="body" color="inkMuted">
          Sonuç yok. Başka bir isim dene.
        </Text>
      ) : null}
      {results.map((exercise) => (
        <Pressable
          key={exercise.id}
          onPress={() => onPick(exercise)}
          haptic="select"
          testID={`picker-item-${exercise.id}`}
          accessibilityLabel={exercise.name}
          style={[styles.pickerRow, { backgroundColor: colors.surfaceMuted }]}
        >
          <View style={styles.texts}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {exercise.name}
            </Text>
            <Text variant="caption" color="inkMuted" tabular numberOfLines={1}>
              {exercise.defaultSets}×{exercise.defaultReps}
              {exercise.metric === "time" ? " sn" : ""}
            </Text>
          </View>
          <Icon name="add-circle-outline" size={20} color="primary" />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  scroll: { paddingBottom: spacing.lg, gap: spacing.lg },
  list: { gap: spacing.md },
  dayRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, height: ROW_H - spacing.sm, paddingRight: spacing.lg, borderRadius: radii.md },
  handle: { width: 44, height: ROW_H - spacing.sm, alignItems: "center", justifyContent: "center" },
  texts: { flex: 1, gap: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  cardio: { gap: spacing.sm },
  exercise: { gap: spacing.sm },
  exerciseHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  remove: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  stepperRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  stepperField: { gap: spacing.xs },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.lg, borderRadius: radii.md },
  footer: { flexDirection: "row", gap: spacing.md, paddingTop: spacing.sm },
  grow: { flex: 1 },
});
