import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeOut } from "react-native-reanimated";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import type { MuscleDTO, ScheduleEntry, Weekday, WorkoutLogDTO } from "@fitfloow/core";
import { todayKey } from "../../../lib/dates";
import { haptic } from "../../../lib/haptics";
import { Floo } from "../../../mascot/Floo";
import { useTheme } from "../../../theme/ThemeProvider";
import { enterCard } from "../../../theme/motion";
import { radii, spacing } from "../../../theme/tokens";
import { Chip } from "../../../ui/Chip";
import { EmptyState } from "../../../ui/EmptyState";
import { Entry } from "../../../ui/Entry";
import { Header } from "../../../ui/Header";
import { Icon } from "../../../ui/Icon";
import { Reveal } from "../../../ui/Reveal";
import { Screen } from "../../../ui/Screen";
import { Segmented } from "../../../ui/Segmented";
import { Text } from "../../../ui/Text";
import { useTabBarSpace } from "../../../ui/TabBar";
import { useSheet } from "../../../ui/Sheet";
import { useToast } from "../../../ui/Toast";
import { useSession } from "../../auth/session";
import { RecoveryPanel } from "../recovery/RecoveryPanel";
import { groupLogsByWeek, stripItems, type StripItem } from "../lib/present";
import { useDeleteWorkout, useJumpTo, useMuscles, useProgram, useSkipDay, useUndoLast, useWorkouts } from "../queries";
import { CurrentDayCard } from "./CurrentDayCard";
import { HistoryRow } from "./HistoryRow";
import { JumpSheet } from "./JumpSheet";
import { LogDetailSheet } from "./LogDetailSheet";
import { ProgramEditorSheet } from "./ProgramEditorSheet";
import { ProgramSkeleton } from "./ProgramSkeleton";
import { SkipSheet } from "./SkipSheet";
import { StripCaption, WeekStrip } from "./WeekStrip";
import { VolumeCard } from "./VolumeCard";

type Tab = "program" | "recovery";
const TABS = [
  { value: "program" as const, label: "Program" },
  { value: "recovery" as const, label: "Toparlanma" },
];

type Row = { kind: "week"; key: string; title: string; count: number } | { kind: "log"; key: string; log: WorkoutLogDTO };

/** Undo window before a deleted session actually leaves the server. */
const UNDO_MS = 5000;

/**
 * Program tab — the week strip, today's card with the single primary action, weekly volume and
 * the session history. The "Toparlanma" segment swaps in the recovery grid (same query root, one
 * pull-to-refresh), because recovery has no tab of its own.
 */
export function ProgramScreen() {
  const [tab, setTab] = useState<Tab>("program");
  const program = useProgram();
  const switchTab = useCallback((next: Tab) => setTab(next), []);

  if (tab === "recovery") {
    return <RecoveryPanel header={<TrainingTabs tab={tab} onChange={switchTab} programName={program.data?.program.name} onEdit={null} />} />;
  }
  return <ProgramPane tab={tab} onTab={switchTab} />;
}

function TrainingTabs({ tab, onChange, programName, onEdit }: { tab: Tab; onChange: (t: Tab) => void; programName?: string; onEdit: (() => void) | null }) {
  return (
    <View style={styles.tabsWrap}>
      <Header
        title="Program"
        subtitle={programName}
        right={onEdit ? { icon: "options-outline", label: "Programı düzenle", onPress: onEdit, testID: "edit-program" } : undefined}
      />
      <Segmented options={TABS} value={tab} onChange={onChange} testID="training-tabs" />
    </View>
  );
}

