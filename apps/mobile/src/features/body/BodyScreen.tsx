import React, { useCallback, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { List, type ListRenderItem } from "../../ui/List";
import { useRouter } from "expo-router";
import type { BodyEntryDTO, BodySummary, GoalView, WeeklyReportDTO } from "@fitfloow/core";
import { useUndoWindow } from "../../lib/useUndoWindow";
import { Floo } from "../../mascot/Floo";
import { spacing } from "../../theme/tokens";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { Entry } from "../../ui/Entry";
import { Header } from "../../ui/Header";
import { ListRefreshControl } from "../../ui/ListRefreshControl";
import { Reveal } from "../../ui/Reveal";
import { Screen } from "../../ui/Screen";
import { useSheet } from "../../ui/Sheet";
import { useTabBarSpace } from "../../ui/TabBar";
import { Text } from "../../ui/Text";
import { useToast } from "../../ui/Toast";
import { UndoBar } from "../../ui/UndoBar";
import { useSession } from "../auth/session";
import { useGoalView } from "../goals/useGoal";
import { CURRENT_WEEK, useWeeklyReport } from "../reports/useReport";
import { weighInDefault } from "./bodyMath";
import { BodySkeleton } from "./BodySkeleton";
import { BodyHero } from "./components/BodyHero";
import { GoalLinkCard, ReportLinkCard } from "./components/BodyLinks";
import { MeasureSheet } from "./components/MeasureSheet";
import { MeasurementRow } from "./components/MeasurementRow";
import { QuickWeighIn } from "./components/QuickWeighIn";
import { TrendsCard } from "./components/TrendsCard";
import { useBodyEntries, useBodySummary, useBodyTrends, useDeleteBodyEntry, type BodyEntriesView } from "./useBody";

interface Row {
  entry: BodyEntryDTO;
  prev: BodyEntryDTO | null;
}

/**
 * Body tab: hero (trend weight, bf %), one-tap weigh-in, trends chart, goal/report entry points and
 * the measurement history as one FlashList (header = cards). Cache-first; skeleton only when cold.
 */
export function BodyScreen() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const summaryQ = useBodySummary();
  const entriesQ = useBodyEntries();
  const trendsQ = useBodyTrends(90);
  const goalQ = useGoalView();
  const reportQ = useWeeklyReport(CURRENT_WEEK);
  const del = useDeleteBodyEntry();
  const toast = useToast();
  const { ref: measureRef, present: openMeasure } = useSheet();
  const tabSpace = useTabBarSpace();

  /* --- undoable delete: the row leaves at once, the DELETE fires after the undo window --- */
  const commitDelete = useCallback((entry: BodyEntryDTO) => del.mutate(entry.id), [del]);
  const undoWindow = useUndoWindow<BodyEntryDTO>(commitDelete);
  const pendingDelete = undoWindow.pending;
  const onDelete = useCallback((id: string) => {
    const entry = entriesQ.data?.entries.find((e) => e.id === id);
    if (entry) undoWindow.request(entry);
  }, [entriesQ.data, undoWindow]);
  const undoDelete = useCallback(() => {
    if (undoWindow.undo()) toast.show({ message: "Ölçüm geri getirildi", kind: "success" });
  }, [toast, undoWindow]);

  const rows = useMemo<Row[]>(() => {
    const list = [...(entriesQ.data?.entries ?? [])].filter((e) => e.id !== pendingDelete?.id).sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
    return list.map((entry, i) => ({ entry, prev: list[i + 1] ?? null }));
  }, [entriesQ.data, pendingDelete]);

  const onRefresh = useCallback(() => {
    void summaryQ.refetch();
    void entriesQ.refetch();
    void trendsQ.refetch();
    void goalQ.refetch();
    void reportQ.refetch();
  }, [summaryQ, entriesQ, trendsQ, goalQ, reportQ]);
  const goGoal = useCallback(() => router.push(goalQ.data?.goal?.status === "active" ? "/(modals)/goal/roadmap" : "/(modals)/goal/setup"), [router, goalQ.data]);
  const goReport = useCallback(() => router.push("/(modals)/report/current"), [router]);
  const renderItem = useCallback<ListRenderItem<Row>>(({ item }) => <MeasurementRow entry={item.entry} prev={item.prev} onDelete={onDelete} />, [onDelete]);
  const contentStyle = useMemo(() => ({ paddingHorizontal: spacing.gutter, paddingBottom: tabSpace + spacing.md }), [tabSpace]);

  if (summaryQ.isError && !summaryQ.data) {
    return (
      <Screen>
        <Header title="Vücut" />
        <EmptyState
          illustration={<Floo mood="worried" size="m" />}
          title="Bir şeyler ters gitti"
          body="Ölçümler yüklenemedi. Bağlantını kontrol edip tekrar dene."
          action={{ label: "Tekrar dene", onPress: () => void summaryQ.refetch(), icon: "refresh" }}
        />
      </Screen>
    );
  }

  const summary = summaryQ.data;
  const profile = { gender: summary?.profile.gender ?? user?.gender ?? "male", heightCm: summary?.profile.heightCm ?? user?.heightCm ?? null };
  const latest = summary?.latest ?? null;

  return (
    <Screen scroll={false}>
      <Reveal grow ready={Boolean(summary)} skeleton={<BodySkeleton />} style={styles.flex}>
        {summary ? (
          <List<Row>
            data={rows}
            keyExtractor={keyOf}
            renderItem={renderItem}
            ListHeaderComponent={<BodyHeader summary={summary} trendsData={trendsQ.data} goal={goalQ.data} report={reportQ.data} entries={entriesQ.data} rowCount={rows.length} onAdd={openMeasure} onGoal={goGoal} onReport={goReport} />}
            ListEmptyComponent={
              entriesQ.data ? (
                <EmptyState compact illustration={<Floo mood="sleepy" size="s" />} title="Henüz ölçüm yok" body="Boyun ve bel ölçüsüyle yağ oranını hesaplayalım." action={{ label: "Ölçüm ekle", onPress: openMeasure, icon: "add" }} />
              ) : null
            }
            contentContainerStyle={contentStyle}
            refreshControl={<ListRefreshControl refreshing={summaryQ.isRefetching && !summaryQ.isPending} onRefresh={onRefresh} />}
            showsVerticalScrollIndicator={false}
            testID="body-list"
          />
        ) : null}
      </Reveal>
      {pendingDelete ? <UndoBar message="Ölçüm silindi" onUndo={undoDelete} bottom={tabSpace + spacing.md} testID="undo-bar" /> : null}
      <MeasureSheet ref={measureRef} profile={profile} defaults={{ weightKg: weighInDefault(summary), neckCm: latest?.neckCm ?? null, waistCm: latest?.waistCm ?? null, hipCm: latest?.hipCm ?? null }} />
    </Screen>
  );
}

