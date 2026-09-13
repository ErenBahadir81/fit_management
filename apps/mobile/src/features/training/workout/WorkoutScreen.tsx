import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { useRouter } from "expo-router";
import type { ExerciseDTO } from "@fitfloow/core";
import { fmtDuration, fmtInt } from "../../../lib/format";
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
import { Pressable } from "../../../ui/Pressable";
import { ProgressBar } from "../../../ui/ProgressBar";
import { Screen } from "../../../ui/Screen";
import { Sheet, SheetActions, useSheet } from "../../../ui/Sheet";
import { SuccessCheck } from "../../../ui/SuccessCheck";
import { Text } from "../../../ui/Text";
import { useToast } from "../../../ui/Toast";
import { compareToLast, findLastSameDay } from "../lib/present";
import {
  DEFAULT_REST_SECONDS,
  cardioSlots,
  doneSets,
  elapsedMinutes,
  hasAnything,
  muscleSets,
  nextPending,
  paneCount,
  progress,
  toCompleteInput,
  totalSets,
  totalTonnage,
} from "../lib/logger";
import { useCompleteWorkout, useLastPerformances, useMuscles, useProgram, useWorkouts } from "../queries";
import { AddExerciseSheet } from "./AddExerciseSheet";
import { CardioPane } from "./CardioPane";
import { ExercisePane, setLabel } from "./ExercisePane";
import { FinishSheet } from "./FinishSheet";
import { SessionSheet } from "./SessionSheet";
import { clearDraft, useWorkoutSession } from "./useWorkoutSession";
// C2 — W1's rest controller and its timer, consumed exactly as the contract specifies.
import { RestTimer, useRestController } from "./restBridge";

/** How long the "Antrenman kaydedildi" moment stays before the modal closes itself. */
const SAVED_MS = 2600;
const NO_NAMES: string[] = [];

