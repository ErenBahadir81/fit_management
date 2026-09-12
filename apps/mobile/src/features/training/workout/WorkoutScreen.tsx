import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
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

/** How long the "Antrenman kaydedildi" moment stays before the modal closes itself. */
const SAVED_MS = 1400;

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
  const { ref: leaveRef, present: presentLeave, dismiss: dismissLeave } = useSheet();
  const pager = useRef<ScrollView>(null);
  const [saved, setSaved] = useState(false);
  const noticed = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (leaveTimer.current && clearTimeout(leaveTimer.current)), []);

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

  // Which pane is actually on screen. The reducer only tracks exercises, but the cardio panes sit
  // after them in the same pager, so the dots need their own notion of "where am I". Reset during
  // render (not in an effect) whenever the reducer moves the active exercise.
  const [pane, setPane] = useState({ index: activeIndex, syncedTo: activeIndex });
  if (pane.syncedTo !== activeIndex) setPane({ index: activeIndex, syncedTo: activeIndex });
  const visiblePane = pane.index;

  const settleOn = useCallback(
    (index: number) => {
      setPane((p) => (p.index === index ? p : { ...p, index }));
      if (state && index !== state.activeIndex && index < (state.exercises.length || 1)) dispatch({ type: "focus", index });
    },
    [dispatch, state]
  );

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => settleOn(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width))),
    [settleOn, width]
  );

  /**
   * react-native-web's ScrollView never fires `onMomentumScrollEnd` — `ScrollViewBase` only wires
   * `onScroll` — so on web the pager never told the screen which exercise the user had swiped to:
   * "Seti tamamla" kept logging against the pane they had left, and then snapped back to it.
   *
   * So settle on `onScroll` instead, but only once the ticks stop (the same trick RNW uses for its
   * own scroll-end) and only on a page boundary. Acting on every tick would be wrong twice over: a
   * mid-swipe tick would steal focus, and the *first* tick of the auto-advance animation still
   * reports the old pane, which would bounce the pager straight back.
   */
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (settleTimer.current && clearTimeout(settleTimer.current)), []);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        const index = Math.round(x / Math.max(1, width));
        if (Math.abs(x - index * width) <= 2) settleOn(index);
      }, 140);
    },
    [settleOn, width]
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
        leaveTimer.current = setTimeout(() => router.back(), SAVED_MS);
      },
    });
  }, [complete, finishSheet, router, state]);

  const leave = useCallback(() => {
    if (state && hasAnything(state)) {
      presentLeave();
      return;
    }
    clearDraft();
    router.back();
  }, [presentLeave, router, state]);

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
        {/* One dot per pane — the cardio panes get one too, otherwise nothing hints they exist. */}
        {paneCount > 1 ? (
          <View style={styles.dots}>
            {state.exercises.map((e, i) => (
              <View
                key={e.id}
                testID={`pane-dot-${i}`}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === visiblePane ? colors.primary : e.skipped ? colors.warning : e.sets.every((s) => s.done) ? colors.success : colors.border,
                    width: i === visiblePane ? 18 : 6,
                  },
                ]}
              />
            ))}
            {cardioSlots.map((slot, i) => {
              const index = state.exercises.length + i;
              return (
                <View
                  key={slot}
                  testID={`pane-dot-${index}`}
                  style={[styles.dot, { backgroundColor: index === visiblePane ? colors.primary : colors.border, width: index === visiblePane ? 18 : 6 }]}
                />
              );
            })}
          </View>
        ) : null}
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        onScroll={Platform.OS === "web" ? onScroll : undefined}
        scrollEventThrottle={16}
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
      <Sheet ref={leaveRef} title="Antrenmandan çık">
        <Text variant="body" color="inkMuted" testID="leave-sheet">
          Kaydettiğin setler cihazında saklanır; geri döndüğünde kaldığın yerden devam edersin.
        </Text>
        <SheetActions>
          <Button
            label="Kaydı sil"
            variant="danger"
            onPress={() => {
              clearDraft();
              dismissLeave();
              router.back();
            }}
            style={styles.grow}
            testID="leave-discard"
          />
          <Button
            label="Sakla ve çık"
            variant="secondary"
            onPress={() => {
              dismissLeave();
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
