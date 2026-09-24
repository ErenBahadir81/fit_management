import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { MuscleDTO, Weekday, WorkoutLogDTO } from "@fitfloow/core";
import { todayKey } from "../../../lib/dates";
import { useUndoWindow } from "../../../lib/useUndoWindow";
import { Floo } from "../../../mascot";
import { spacing } from "../../../theme/tokens";
import { EmptyState } from "../../../ui/EmptyState";
import { List, type ListRenderItem } from "../../../ui/List";
import { ListRefreshControl } from "../../../ui/ListRefreshControl";
import { Screen } from "../../../ui/Screen";
import { useSheet } from "../../../ui/Sheet";
import { useTabBarSpace } from "../../../ui/TabBar";
import { Text } from "../../../ui/Text";
import { useToast } from "../../../ui/Toast";
import { UndoBar } from "../../../ui/UndoBar";
import { useSession } from "../../auth/session";
import { groupLogsByWeek } from "../lib/present";
import { useDeleteWorkout, useMuscles, useWorkouts } from "../queries";
import { HistoryRow } from "./HistoryRow";
import { LogDetailSheet } from "./LogDetailSheet";

type Row = { kind: "week"; key: string; title: string; count: number } | { kind: "log"; key: string; log: WorkoutLogDTO };

const NO_LOGS: WorkoutLogDTO[] = [];
const NO_MUSCLES: MuscleDTO[] = [];

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

/**
 * "Geçmiş": every logged day grouped by the user's measurement week. Deleting is swipe (or the
 * detail sheet) + a 5 s undo window; the DELETE only fires once the window closes.
 */
export function HistoryPane({ header }: { header: React.ReactNode }) {
  const toast = useToast();
  const tabSpace = useTabBarSpace();
  const measurementDay = useSession((s) => (s.user?.measurementDay ?? 0) as Weekday);
  const history = useWorkouts({ limit: 60 });
  const muscles = useMuscles();
  const remove = useDeleteWorkout();
  const { ref: logRef, present: presentLog, dismiss: dismissLog } = useSheet();
  const [openLog, setOpenLog] = useState<WorkoutLogDTO | null>(null);

  const logs = history.data ?? NO_LOGS;
  const commitDelete = useCallback((log: WorkoutLogDTO) => remove.mutate(log.id), [remove]);
  const undoWindow = useUndoWindow<WorkoutLogDTO>(commitDelete);
  const pending = undoWindow.pending;
  const requestDelete = useCallback(
    (log: WorkoutLogDTO) => {
      dismissLog();
      undoWindow.request(log);
    },
    [dismissLog, undoWindow]
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

  const showLog = useCallback(
    (log: WorkoutLogDTO) => {
      setOpenLog(log);
      presentLog();
    },
    [presentLog]
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
  const listHeader = useMemo(
    () => (
      <View style={styles.header}>
        {header}
        {sessionCount > 0 ? (
          <Text variant="caption" color="inkMuted" tabular testID="history-count">
            Son 60 kayıtta {sessionCount} antrenman
          </Text>
        ) : null}
      </View>
    ),
    [header, sessionCount]
  );
  const listEmpty = useMemo(
    () =>
      history.isPending ? null : history.isError ? (
        <EmptyState
          compact
          illustration={<Floo mood="worried" size="s" animate={false} />}
          title="Geçmiş yüklenemedi"
          body="Bağlantını kontrol edip tekrar dene."
          action={{ label: "Tekrar dene", onPress: () => void history.refetch(), icon: "refresh" }}
        />
      ) : (
        <EmptyState compact illustration={<Floo mood="think" size="s" animate={false} />} title="Henüz kayıt yok" body="İlk antrenmanını bitirdiğinde burada görünecek." testID="no-history" />
      ),
    [history]
  );
  const contentStyle = useMemo(() => ({ paddingHorizontal: spacing.gutter, paddingBottom: tabSpace + spacing.lg }), [tabSpace]);

  return (
    <Screen scroll={false}>
      <List
        testID="history-list"
        data={rows}
        keyExtractor={keyOf}
        getItemType={typeOf}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        refreshControl={<ListRefreshControl refreshing={history.isRefetching && !history.isPending} onRefresh={() => void history.refetch()} />}
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
      />
      {/* Undo lives outside the list: a header that changes height re-triggers FlashList's layout pass. */}
      {pending ? <UndoBar message="Kayıt silindi" onUndo={undoDelete} bottom={tabSpace + spacing.md} /> : null}
      <LogDetailSheet sheetRef={logRef} log={openLog} muscles={muscles.data ?? NO_MUSCLES} onDelete={requestDelete} />
    </Screen>
  );
}

const keyOf = (row: Row) => row.key;
const typeOf = (row: Row) => row.kind;

const styles = StyleSheet.create({
  header: { gap: spacing.md, paddingBottom: spacing.sm },
  weekHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: spacing.md, paddingBottom: spacing.sm },
  rowWrap: { paddingBottom: spacing.sm },
});