/** Full-screen set-by-set logger. Route: `/(modals)/workout`. */
export function WorkoutScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
  const program = useProgram();
  const muscles = useMuscles();
  const history = useWorkouts({ limit: 60 });
  const complete = useCompleteWorkout();

  const view = program.data ?? null;
  const session = useWorkoutSession(view);
  const { state, dispatch, now, restored } = session;

  const finishSheet = useSheet();
  const addSheet = useSheet();
  const sessionSheet = useSheet();
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

  /* ------------------------------- the pager ------------------------------- */
  // `state.activeIndex` is the one source of truth: it addresses every pane (exercises, then the
  // cardio slots), it drives the pager, the dots and the reducer's "which set am I logging".
  const activeIndex = state?.activeIndex ?? 0;
  const slots = useMemo(() => (state ? cardioSlots(state) : []), [state]);
  const panes = state ? paneCount(state) : 0;

  useEffect(() => {
    pager.current?.scrollTo({ x: activeIndex * width, animated: !reduce });
  }, [activeIndex, reduce, width]);

  const settleOn = useCallback(
    (index: number) => {
      if (index !== activeIndex) dispatch({ type: "focus", index });
    },
    [activeIndex, dispatch]
  );

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => settleOn(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width))),
    [settleOn, width]
  );

  /**
   * react-native-web's ScrollView never fires `onMomentumScrollEnd` — `ScrollViewBase` only wires
   * `onScroll` — so on web the pager never told the screen which exercise the user had swiped to.
   * Settle on `onScroll` instead, but only once the ticks stop and only on a page boundary: a
   * mid-swipe tick would steal focus, and the first tick of a programmatic scroll still reports the
   * pane we are leaving, which would bounce the pager straight back.
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

  const jumpToPane = useCallback(
    (index: number) => {
      sessionSheet.dismiss();
      dispatch({ type: "focus", index });
    },
    [dispatch, sessionSheet]
  );

  /* --------------------------------- rest (C2) ------------------------------ */
  const currentExercise = state && activeIndex < state.exercises.length ? state.exercises[activeIndex] : null;
  const onRestFinish = useCallback(() => void haptic.medium(), []);
  const rest = useRestController({ exerciseKey: currentExercise?.name ?? "", fallbackSeconds: state?.restSeconds ?? DEFAULT_REST_SECONDS, onFinish: onRestFinish });

  /* ------------------------- "what did I do last time" ---------------------- */
  const exerciseNames = useMemo(() => state?.exercises.map((e) => e.name) ?? NO_NAMES, [state]);
  const lastOf = useLastPerformances(exerciseNames);
  const prefilled = useRef(new Set<string>());
  useEffect(() => {
    if (!state) return;
    state.exercises.forEach((ex, i) => {
      if (prefilled.current.has(ex.id)) return;
      const perf = lastOf(ex.name);
      if (!perf) return; // still loading — try again when it lands
      prefilled.current.add(ex.id);
      const top = perf.sets[0];
      if (top) dispatch({ type: "prefill", exercise: i, weightKg: top.weightKg ?? null, reps: top.reps });
    });
  }, [dispatch, lastOf, state]);

  /* -------------------------------- actions --------------------------------- */
  const pending = state ? nextPending(state) : null;
  const allDone = Boolean(state) && pending === null;
  const pendingSet = pending && state ? state.exercises[pending.exercise].sets[pending.set] : null;
  const pendingExercise = pending && state ? state.exercises[pending.exercise] : null;

  const completeSet = useCallback(() => {
    if (!state) return;
    void haptic.medium(); // one firm tap per set; the success buzz is saved for the finish
    dispatch({ type: "complete-set", at: Date.now() });
    rest.start();
  }, [dispatch, rest, state]);

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

  /* -------------------------- the session, summarised ----------------------- */
  const previous = useMemo(() => (state ? findLastSameDay(history.data ?? [], state.dayOrder, state.dateKey) : null), [history.data, state]);
  const summary = useMemo(
    () => (state ? compareToLast({ tonnageKg: totalTonnage(state), sets: doneSets(state) }, previous) : null),
    [previous, state]
  );

  if (saved && state && summary) {
    return <SavedState tonnageKg={totalTonnage(state)} sets={doneSets(state)} minutes={elapsedMinutes(state, now)} muscleCount={Object.keys(muscleSets(state)).length} summaryTr={summary.summaryTr} />;
  }

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

  if (!state || panes === 0) {
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
  const tonnage = totalTonnage(state);
  const whereLabel =
    activeIndex < state.exercises.length
      ? `${activeIndex + 1}/${state.exercises.length} · ${state.exercises[activeIndex].name}`
      : slots[activeIndex - state.exercises.length] === "run"
        ? "Koşu"
        : "Yüzme";

  // What the primary action will actually log — named, because from a cardio pane it is not obvious.
  const nextLabel =
    pending && pendingSet && pendingExercise
      ? `${pendingExercise === currentExercise ? "" : `${pendingExercise.name} · `}${pending.set + 1}. set · ${setLabel(pendingSet, pendingExercise.metric === "time" ? "sn" : "tekrar")}`
      : null;

  return (
    <Screen scroll={false} tabBar={false} edges={["top"]}>
      <View style={styles.header}>
        <Header
          title={state.title}
          compact
          left={{ icon: "close", label: "Kapat", onPress: leave, testID: "workout-close" }}
          right={{ icon: "flag-outline", label: "Bitir", onPress: finishSheet.present, testID: "workout-finish" }}
        />

        {/* The whole strip is the way into the session overview — a bigger target than any icon. */}
        <Pressable
          onPress={sessionSheet.present}
          haptic="select"
          minTarget={false}
          scaleTo={0.995}
          accessibilityLabel={`${whereLabel}. ${done} / ${total} set tamam. Antrenmanın tamamını görmek için dokun`}
          testID="session-overview"
          style={styles.overview}
        >
          <View style={styles.whereRow}>
            <Text variant="label" numberOfLines={1} style={styles.grow}>
              {whereLabel}
            </Text>
            <Icon icon="exercises" size={16} color="inkSubtle" />
          </View>
          <ProgressBar value={progress(state)} tone="primary" height={6} accessibilityLabel={`${done} / ${total} set tamam`} />
          <View style={styles.metaRow}>
            <Text variant="label" color="inkMuted" tabular testID="workout-progress">
              {done}/{total} set
            </Text>
            {tonnage > 0 ? (
              <Text variant="label" color="inkMuted" tabular testID="workout-tonnage">
                · {fmtInt(tonnage)} kg
              </Text>
            ) : null}
            <View style={styles.grow} />
            <Icon icon="duration" size={14} color="inkSubtle" />
            <Text variant="label" color="inkMuted" tabular testID="workout-elapsed">
              {fmtDuration(elapsedMinutes(state, now))}
            </Text>
          </View>
          {panes > 1 ? (
            <View style={styles.dots}>
              {state.exercises.map((e, i) => (
                <View
                  key={e.id}
                  testID={`pane-dot-${i}`}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: i === activeIndex ? colors.primary : e.skipped ? colors.warning : e.sets.every((s) => s.done) ? colors.success : colors.border,
                      width: i === activeIndex ? 18 : 6,
                    },
                  ]}
                />
              ))}
              {slots.map((slot, i) => {
                const index = state.exercises.length + i;
                return <View key={slot} testID={`pane-dot-${index}`} style={[styles.dot, { backgroundColor: index === activeIndex ? colors.primary : colors.border, width: index === activeIndex ? 18 : 6 }]} />;
              })}
            </View>
          ) : null}
        </Pressable>
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
            last={lastOf(exercise.name)}
            onSetReps={(setIndex, value) => dispatch({ type: "set-reps", exercise: index, set: setIndex, value })}
            onSetRir={(setIndex, value) => dispatch({ type: "set-rir", exercise: index, set: setIndex, value })}
            onSetWeight={(setIndex, value) => dispatch({ type: "set-weight", exercise: index, set: setIndex, value })}
            onUndoSet={(setIndex) => dispatch({ type: "undo-set", exercise: index, set: setIndex })}
            onAddSet={() => dispatch({ type: "add-set", exercise: index })}
            onRemoveSet={() => dispatch({ type: "remove-set", exercise: index })}
            onToggleSkip={() => dispatch({ type: "toggle-skip", exercise: index })}
          />
        ))}
        {slots.map((slot) => {
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
        {/* Rest sits directly above the thumb: mid-set, that is where both the eye and the hand are. */}
        <RestTimer controller={rest} />
        <View style={styles.barRow}>
          <Chip label="Hareket ekle" icon="add" onPress={addSheet.present} testID="workout-add-exercise" />
          <View style={styles.grow} />
          {nextLabel ? (
            <Text variant="caption" color="inkMuted" tabular numberOfLines={1} testID="next-set-preview">
              {nextLabel}
            </Text>
          ) : null}
        </View>
        <Button
          label={allDone ? "Antrenmanı bitir" : "Seti kaydet"}
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
        compare={summary}
        saving={complete.isPending}
        onRpe={(value) => dispatch({ type: "set-rpe", value })}
        onNotes={(value) => dispatch({ type: "set-notes", value })}
        onFinish={finish}
        onCancel={finishSheet.dismiss}
      />
      <SessionSheet sheetRef={sessionSheet.ref} state={state} onJump={jumpToPane} />
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

/** The last thing you see: what you actually did, not just that it saved. */
function SavedState({ tonnageKg, sets, minutes, muscleCount, summaryTr }: { tonnageKg: number; sets: number; minutes: number; muscleCount: number; summaryTr: string }) {
  const mascot = useMascot("workout");
  return (
    <Screen tabBar={false} edges={["top", "bottom"]} contentStyle={styles.saved}>
      <Animated.View entering={FadeIn.duration(200)} style={styles.savedInner} testID="workout-saved">
        <SuccessCheck size={88} />
        <Text variant="heading" align="center">
          Antrenman kaydedildi
        </Text>
        <View style={styles.savedStats}>
          {tonnageKg > 0 ? <SavedStat value={`${fmtInt(tonnageKg)} kg`} label="toplam yük" /> : null}
          <SavedStat value={String(sets)} label="set" />
          <SavedStat value={fmtDuration(minutes)} label="süre" />
          {muscleCount > 0 ? <SavedStat value={String(muscleCount)} label="kas grubu" /> : null}
        </View>
        <Text variant="body" color="inkMuted" align="center" testID="workout-saved-compare">
          {summaryTr}
        </Text>
        <Floo mood="cheer" size="m" />
        <SpeechBubble text={mascot.text} tail="none" />
      </Animated.View>
    </Screen>
  );
}

function SavedStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.savedStat}>
      <Text variant="title" tabular align="center">
        {value}
      </Text>
      <Text variant="caption" color="inkMuted" align="center">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.gutter, gap: spacing.sm, paddingBottom: spacing.md },
  whereRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  overview: { gap: spacing.sm },
  dots: { flexDirection: "row", gap: spacing.xs, justifyContent: "center", marginTop: spacing.xs },
  dot: { height: 6, borderRadius: 3 },
  pager: { flex: 1 },
  bar: {
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
  },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
  saved: { flex: 1, justifyContent: "center" },
  savedInner: { alignItems: "center", gap: spacing.lg },
  savedStats: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.xl },
  savedStat: { gap: 2, minWidth: 64 },
});
