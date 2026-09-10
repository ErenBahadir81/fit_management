import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import type { MuscleDTO, ScheduleEntry, Weekday, WorkoutLogDTO } from "@fitfloow/core";
import { todayKey } from "../../../lib/dates";
import { useUndoWindow } from "../../../lib/useUndoWindow";
import { Floo } from "../../../mascot/Floo";
import { spacing } from "../../../theme/tokens";
import { EmptyState } from "../../../ui/EmptyState";
import { Entry } from "../../../ui/Entry";
import { Header } from "../../../ui/Header";
import { ListRefreshControl } from "../../../ui/ListRefreshControl";
import { Reveal } from "../../../ui/Reveal";
import { Screen } from "../../../ui/Screen";
import { Segmented } from "../../../ui/Segmented";
import { Text } from "../../../ui/Text";
import { useTabBarSpace } from "../../../ui/TabBar";
import { useSheet } from "../../../ui/Sheet";
import { useToast } from "../../../ui/Toast";
import { UndoBar } from "../../../ui/UndoBar";
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

const NO_LOGS: WorkoutLogDTO[] = [];
const NO_MUSCLES: MuscleDTO[] = [];

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
      <Header title="Program" subtitle={programName} right={onEdit ? { icon: "options-outline", label: "Programı düzenle", onPress: onEdit, testID: "edit-program" } : undefined} />
      <Segmented options={TABS} value={tab} onChange={onChange} testID="training-tabs" />
    </View>
  );
}

function WeekHeadRow({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.weekHead}>
      <Text variant="label" color="inkMuted">
        {title}
      </Text>
      <Text variant="caption" color="inkSubtle" tabular>
        {count} antrenman
      </Text>
    </View>
  );
}

