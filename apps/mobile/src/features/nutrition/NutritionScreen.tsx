import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { List, type ListRenderItem } from "../../ui/List";
import { useRouter } from "expo-router";
import type { Meal, MealEntryDTO } from "@fitfloow/core";
import { Floo } from "../../mascot/Floo";
import { fmtDate } from "../../lib/format";
import { todayKey, trHour } from "../../lib/dates";
import { haptic } from "../../lib/haptics";
import { useUndoWindow } from "../../lib/useUndoWindow";
import { spacing } from "../../theme/tokens";
import { Chip } from "../../ui/Chip";
import { EmptyState } from "../../ui/EmptyState";
import { Entry } from "../../ui/Entry";
import { Header } from "../../ui/Header";
import { ListRefreshControl } from "../../ui/ListRefreshControl";
import { Reveal } from "../../ui/Reveal";
import { Screen } from "../../ui/Screen";
import { Segmented } from "../../ui/Segmented";
import { useTabBarSpace } from "../../ui/TabBar";
import { useToast } from "../../ui/Toast";
import { UndoBar } from "../../ui/UndoBar";
import { CalorieHero } from "./components/CalorieHero";
import { DayPager } from "./components/DayPager";
import { Fab, FAB_SIZE } from "./components/Fab";
import { EntryRow, MealAddRow, MealEmptyRow, MealHeaderRow } from "./components/MealRows";
import { buildDayRows, type DayRow } from "./components/dayRows";
import { NutritionSkeleton } from "./NutritionSkeleton";
import { WeekSkeleton, WeekView } from "./WeekView";
import { mealForHour } from "./model/meals";
import { AddSheet, type AddAction } from "./sheets/AddSheet";
import { BarcodeScanner } from "./sheets/BarcodeScanner";
import { GramsSheet } from "./sheets/GramsSheet";
import { SearchSheet, type SearchAddInput } from "./sheets/SearchSheet";
import { TargetSheet } from "./sheets/TargetSheet";
import { useAddEntry, useDayRange, useDeleteEntry, useNutritionDay, useNutritionTarget, useNutritionWeek, useSetTarget, useUpdateEntry } from "./useNutrition";

type SheetState =
  | null
  | { kind: "add"; meal: Meal }
  | { kind: "search"; meal: Meal; start: "search" | "recent" | "manual" }
  | { kind: "barcode"; meal: Meal }
  | { kind: "grams"; entry: MealEntryDTO }
  | { kind: "target" };

const TABS = [
  { value: "day" as const, label: "Gün" },
  { value: "week" as const, label: "Hafta" },
];

/** The delete already left optimistically; the undo window only remembers what to put back. */
const noCommit = () => {};

