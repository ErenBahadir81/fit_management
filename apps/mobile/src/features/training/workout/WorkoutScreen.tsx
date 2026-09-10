import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useRouter } from "expo-router";
import type { ExerciseDTO } from "@fitfloow/core";
import { fmtDuration } from "../../../lib/format";
import { haptic } from "../../../lib/haptics";
import { Floo } from "../../../mascot/Floo";
import { SpeechBubble } from "../../../mascot/SpeechBubble";
import { useMascot } from "../../../mascot/useMascot";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { EmptyState } from "../../../ui/EmptyState";
import { Header } from "../../../ui/Header";
import { Icon } from "../../../ui/Icon";
import { ProgressBar } from "../../../ui/ProgressBar";
import { Screen } from "../../../ui/Screen";
import { Sheet, SheetActions, useSheet } from "../../../ui/Sheet";
import { SuccessCheck } from "../../../ui/SuccessCheck";
import { Text } from "../../../ui/Text";
import { useToast } from "../../../ui/Toast";
import {
  doneSets,
  elapsedMinutes,
  hasAnything,
  nextPending,
  progress,
  restRemaining,
  toCompleteInput,
  totalSets,
  type CardioSlot,
} from "../lib/logger";
import { useCompleteWorkout, useMuscles, useProgram } from "../queries";
import { AddExerciseSheet } from "./AddExerciseSheet";
import { CardioPane } from "./CardioPane";
import { ExercisePane } from "./ExercisePane";
import { FinishSheet } from "./FinishSheet";
import { RestTimer, mmss } from "./RestTimer";
import { clearDraft, useWorkoutSession } from "./useWorkoutSession";

