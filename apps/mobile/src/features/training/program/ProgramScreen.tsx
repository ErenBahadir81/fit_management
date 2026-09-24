import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import type { MuscleDTO, ScheduleEntry, WorkoutLogDTO } from "@fitfloow/core";
import { todayKey } from "../../../lib/dates";
import { Floo } from "../../../mascot";
import { spacing } from "../../../theme/tokens";
import { EmptyState } from "../../../ui/EmptyState";
import { Header } from "../../../ui/Header";
import { Reveal } from "../../../ui/Reveal";
import { Screen } from "../../../ui/Screen";
import { Segmented } from "../../../ui/Segmented";
import { useSheet } from "../../../ui/Sheet";
import { useToast } from "../../../ui/Toast";
import { RecoveryPanel } from "../recovery/RecoveryPanel";
import { doneSets, restoreDraft, totalSets } from "../lib/logger";
import { dayEyebrow, passLabel, upcomingDays, upcomingTitle } from "../lib/plan";
import { plannedDay, useJumpTo, useLogDay, useMuscles, useProgram, useSkipDay, useUndoLast, useWorkouts } from "../queries";
import { readDraft } from "../workout/useWorkoutSession";
import { HistoryPane } from "./HistoryPane";
import { LogDetailSheet } from "./LogDetailSheet";
import { OtherDaySheet, type OtherDayChoice } from "./OtherDaySheet";
import { ProgramSkeleton } from "./ProgramSkeleton";
import { SkipSheet } from "./SkipSheet";
import { TodayHero, type ResumeState } from "./TodayHero";
import { UpcomingDays } from "./UpcomingDays";
import { VolumeCard } from "./VolumeCard";

type Tab = "program" | "history" | "recovery";
const TABS = [
  { value: "program" as const, label: "Program" },
  { value: "history" as const, label: "Geçmiş" },
  { value: "recovery" as const, label: "Toparlanma" },
];

const NO_LOGS: WorkoutLogDTO[] = [];
const NO_MUSCLES: MuscleDTO[] = [];
export const EDITOR_ROUTE = "/(modals)/program-editor" as const;
export const WORKOUT_ROUTE = "/(modals)/workout" as const;

/**
 * Program tab — three segments on one route: the plan (today, the days around it, weekly volume),
 * the history, and recovery. The plan pane is a plain scrolling `Screen`, so the flat top bar
 * keeps content from sliding under the corner Floo.
 */
export function ProgramScreen() {
  const [tab, setTab] = useState<Tab>("program");
  const program = useProgram();
  const router = useRouter();
  const view = program.data ?? null;
  const hasProgram = Boolean(view && view.program.days.length > 0);
  const openEditor = useCallback(() => router.push(EDITOR_ROUTE), [router]);
  const header = (
    <TrainingTabs
      tab={tab}
      onChange={setTab}
      subtitle={view && hasProgram ? `${view.program.name} · ${passLabel(view.program)}` : undefined}
      onEdit={hasProgram ? openEditor : null}
    />
  );

  if (tab === "recovery") return <RecoveryPanel header={header} />;
  if (tab === "history") return <HistoryPane header={header} />;
  return <ProgramPane header={header} onCreate={openEditor} />;
}

function TrainingTabs({ tab, onChange, subtitle, onEdit }: { tab: Tab; onChange: (t: Tab) => void; subtitle?: string; onEdit: (() => void) | null }) {
  return (
    <View style={styles.tabsWrap}>
      <Header title="Program" subtitle={subtitle} right={onEdit ? { icon: "edit", label: "Programı düzenle", onPress: onEdit, testID: "edit-program" } : undefined} />
      <Segmented options={TABS} value={tab} onChange={onChange} testID="training-tabs" />
    </View>
  );
}