/** Beslenme tab: the day log (pager, ring, meals) and the week summary. */
export function NutritionScreen() {
  const router = useRouter();
  const toast = useToast();
  const tabSpace = useTabBarSpace();

  const [tab, setTab] = useState<"day" | "week">("day");
  const [dateKey, setDateKey] = useState(() => todayKey());
  const [sheet, setSheet] = useState<SheetState>(null);

  const day = useNutritionDay(dateKey);
  const week = useNutritionWeek(dateKey);
  const target = useNutritionTarget();
  const days = useDayRange(dateKey);
  const today = todayKey();

  const addEntry = useAddEntry(dateKey);
  const updateEntry = useUpdateEntry(dateKey);
  const deleteEntry = useDeleteEntry(dateKey);
  const setTarget = useSetTarget();
  const undoWindow = useUndoWindow<MealEntryDTO>(noCommit);

  const loggedKeys = useMemo(() => new Set((week.data?.days ?? []).filter((d) => d.logged).map((d) => d.dateKey)), [week.data]);
  const rows = useMemo(() => buildDayRows(day.data), [day.data]);
  const defaultMeal = useMemo(() => mealForHour(trHour()), []);

  const closeSheet = useCallback(() => setSheet(null), []);
  const refresh = useCallback(() => {
    void day.refetch();
    void week.refetch();
  }, [day, week]);

  const openAdd = useCallback((meal: Meal) => setSheet({ kind: "add", meal }), []);
  const openTarget = useCallback(() => setSheet({ kind: "target" }), []);
  const jumpToday = useCallback(() => setDateKey(today), [today]);

  const onPickAction = useCallback(
    (action: AddAction) => {
      const meal = sheet?.kind === "add" ? sheet.meal : defaultMeal;
      setSheet(null);
      if (action === "scan") {
        router.push({ pathname: "/(modals)/scan", params: { date: dateKey, meal } });
        return;
      }
      if (action === "barcode") setSheet({ kind: "barcode", meal });
      else setSheet({ kind: "search", meal, start: action === "recent" ? "recent" : action === "manual" ? "manual" : "search" });
    },
    [dateKey, defaultMeal, router, sheet]
  );

  const onAddFood = useCallback(
    (input: SearchAddInput) => {
      const name = input.food?.name ?? input.custom?.name ?? "Öğün";
      setSheet(null);
      addEntry.mutate({ meal: input.meal, grams: input.grams, food: input.food, custom: input.custom }, { onSuccess: () => toast.show({ message: `${name} eklendi`, kind: "success" }) });
    },
    [addEntry, toast]
  );

  const onEditEntry = useCallback((entry: MealEntryDTO) => setSheet({ kind: "grams", entry }), []);

  /* Delete leaves at once (optimistic); the undo bar re-adds the same food and grams. */
  const onDeleteEntry = useCallback(
    (entry: MealEntryDTO) => {
      setSheet(null);
      deleteEntry.mutate(entry.id);
      undoWindow.request(entry);
    },
    [deleteEntry, undoWindow]
  );
  const onUndoDelete = useCallback(() => {
    const entry = undoWindow.undo();
    if (!entry) return;
    void haptic.success();
    addEntry.mutate({ meal: entry.meal, grams: entry.grams, foodId: entry.foodId, custom: { name: entry.name, per100g: entry.per100g }, source: entry.source, scanId: entry.scanId });
  }, [addEntry, undoWindow]);

  const renderItem = useCallback<ListRenderItem<DayRow>>(
    ({ item }) => {
      switch (item.kind) {
        case "mealHeader":
          return <MealHeaderRow meal={item.meal} totals={item.totals} count={item.count} />;
        case "entry":
          return <EntryRow entry={item.entry} onPress={onEditEntry} onDelete={onDeleteEntry} />;
        case "empty":
          return <MealEmptyRow meal={item.meal} />;
        default:
          return <MealAddRow meal={item.meal} onPress={openAdd} />;
      }
    },
    [onDeleteEntry, onEditEntry, openAdd]
  );
  const listStyle = useMemo(() => ({ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: tabSpace + spacing.huge }), [tabSpace]);
  const weekStyle = useMemo(() => [styles.weekContent, { paddingBottom: tabSpace + spacing.huge }], [tabSpace]);
  const listHeader = useMemo(
    () =>
      day.data ? (
        <Entry index={0}>
          <CalorieHero day={day.data} onPressTarget={openTarget} />
          <View style={styles.heroGap} />
        </Entry>
      ) : null,
    [day.data, openTarget]
  );

  if (day.isError && !day.data) {
    return (
      <Screen>
        <Header title="Beslenme" />
        <EmptyState illustration={<Floo mood="worried" size="m" />} title="Bugünü getiremedim" body="Bağlantını kontrol edip tekrar dene." action={{ label: "Tekrar dene", onPress: refresh, icon: "refresh" }} />
      </Screen>
    );
  }

  const pending = undoWindow.pending;

  return (
    <Screen scroll={false} testID="nutrition-screen">
      <View style={styles.head}>
        <Header title="Beslenme" subtitle={fmtDate(dateKey, "weekday")} right={{ icon: "options-outline", label: "Hedef", onPress: openTarget, testID: "open-target" }} />
        <View style={styles.tabs}>
          <Segmented testID="nutrition-tabs" style={styles.grow} options={TABS} value={tab} onChange={setTab} />
          {dateKey !== today ? <Chip testID="jump-today" label="Bugün" tone="primary" icon="today-outline" onPress={jumpToday} /> : null}
        </View>
        {tab === "day" ? <DayPager days={days} selected={dateKey} onSelect={setDateKey} loggedKeys={loggedKeys} /> : null}
      </View>

      {tab === "day" ? (
        <Reveal
          grow
          style={styles.grow}
          ready={Boolean(day.data)}
          skeleton={
            <View style={styles.skeletonPad}>
              <NutritionSkeleton />
            </View>
          }
        >
          <List
            testID="nutrition-day-list"
            data={rows}
            keyExtractor={keyOf}
            getItemType={typeOf}
            renderItem={renderItem}
            ListHeaderComponent={listHeader}
            contentContainerStyle={listStyle}
            refreshControl={<ListRefreshControl refreshing={day.isRefetching && !day.isPending} onRefresh={refresh} />}
            showsVerticalScrollIndicator={false}
          />
        </Reveal>
      ) : (
        <ScrollView testID="nutrition-week-scroll" contentContainerStyle={weekStyle} showsVerticalScrollIndicator={false} refreshControl={<ListRefreshControl refreshing={week.isRefetching && !week.isPending} onRefresh={refresh} />}>
          <Reveal ready={Boolean(week.data)} skeleton={<WeekSkeleton />}>
            {week.data ? <WeekView week={week.data} /> : null}
          </Reveal>
        </ScrollView>
      )}

      {tab === "day" ? <Fab onPress={() => openAdd(defaultMeal)} bottom={tabSpace + spacing.md} /> : null}
      {pending ? <UndoBar message={`${pending.name} silindi`} onUndo={onUndoDelete} bottom={tabSpace + spacing.md + (tab === "day" ? FAB_SIZE + spacing.md : 0)} /> : null}

      {sheet?.kind === "add" ? <AddSheet meal={sheet.meal} onPick={onPickAction} onClose={closeSheet} /> : null}
      {sheet?.kind === "search" ? <SearchSheet meal={sheet.meal} start={sheet.start} onAdd={onAddFood} onClose={closeSheet} adding={addEntry.isPending} /> : null}
      {sheet?.kind === "barcode" ? (
        <BarcodeScanner meal={sheet.meal} adding={addEntry.isPending} onAdd={onAddFood} onManual={() => setSheet({ kind: "search", meal: sheet.meal, start: "manual" })} onClose={closeSheet} />
      ) : null}
      {sheet?.kind === "grams" ? (
        <GramsSheet
          entry={sheet.entry}
          saving={updateEntry.isPending}
          onSave={(patch) => {
            const id = sheet.entry.id;
            setSheet(null);
            updateEntry.mutate({ id, ...patch }, { onSuccess: () => void haptic.success() });
          }}
          onDelete={() => onDeleteEntry(sheet.entry)}
          onClose={closeSheet}
        />
      ) : null}
      {sheet?.kind === "target" && (target.data || day.data) ? (
        <TargetSheet
          target={target.data ?? day.data!.target}
          saving={setTarget.isPending}
          onSave={(input) => {
            setSheet(null);
            setTarget.mutate(input, { onSuccess: () => toast.show({ message: "Hedef güncellendi", kind: "success" }) });
          }}
          onClose={closeSheet}
        />
      ) : null}
    </Screen>
  );
}

const keyOf = (r: DayRow) => r.key;
const typeOf = (r: DayRow) => r.kind;

const styles = StyleSheet.create({
  head: { paddingHorizontal: spacing.gutter, gap: spacing.md, paddingBottom: spacing.sm },
  tabs: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
  heroGap: { height: spacing.lg },
  skeletonPad: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg },
  weekContent: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg },
});
