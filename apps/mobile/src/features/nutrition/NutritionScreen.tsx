import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import type { Meal, MealEntryDTO } from "@fitfloow/core";
import { Floo } from "../../mascot/Floo";
import { fmtDate } from "../../lib/format";
import { todayKey, trHour } from "../../lib/dates";
import { haptic } from "../../lib/haptics";
import { useTheme } from "../../theme/ThemeProvider";
import { spacing } from "../../theme/tokens";
import { Chip } from "../../ui/Chip";
import { EmptyState } from "../../ui/EmptyState";
import { Entry } from "../../ui/Entry";
import { Header } from "../../ui/Header";
import { Reveal } from "../../ui/Reveal";
import { Screen } from "../../ui/Screen";
import { Segmented } from "../../ui/Segmented";
import { useTabBarSpace } from "../../ui/TabBar";
import { useToast } from "../../ui/Toast";
import { CalorieHero } from "./components/CalorieHero";
import { DayPager } from "./components/DayPager";
import { Fab } from "./components/Fab";
import { EntryRow, MealAddRow, MealEmptyRow, MealHeaderRow } from "./components/MealRows";
import { UndoBar } from "./components/UndoBar";
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

const UNDO_MS = 5000;

type SheetState =
  | null
  | { kind: "add"; meal: Meal }
  | { kind: "search"; meal: Meal; start: "search" | "recent" | "manual" }
  | { kind: "barcode"; meal: Meal }
  | { kind: "grams"; entry: MealEntryDTO }
  | { kind: "target" };