function ProgramPane({ header, onCreate }: { header: React.ReactNode; onCreate: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const program = useProgram();
  const history = useWorkouts({ limit: 60 });
  const muscles = useMuscles();
  const logDay = useLogDay();
  const skip = useSkipDay();
  const jump = useJumpTo();
  const undoLast = useUndoLast();

  const { ref: skipRef, present: presentSkip, dismiss: dismissSkip } = useSheet();
  const { ref: otherRef, present: presentOther, dismiss: dismissOther } = useSheet();
  const { ref: logRef, present: presentLog } = useSheet();
  const [openLog, setOpenLog] = useState<WorkoutLogDTO | null>(null);

  const view = program.data ?? null;
  const logs = history.data ?? NO_LOGS;
  const today = todayKey();
  const hasProgram = Boolean(view && view.program.days.length > 0);
  const currentDay = view?.current?.day ?? null;
  const planned = useMemo(() => (view && hasProgram ? plannedDay(view, today) : null), [hasProgram, today, view]);
  const upcoming = useMemo(() => (view && hasProgram ? upcomingDays(view, logs, today) : []), [hasProgram, logs, today, view]);

  /* --- a session the user walked out of: the MMKV draft, read straight off the device --- */
  // Backing out of the logger without finishing invalidates no query, so this tab looks for itself:
  // once when the day changes (during render, the React-sanctioned way to derive state from a prop
  // change) and again every time the tab regains focus.
  const dayOrder = currentDay?.order ?? null;
  const dayId = currentDay?.id ?? null;
  const dayKey = dayOrder === null ? null : `${dayId ?? ""}#${dayOrder}`;
  const [resume, setResume] = useState<{ forDay: string | null; value: ResumeState | null }>(() => ({ forDay: dayKey, value: readResumeFor(dayOrder, dayId) }));
  if (resume.forDay !== dayKey) setResume({ forDay: dayKey, value: readResumeFor(dayOrder, dayId) });
  useFocusEffect(useCallback(() => setResume({ forDay: dayKey, value: readResumeFor(dayOrder, dayId) }), [dayKey, dayOrder, dayId]));

  const showLog = useCallback(
    (log: WorkoutLogDTO) => {
      setOpenLog(log);
      presentLog();
    },
    [presentLog]
  );
  const openEntry = useCallback(
    (entry: ScheduleEntry) => {
      const log = entry.isToday ? view?.todayLog : logs.find((l) => l.id === entry.logId);
      if (log) showLog(log);
    },
    [logs, showLog, view?.todayLog]
  );

  const start = useCallback(() => router.push(WORKOUT_ROUTE), [router]);
  const restDone = useCallback(() => {
    if (!currentDay) return;
    logDay.mutate({ dayId: currentDay.id }, { onSuccess: () => toast.show({ message: "Dinlenme günü tamam", kind: "success" }) });
  }, [currentDay, logDay, toast]);
  const confirmBreak = useCallback(
    (reason: string | undefined) => {
      dismissSkip();
      skip.mutate(reason, { onSuccess: () => toast.show({ message: "Bugün ara verdin", kind: "info" }) });
    },
    [dismissSkip, skip, toast]
  );
  const logOther = useCallback(
    ({ dayId: id, resumePlanned }: OtherDayChoice) => {
      dismissOther();
      const title = view?.program.days.find((d) => d.id === id)?.title ?? "Gün";
      logDay.mutate({ dayId: id, resumePlanned }, { onSuccess: () => toast.show({ message: `«${title}» bugüne kaydedildi`, kind: "success" }) });
    },
    [dismissOther, logDay, toast, view?.program.days]
  );
  const startOther = useCallback(
    ({ dayId: id, resumePlanned }: OtherDayChoice) => {
      dismissOther();
      router.push({ pathname: WORKOUT_ROUTE, params: { dayId: id, ...(resumePlanned ? { resumePlanned: "1" } : {}) } });
    },
    [dismissOther, router]
  );
  const jumpTo = useCallback(
    (id: string) => {
      dismissOther();
      jump.mutate(id);
    },
    [dismissOther, jump]
  );
  const onUndoToday = useCallback(() => undoLast.mutate(), [undoLast]);
  const refresh = useCallback(() => {
    void program.refetch();
    void history.refetch();
  }, [history, program]);

  if (program.isError && !view) {
    return (
      <Screen>
        {header}
        <EmptyState illustration={<Floo mood="worried" size="m" />} title="Program yüklenemedi" body="Bağlantını kontrol edip tekrar dene." action={{ label: "Tekrar dene", onPress: () => void program.refetch(), icon: "refresh" }} />
      </Screen>
    );
  }

  const busy = logDay.isPending || skip.isPending || jump.isPending || undoLast.isPending;
  return (
    <Screen refreshing={(program.isRefetching || history.isRefetching) && !program.isPending} onRefresh={refresh}>
      {header}
      <Reveal ready={Boolean(view)} skeleton={<ProgramSkeleton />}>
        {view ? (
          hasProgram ? (
            <View style={styles.stack}>
              <TodayHero
                day={currentDay}
                todayLog={view.todayLog}
                eyebrow={dayEyebrow(view.program, currentDay, today)}
                resume={resume.value}
                busy={busy}
                onStart={start}
                onRestDone={restDone}
                onOther={presentOther}
                onBreak={presentSkip}
                onUndo={onUndoToday}
                onOpenLog={showLog}
              />
              <UpcomingDays title={upcomingTitle(view.program)} entries={upcoming} onOpenLog={openEntry} />
              <VolumeCard planned={view.plannedVolume} done={view.weeklyVolume} />
            </View>
          ) : (
            <EmptyState
              illustration={<Floo mood="sleepy" size="m" />}
              title="Henüz programın yok"
              body="Günlerini kendin kur: güç, koşu, dinlenme. Döngü ya da haftalık, sen seç."
              action={{ label: "Program oluştur", onPress: onCreate, icon: "add" }}
              testID="no-program"
            />
          )
        ) : null}
      </Reveal>

      <SkipSheet sheetRef={skipRef} dayTitle={currentDay?.title ?? ""} busy={skip.isPending} onConfirm={confirmBreak} onCancel={dismissSkip} />
      {view && hasProgram ? (
        <OtherDaySheet sheetRef={otherRef} program={view.program} plannedDayId={planned?.id ?? null} busy={logDay.isPending} onLog={logOther} onStart={startOther} onJump={jumpTo} />
      ) : null}
      <LogDetailSheet sheetRef={logRef} log={openLog} muscles={muscles.data ?? NO_MUSCLES} />
    </Screen>
  );
}

/** How far into today's session the stored draft got, or `null` when there is nothing to resume. */
function readResumeFor(dayOrder: number | null, dayId: string | null): ResumeState | null {
  if (dayOrder === null) return null;
  const draft = restoreDraft(readDraft(), { dayOrder, dayId, dateKey: todayKey() });
  if (!draft) return null;
  const done = doneSets(draft);
  return done > 0 ? { doneSets: done, totalSets: totalSets(draft) } : null;
}

const styles = StyleSheet.create({
  tabsWrap: { gap: spacing.md },
  stack: { gap: spacing.cardGap },
});