/** Full-screen set-by-set logger. Route: `/(modals)/workout`. */
export function WorkoutScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const program = useProgram();
  const muscles = useMuscles();
  const complete = useCompleteWorkout();

  const view = program.data ?? null;
  const session = useWorkoutSession(view);
  const { state, dispatch, now, restored } = session;

  const finishSheet = useSheet();
  const addSheet = useSheet();
  const leaveSheet = useSheet();
  const pager = useRef<ScrollView>(null);
  const [saved, setSaved] = useState(false);
  const noticed = useRef(false);

  useEffect(() => {
    if (restored && !noticed.current) {
      noticed.current = true;
      toast.show({ message: "Kaldığın yerden devam ediyoruz", kind: "info" });
    }
  }, [restored, toast]);

  const cardioSlots = useMemo<CardioSlot[]>(() => (state ? ([state.run ? "run" : null, state.swim ? "swim" : null].filter(Boolean) as CardioSlot[]) : []), [state]);
  const paneCount = (state?.exercises.length ?? 0) + cardioSlots.length;

  // Keep the pager in sync with the reducer's active pane (auto-advance after the last set).
  const activeIndex = state?.activeIndex ?? 0;
  useEffect(() => {
    pager.current?.scrollTo({ x: activeIndex * width, animated: true });
  }, [activeIndex, width]);

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
      if (state && index !== state.activeIndex && index < (state.exercises.length || 1)) dispatch({ type: "focus", index });
    },
    [dispatch, state, width]
  );

  const pending = state ? nextPending(state) : null;
  const rest = state ? restRemaining(state, now) : 0;
  const allDone = Boolean(state) && pending === null;

  const completeSet = useCallback(() => {
    if (!state) return;
    void haptic.medium(); // one firm tap per set; the success buzz is saved for the finish
    dispatch({ type: "complete-set", at: Date.now() });
  }, [dispatch, state]);

  const addExercise = useCallback(
    (exercise: ExerciseDTO) => {
      addSheet.dismiss();
      dispatch({
        type: "add-exercise",
        exercise: { name: exercise.name, muscles: exercise.muscles, metric: exercise.metric, defaultSets: exercise.defaultSets, defaultReps: exercise.defaultReps },
      });
    },
    [addSheet, dispatch]
  );

  const finish = useCallback(() => {
    if (!state) return;
    complete.mutate(toCompleteInput(state, Date.now()), {
      onSuccess: () => {
        clearDraft();
        finishSheet.dismiss();
        setSaved(true);
        setTimeout(() => router.back(), 1400);
      },
    });
  }, [complete, finishSheet, router, state]);

  const leave = useCallback(() => {
    if (state && hasAnything(state)) {
      leaveSheet.present();
      return;
    }
    clearDraft();
    router.back();
  }, [leaveSheet, router, state]);

  if (saved) return <SavedState />;

  if (program.isError && !view) {
    return (
      <Screen tabBar={false} edges={["top", "bottom"]}>
        <Header title="Antrenman" compact left={{ icon: "close", label: "Kapat", onPress: () => router.back() }} />
        <EmptyState
          illustration={<Floo mood="worried" size="m" />}
          title="Program yüklenemedi"
          body="Bağlantını kontrol edip tekrar dene."
          action={{ label: "Tekrar dene", onPress: () => void program.refetch(), icon: "refresh" }}
        />
      </Screen>
    );
  }

  if (!state || paneCount === 0) {
    const noProgram = Boolean(view && view.program.days.length === 0);
    return (
      <Screen tabBar={false} edges={["top", "bottom"]}>
        <Header title="Antrenman" compact left={{ icon: "close", label: "Kapat", onPress: () => router.back() }} />
        <EmptyState
          illustration={<Floo mood="sleepy" size="m" />}
          title={!view ? "Hazırlanıyor…" : noProgram ? "Program atanmamış" : "Bugün kaydedilecek bir şey yok"}
          body={!view ? "Programın yükleniyor." : noProgram ? "Antrenörün bir program tanımladığında buradan başlarsın." : "Bugün dinlenme günü. Yarın görüşürüz."}
          testID="workout-empty"
        />
      </Screen>
    );
  }

  const done = doneSets(state);
  const total = totalSets(state);
  const primaryLabel = allDone ? "Antrenmanı bitir" : "Seti tamamla";

  return (
    <Screen scroll={false} tabBar={false} edges={["top"]}>
      <View style={styles.header}>
        <Header
          title={state.title}
          compact
          left={{ icon: "close", label: "Kapat", onPress: leave, testID: "workout-close" }}
          right={{ icon: "flag-outline", label: "Bitir", onPress: finishSheet.present, testID: "workout-finish" }}
        />
        <View style={styles.progressRow}>
          <Text variant="label" color="inkMuted" tabular testID="workout-progress">
            {done}/{total} set
          </Text>
          <View style={styles.spacer} />
          <Icon name="time-outline" size={14} color="inkSubtle" />
          <Text variant="label" color="inkMuted" tabular testID="workout-elapsed">
            {fmtDuration(elapsedMinutes(state, now))}
          </Text>
        </View>
        <ProgressBar value={progress(state)} tone="primary" height={6} accessibilityLabel={`${done} / ${total} set tamam`} />
        {state.exercises.length > 1 ? (
          <View style={styles.dots}>
            {state.exercises.map((e, i) => (
              <View
                key={e.id}
                testID={`pane-dot-${i}`}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === state.activeIndex ? colors.primary : e.skipped ? colors.warning : e.sets.every((s) => s.done) ? colors.success : colors.border,
                    width: i === state.activeIndex ? 18 : 6,
                  },
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        keyboardShouldPersistTaps="handled"
        testID="workout-pager"
        style={styles.pager}
      >
        {state.exercises.map((exercise, index) => (
          <ExercisePane
            key={exercise.id}
            exercise={exercise}
            index={index}
            width={width}
            muscles={muscles.data ?? []}
            onSetReps={(setIndex, value) => dispatch({ type: "set-reps", exercise: index, set: setIndex, value })}
            onSetRir={(setIndex, value) => dispatch({ type: "set-rir", exercise: index, set: setIndex, value })}
            onUndoSet={(setIndex) => dispatch({ type: "undo-set", exercise: index, set: setIndex })}
            onAddSet={() => dispatch({ type: "add-set", exercise: index })}
            onRemoveSet={() => dispatch({ type: "remove-set", exercise: index })}
            onToggleSkip={() => dispatch({ type: "toggle-skip", exercise: index })}
          />
        ))}
        {cardioSlots.map((slot) => {
          const cardio = state[slot];
          if (!cardio) return null;
          return (
            <CardioPane
              key={slot}
              slot={slot}
              cardio={cardio}
              width={width}
              onSegment={(id, patch) => dispatch({ type: "segment-set", slot, id, ...patch })}
              onAdd={() => dispatch({ type: "segment-add", slot })}
              onRemove={(id) => dispatch({ type: "segment-remove", slot, id })}
            />
          );
        })}
      </ScrollView>

      <View style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {rest > 0 ? <RestTimer remaining={rest} total={state.restSeconds} onSkip={() => dispatch({ type: "rest-skip" })} /> : null}
        <View style={styles.barRow}>
          <Chip label="Hareket ekle" icon="add" onPress={addSheet.present} testID="workout-add-exercise" />
          <View style={styles.spacer} />
          {rest > 0 ? (
            <Text variant="caption" color="inkMuted" tabular>
              {mmss(rest)}
            </Text>
          ) : null}
        </View>
        <Button
          label={primaryLabel}
          variant="primary"
          icon={allDone ? "checkmark" : "checkmark-circle"}
          full
          onPress={allDone ? finishSheet.present : completeSet}
          testID="complete-set"
        />
      </View>

      <FinishSheet
        sheetRef={finishSheet.ref}
        state={state}
        now={now}
        muscles={muscles.data ?? []}
        saving={complete.isPending}
        onRpe={(value) => dispatch({ type: "set-rpe", value })}
        onNotes={(value) => dispatch({ type: "set-notes", value })}
        onFinish={finish}
        onCancel={finishSheet.dismiss}
      />
      <AddExerciseSheet sheetRef={addSheet.ref} onPick={addExercise} />
      <Sheet ref={leaveSheet.ref} title="Antrenmandan çık">
        <Text variant="body" color="inkMuted" testID="leave-sheet">
          Kaydettiğin setler cihazında saklanır; geri döndüğünde kaldığın yerden devam edersin.
        </Text>
        <SheetActions>
          <Button
            label="Kaydı sil"
            variant="danger"
            onPress={() => {
              clearDraft();
              leaveSheet.dismiss();
              router.back();
            }}
            style={styles.grow}
            testID="leave-discard"
          />
          <Button
            label="Sakla ve çık"
            variant="secondary"
            onPress={() => {
              leaveSheet.dismiss();
              router.back();
            }}
            style={styles.grow}
            testID="leave-keep"
          />
        </SheetActions>
      </Sheet>
    </Screen>
  );
}

function SavedState() {
  const mascot = useMascot("workout");
  return (
    <Screen tabBar={false} edges={["top", "bottom"]} contentStyle={styles.saved}>
      <Animated.View entering={FadeIn.duration(200)} style={styles.savedInner} testID="workout-saved">
        <SuccessCheck size={96} />
        <Text variant="heading" align="center">
          Antrenman kaydedildi
        </Text>
        <Floo mood="cheer" size="m" />
        <SpeechBubble text={mascot.text} tail="none" />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.gutter, gap: spacing.sm, paddingBottom: spacing.md },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  spacer: { flex: 1 },
  dots: { flexDirection: "row", gap: spacing.xs, justifyContent: "center", marginTop: spacing.xs },
  dot: { height: 6, borderRadius: 3 },
  pager: { flex: 1 },
  bar: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
  saved: { flex: 1, justifyContent: "center" },
  savedInner: { alignItems: "center", gap: spacing.lg },
});