function ProgramPane({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const tabSpace = useTabBarSpace();
  const measurementDay = useSession((s) => (s.user?.measurementDay ?? 0) as Weekday);

  const program = useProgram();
  const history = useWorkouts({ limit: 60 });
  const muscles = useMuscles();
  const skip = useSkipDay();
  const jump = useJumpTo();
  const undoLast = useUndoLast();
  const remove = useDeleteWorkout();

  const skipSheet = useSheet();
  const jumpSheet = useSheet();
  const logSheet = useSheet();
  const editorSheet = useSheet();

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [openLog, setOpenLog] = useState<WorkoutLogDTO | null>(null);
  const [pending, setPending] = useState<WorkoutLogDTO | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const view = program.data ?? null;
  const logs = history.data ?? [];

  /* --- undoable delete: the row leaves at once, the request fires after the undo window --- */
  const flush = useCallback(
    (log: WorkoutLogDTO | null) => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = null;
      if (log) remove.mutate(log.id);
    },
    [remove]
  );
  const requestDelete = useCallback(
    (log: WorkoutLogDTO) => {
      flush(pending);
      setPending(log);
      logSheet.dismiss();
      void haptic.warning();
      undoTimer.current = setTimeout(() => {
        setPending(null);
        remove.mutate(log.id);
        undoTimer.current = null;
      }, UNDO_MS);
    },
    [flush, logSheet, pending, remove]
  );
  const undoDelete = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    setPending(null);
    toast.show({ message: "Kayıt geri getirildi", kind: "success" });
  }, [toast]);
  // Leaving the screen must not silently keep the row: commit whatever is still pending.
  // Refs, not deps — the mutation object changes identity on every render, and a cleanup that
  // re-ran on each render would fire the delete in a loop.
  const pendingRef = useRef<WorkoutLogDTO | null>(null);
  const removeRef = useRef(remove);
  pendingRef.current = pending;
  removeRef.current = remove;
  useEffect(
    () => () => {
      if (undoTimer.current) {
        clearTimeout(undoTimer.current);
        if (pendingRef.current) removeRef.current.mutate(pendingRef.current.id);
      }
    },
    []
  );

  const rows = useMemo<Row[]>(() => {
    const visible = logs.filter((l) => l.id !== pending?.id);
    return groupLogsByWeek(visible, measurementDay, todayKey()).flatMap((section) => [
      { kind: "week" as const, key: `w-${section.weekKey}`, title: section.title, count: section.count },
      ...section.logs.map((log) => ({ kind: "log" as const, key: log.id, log })),
    ]);
  }, [logs, measurementDay, pending?.id]);

  const strip: StripItem[] = useMemo(() => stripItems(view?.schedule ?? []), [view?.schedule]);
  const selected = useMemo(() => strip.find((s) => s.dateKey === (selectedDay ?? "")) ?? strip.find((s) => s.isToday) ?? null, [selectedDay, strip]);

  const onSelectDay = useCallback(
    (item: StripItem) => {
      setSelectedDay(item.dateKey);
      const entry: ScheduleEntry | undefined = view?.schedule.find((s) => s.dateKey === item.dateKey);
      const log = entry?.logId ? logs.find((l) => l.id === entry.logId) ?? view?.todayLog ?? null : null;
      if (log) {
        setOpenLog(log);
        logSheet.present();
      }
    },
    [logSheet, logs, view]
  );

  const showLog = useCallback(
    (log: WorkoutLogDTO) => {
      setOpenLog(log);
      logSheet.present();
    },
    [logSheet]
  );

  const start = useCallback(() => router.push("/(modals)/workout"), [router]);
  const confirmSkip = useCallback(
    (reason: string | undefined) => {
      skipSheet.dismiss();
      skip.mutate(reason, { onSuccess: () => toast.show({ message: "Bugün atlandı", kind: "info" }) });
    },
    [skip, skipSheet, toast]
  );
  const confirmJump = useCallback(
    (index: number) => {
      jumpSheet.dismiss();
      jump.mutate(index);
    },
    [jump, jumpSheet]
  );

  const refresh = useCallback(() => {
    void program.refetch();
    void history.refetch();
  }, [history, program]);

  if (program.isError && !view) {
    return (
      <Screen>
        <TrainingTabs tab={tab} onChange={onTab} onEdit={null} />
        <EmptyState
          illustration={<Floo mood="worried" size="m" />}
          title="Program yüklenemedi"
          body="Bağlantını kontrol edip tekrar dene."
          action={{ label: "Tekrar dene", onPress: () => void program.refetch(), icon: "refresh" }}
        />
      </Screen>
    );
  }

  const hasProgram = Boolean(view && view.program.days.length > 0);
  const currentDay = view?.current?.day ?? null;

  const listHeader = useMemo(
    () => (
      <View style={styles.header}>
        <TrainingTabs tab={tab} onChange={onTab} programName={view?.program.name} onEdit={hasProgram ? editorSheet.present : null} />
        <Reveal ready={Boolean(view)} skeleton={<ProgramSkeleton />} style={styles.reveal}>
          {view ? (
            <View style={styles.stack}>
              {hasProgram ? (
                <>
                  <Entry index={0}>
                    <View style={styles.stripBlock}>
                      <WeekStrip schedule={view.schedule} selectedKey={selected?.dateKey ?? null} onSelect={onSelectDay} />
                      <StripCaption item={selected} />
                    </View>
                  </Entry>
                  <Entry index={1}>
                    <CurrentDayCard
                      day={currentDay}
                      todayLog={view.todayLog}
                      weekNumber={view.program.weekNumber}
                      busy={skip.isPending || jump.isPending || undoLast.isPending}
                      onStart={start}
                      onSkip={skipSheet.present}
                      onJump={jumpSheet.present}
                      onUndo={() => undoLast.mutate()}
                      onOpenLog={showLog}
                    />
                  </Entry>
                  <Entry index={2}>
                    <VolumeCard volume={view.weeklyVolume} />
                  </Entry>
                  <Entry index={3}>
                    <View style={styles.historyHead}>
                      <Text variant="title">Geçmiş</Text>
                      {logs.length > 0 ? (
                        <Text variant="caption" color="inkMuted" tabular>
                          {logs.filter((l) => !l.isOffDay).length} antrenman
                        </Text>
                      ) : null}
                    </View>
                  </Entry>
                </>
              ) : (
                <EmptyState
                  illustration={<Floo mood="sleepy" size="m" />}
                  title="Program atanmamış"
                  body="Antrenörün bir program tanımladığında günlerin burada belirir."
                  testID="no-program"
                />
              )}
            </View>
          ) : null}
        </Reveal>
      </View>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, onTab, view, hasProgram, selected, currentDay, logs, skip.isPending, jump.isPending, undoLast.isPending]
  );

  return (
    <Screen scroll={false}>
      <FlashList
        testID="history-list"
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.kind}
        renderItem={({ item }) =>
          item.kind === "week" ? (
            <View style={styles.weekHead}>
              <Text variant="label" color="inkMuted">
                {item.title}
              </Text>
              <Text variant="caption" color="inkSubtle" tabular>
                {item.count} antrenman
              </Text>
            </View>
          ) : (
            <View style={styles.rowWrap}>
              <HistoryRow log={item.log} onPress={showLog} onDelete={requestDelete} />
            </View>
          )
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          view && hasProgram && !history.isPending ? (
            <EmptyState compact illustration={<Floo mood="think" size="s" animate={false} />} title="Henüz kayıt yok" body="İlk antrenmanını bitirdiğinde burada görünecek." testID="no-history" />
          ) : null
        }
        refreshing={(program.isRefetching || history.isRefetching) && !program.isPending}
        onRefresh={refresh}
        contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: tabSpace + spacing.lg }}
        showsVerticalScrollIndicator={false}
      />

      {/* Undo lives outside the list: a header that changes height re-triggers FlashList's layout pass. */}
      {pending ? (
        <Animated.View
          entering={enterCard(0, false)}
          exiting={FadeOut.duration(160)}
          style={[styles.undoBar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, bottom: tabSpace + spacing.md }]}
          testID="undo-bar"
        >
          <Icon name="trash-outline" size={16} color="inkMuted" />
          <Text variant="label" color="inkMuted" style={styles.grow} numberOfLines={1}>
            Kayıt silindi
          </Text>
          <Chip label="Geri al" tone="primary" size="sm" icon="arrow-undo-outline" onPress={undoDelete} testID="undo-delete" />
        </Animated.View>
      ) : null}

      <SkipSheet sheetRef={skipSheet.ref} dayTitle={currentDay?.title ?? ""} busy={skip.isPending} onConfirm={confirmSkip} onCancel={skipSheet.dismiss} />
      <JumpSheet sheetRef={jumpSheet.ref} days={view?.program.days ?? []} currentIndex={view?.program.currentIndex ?? 0} onSelect={confirmJump} />
      <LogDetailSheet sheetRef={logSheet.ref} log={openLog} muscles={(muscles.data ?? []) as MuscleDTO[]} onDelete={requestDelete} />
      {view ? <ProgramEditorSheet sheetRef={editorSheet.ref} program={view.program} onClose={editorSheet.dismiss} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabsWrap: { gap: spacing.md },
  header: { gap: spacing.lg, paddingBottom: spacing.md },
  reveal: { minHeight: 0 },
  stack: { gap: spacing.lg },
  stripBlock: { gap: spacing.sm },
  historyHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: spacing.sm },
  weekHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: spacing.md, paddingBottom: spacing.sm },
  rowWrap: { paddingBottom: spacing.sm },
  undoBar: {
    position: "absolute",
    left: spacing.gutter,
    right: spacing.gutter,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  grow: { flex: 1 },
});