interface BodyHeaderProps {
  summary: BodySummary;
  trendsData: ReturnType<typeof useBodyTrends>["data"];
  goal: GoalView | undefined;
  report: WeeklyReportDTO | undefined;
  entries: BodyEntriesView | undefined;
  rowCount: number;
  onAdd: () => void;
  onGoal: () => void;
  onReport: () => void;
}

function BodyHeader({ summary, trendsData, goal, report, entries, rowCount, onAdd, onGoal, onReport }: BodyHeaderProps) {
  const goalWeight = goal?.goal?.status === "active" ? goal.goal.plan.targetWeightKg : null;
  return (
    <View style={styles.stack}>
      <Header title="Vücut" />
      <Entry index={0}>
        <BodyHero summary={summary} trends={trendsData} />
      </Entry>
      <Entry index={1}>
        <QuickWeighIn summary={summary} />
      </Entry>
      <Entry index={2}>
        <TrendsCard goalWeightKg={goalWeight} />
      </Entry>
      <Entry index={3}>
        <View style={styles.links}>
          <GoalLinkCard view={goal} onPress={onGoal} />
          <ReportLinkCard report={report} onPress={onReport} />
        </View>
      </Entry>
      <Entry index={4}>
        <View style={styles.sectionHead}>
          <View>
            <Text variant="title">Ölçümler</Text>
            <Text variant="caption" color="inkMuted">
              {entries ? `${rowCount} kayıt · sola kaydırıp silebilirsin` : " "}
            </Text>
          </View>
          <Button label="Ölçüm ekle" variant="secondary" size="sm" icon="add" onPress={onAdd} testID="measure-open" />
        </View>
      </Entry>
    </View>
  );
}

const keyOf = (r: Row) => r.entry.id;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: spacing.lg, paddingBottom: spacing.xs },
  links: { flexDirection: "row", gap: spacing.md },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
});