function ProgramPane({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const router = useRouter();
  const toast = useToast();
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

  const view = program.data ?? null;
  const logs = history.data ?? NO_LOGS;
  const hasProgram = Boolean(view && view.program.days.length > 0);
  const currentDay = view?.current?.day ?? null;

  /* --- undoable delete: the row leaves at once, the DELETE fires after the undo window --- */
  const commitDelete = useCallback((log: WorkoutLogDTO) => remove.mutate(log.id), [remove]);
  const undoWindow = useUndoWindow<WorkoutLogDTO>(commitDelete);
  const pending = undoWindow.pending;
  const requestDelete = useCallback(
    (log: WorkoutLogDTO) => {
      logSheet.dismiss();
      undoWindow.request(log);
    },
    [logSheet, undoWindow]
  );
  const undoDelete = useCallback(() => {
    if (undoWindow.undo()) toast.show({ message: "Kayıt geri getirildi", kind: "success" });
  }, [toast, undoWindow]);

  const rows = useMemo<Row[]>(() => {
    const visible = logs.filter((l) => l.id !== pending?.id);
    return groupLogsByWeek(visible, measurementDay, todayKey()).flatMap((section) => [
      { kind: "week" as const, key: `w-${section.weekKey}`, title: section.title, count: section.count },
      ...section.logs.map((log) => ({ kind: "log" as const, key: log.id, log })),
    ]);
  }, [logs, measurementDay, pending?.id]);
  const sessionCount = useMemo(() => logs.filter((l) => !l.isOffDay).length, [logs]);

  const strip: StripItem[] = useMemo(() => stripItems(view?.schedule ?? []), [view?.schedule]);
  const selected = useMemo(() => strip.find((s) => s.dateKey === (selectedDay ?? "")) ?? strip.find((s) => s.isToday) ?? null, [selectedDay, strip]);

  const showLog = useCallback(
    (log: WorkoutLogDTO) => {
      setOpenLog(log);
      logSheet.present();
    },
    [logSheet]
  );
  const onSelectDay = useCallback(
    (item: StripItem) => {
      setSelectedDay(item.dateKey);
      const entry: ScheduleEntry | undefined = view?.schedule.find((s) => s.dateKey === item.dateKey);
      const log = entry?.logId ? (logs.find((l) => l.id === entry.logId) ?? view?.todayLog ?? null) : null;
      if (log) showLog(log);
    },
    [logs, showLog, view]
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
  const onUndoToday = useCallback(() => undoLast.mutate(), [undoLast]);

  const refresh = useCallback(() => {
    void program.refetch();
    void history.refetch();
  }, [history, program]);

  const busy = skip.isPending || jump.isPending || undoLast.isPending;
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
                      busy={busy}
                      onStart={start}
                      onSkip={skipSheet.present}
                      onJump={jumpSheet.present}
                      onUndo={onUndoToday}
                      onOpenLog={showLog}
                    />
                  </Entry>
                  <Entry index={2}>
                    <VolumeCard volume={view.weeklyVolume} />
                  </Entry>
                  <Entry index={3}>
                    <View style={styles.historyHead}>
                      <Text variant="title">Geçmiş</Text>
                      {sessionCount > 0 ? (
                        <Text variant="caption" color="inkMuted" tabular>
                          {sessionCount} antrenman
                        </Text>
                      ) : null}
                    </View>
                  </Entry>
                </>
              ) : (
                <EmptyState illustration={<Floo mood="sleepy" size="m" />} title="Program atanmamış" body="Antrenörün bir program tanımladığında günlerin burada belirir." testID="no-program" />
              )}
            </View>
          ) : null}
        </Reveal>
      </View>
    ),
    [tab, onTab, view, hasProgram, editorSheet.present, selected, onSelectDay, currentDay, busy, start, skipSheet.present, jumpSheet.present, onUndoToday, showLog, sessionCount]
  );

  const renderItem = useCallback<ListRenderItem<Row>>(
    ({ item }) =>
      item.kind === "week" ? (
        <WeekHeadRow title={item.title} count={item.count} />
      ) : (
        <View style={styles.rowWrap}>
          <HistoryRow log={item.log} onPress={showLog} onDelete={requestDelete} />
        </View>
      ),
    [requestDelete, showLog]
  );
  const contentStyle = useMemo(() => ({ paddingHorizontal: spacing.gutter, paddingBottom: tabSpace + spacing.lg }), [tabSpace]);
  const listEmpty = useMemo(
    () => (view && hasProgram && !history.isPending ? <EmptyState compact illustration={<Floo mood="think" size="s" animate={false} />} title="Henüz kayıt yok" body="İlk antrenmanını bitirdiğinde burada görünecek." testID="no-history" /> : null),
    [hasProgram, history.isPending, view]
  );

  if (program.isError && !view) {
    return (
      <Screen>
        <TrainingTabs tab={tab} onChange={onTab} onEdit={null} />
        <EmptyState illustration={<Floo mood="worried" size="m" />} title="Program yüklenemedi" body="Bağlantını kontrol edip tekrar dene." action={{ label: "Tekrar dene", onPress: () => void program.refetch(), icon: "refresh" }} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <FlashList
        testID="history-list"
        data={rows}
        keyExtractor={keyOf}
        getItemType={typeOf}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        refreshControl={<ListRefreshControl refreshing={(program.isRefetching || history.isRefetching) && !program.isPending} onRefresh={refresh} />}
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
      />

      {/* Undo lives outside the list: a header that changes height re-triggers FlashList's layout pass. */}
      {pending ? <UndoBar message="Kayıt silindi" onUndo={undoDelete} bottom={tabSpace + spacing.md} /> : null}

      <SkipSheet sheetRef={skipSheet.ref} dayTitle={currentDay?.title ?? ""} busy={skip.isPending} onConfirm={confirmSkip} onCancel={skipSheet.dismiss} />
      <JumpSheet sheetRef={jumpSheet.ref} days={view?.program.days ?? []} currentIndex={view?.program.currentIndex ?? 0} onSelect={confirmJump} />
      <LogDetailSheet sheetRef={logSheet.ref} log={openLog} muscles={muscles.data ?? NO_MUSCLES} onDelete={requestDelete} />
      {view ? <ProgramEditorSheet sheetRef={editorSheet.ref} program={view.program} onClose={editorSheet.dismiss} /> : null}
    </Screen>
  );
}

const keyOf = (row: Row) => row.key;
const typeOf = (row: Row) => row.kind;

const styles = StyleSheet.create({
  tabsWrap: { gap: spacing.md },
  header: { gap: spacing.lg, paddingBottom: spacing.md },
  reveal: { minHeight: 0 },
  stack: { gap: spacing.lg },
  stripBlock: { gap: spacing.sm },
  historyHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: spacing.sm },
  weekHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: spacing.md, paddingBottom: spacing.sm },
  rowWrap: { paddingBottom: spacing.sm },
});