/** Beslenme tab: the day log (pager, ring, meals) and the week summary. */
export function NutritionScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const tabSpace = useTabBarSpace();

  const [tab, setTab] = useState<"day" | "week">("day");
  const [dateKey, setDateKey] = useState(() => todayKey());
  const [sheet, setSheet] = useState<SheetState>(null);
  const [undo, setUndo] = useState<MealEntryDTO | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const day = useNutritionDay(dateKey);
  const week = useNutritionWeek(dateKey);
  const target = useNutritionTarget();
  const days = useDayRange(dateKey);
  const today = todayKey();

  const addEntry = useAddEntry(dateKey);
  const updateEntry = useUpdateEntry(dateKey);
  const deleteEntry = useDeleteEntry(dateKey);
  const setTarget = useSetTarget();

  const loggedKeys = useMemo(() => new Set((week.data?.days ?? []).filter((d) => d.logged).map((d) => d.dateKey)), [week.data]);
  const rows = useMemo(() => buildDayRows(day.data), [day.data]);
  const defaultMeal = useMemo(() => mealForHour(trHour()), []);

  useEffect(() => () => void (undoTimer.current && clearTimeout(undoTimer.current)), []);

  const closeSheet = useCallback(() => setSheet(null), []);
  const refresh = useCallback(() => {
    void day.refetch();
    void week.refetch();
  }, [day, week]);

  const openAdd = useCallback((meal: Meal) => setSheet({ kind: "add", meal }), []);

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
      addEntry.mutate(
        { meal: input.meal, grams: input.grams, food: input.food, custom: input.custom },
        { onSuccess: () => toast.show({ message: `${name} eklendi`, kind: "success" }) }
      );
    },
    [addEntry, toast]
  );

  const onEditEntry = useCallback((entry: MealEntryDTO) => setSheet({ kind: "grams", entry }), []);

  const clearUndo = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    setUndo(null);
  }, []);

  const onDeleteEntry = useCallback(
    (entry: MealEntryDTO) => {
      setSheet(null);
      deleteEntry.mutate(entry.id);
      setUndo(entry);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
    },
    [deleteEntry]
  );

  const onUndoDelete = useCallback(() => {
    const entry = undo;
    clearUndo();
    if (!entry) return;
    void haptic.success();
    addEntry.mutate({
      meal: entry.meal,
      grams: entry.grams,
      foodId: entry.foodId,
      custom: { name: entry.name, per100g: entry.per100g },
      source: entry.source,
      scanId: entry.scanId,
    });
  }, [addEntry, clearUndo, undo]);

  const renderItem = useCallback(
    ({ item }: { item: DayRow }) => {
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

  if (day.isError && !day.data) {
    return (
      <Screen>
        <Header title="Beslenme" />
        <EmptyState
          illustration={<Floo mood="worried" size="m" />}
          title="Bugünü getiremedim"
          body="Bağlantını kontrol edip tekrar dene."
          action={{ label: "Tekrar dene", onPress: refresh, icon: "refresh" }}
        />
      </Screen>
    );
  }

  const listHeader = day.data ? (
    <Entry index={0}>
      <CalorieHero day={day.data} onPressTarget={() => setSheet({ kind: "target" })} />
      <View style={styles.heroGap} />
    </Entry>
  ) : null;

  return (
    <Screen scroll={false} testID="nutrition-screen">
      <View style={styles.head}>
        <Header title="Beslenme" subtitle={fmtDate(dateKey, "weekday")} right={{ icon: "options-outline", label: "Hedef", onPress: () => setSheet({ kind: "target" }), testID: "open-target" }} />
        <View style={styles.tabs}>
          <Segmented
            testID="nutrition-tabs"
            style={styles.grow}
            options={[
              { value: "day", label: "Gün" },
              { value: "week", label: "Hafta" },
            ]}
            value={tab}
            onChange={setTab}
          />
          {dateKey !== today ? <Chip testID="jump-today" label="Bugün" tone="primary" icon="today-outline" onPress={() => setDateKey(today)} /> : null}
        </View>
        {tab === "day" ? <DayPager days={days} selected={dateKey} onSelect={setDateKey} loggedKeys={loggedKeys} /> : null}
      </View>

      {tab === "day" ? (
        <Reveal style={styles.grow} ready={Boolean(day.data)} skeleton={<View style={styles.skeletonPad}>{<NutritionSkeleton />}</View>}>
          <FlashList
            testID="nutrition-day-list"
            data={rows}
            keyExtractor={(r) => r.key}
            getItemType={(r) => r.kind}
            renderItem={renderItem}
            ListHeaderComponent={listHeader}
            contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: tabSpace + spacing.huge }}
            refreshControl={<RefreshControl refreshing={day.isRefetching && !day.isPending} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
          />
        </Reveal>
      ) : (
        <ScrollView
          testID="nutrition-week-scroll"
          contentContainerStyle={[styles.weekContent, { paddingBottom: tabSpace + spacing.huge }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={week.isRefetching && !week.isPending} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
        >
          <Reveal ready={Boolean(week.data)} skeleton={<WeekSkeleton />}>{week.data ? <WeekView week={week.data} /> : null}</Reveal>
        </ScrollView>
      )}

      {tab === "day" ? <Fab onPress={() => openAdd(defaultMeal)} bottom={tabSpace + spacing.md} /> : null}
      {undo ? <UndoBar message={`${undo.name} silindi`} onUndo={onUndoDelete} bottom={tabSpace + spacing.md} /> : null}

      {sheet?.kind === "add" ? <AddSheet meal={sheet.meal} onPick={onPickAction} onClose={closeSheet} /> : null}
      {sheet?.kind === "search" ? <SearchSheet meal={sheet.meal} start={sheet.start} onAdd={onAddFood} onClose={closeSheet} adding={addEntry.isPending} /> : null}
      {sheet?.kind === "barcode" ? (
        <BarcodeScanner
          meal={sheet.meal}
          adding={addEntry.isPending}
          onAdd={(input) => onAddFood(input)}
          onManual={() => setSheet({ kind: "search", meal: sheet.meal, start: "manual" })}
          onClose={closeSheet}
        />
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

const styles = StyleSheet.create({
  head: { paddingHorizontal: spacing.gutter, gap: spacing.md, paddingBottom: spacing.sm },
  tabs: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
  heroGap: { height: spacing.lg },
  skeletonPad: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg },
  weekContent: { paddingHorizontal: spacing.gutter, paddingTop: spacing.lg },
});
