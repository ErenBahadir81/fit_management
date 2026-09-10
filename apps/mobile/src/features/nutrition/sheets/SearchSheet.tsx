import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, type ScrollViewProps } from "react-native";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import type { FoodDTO, Meal, Per100g } from "@fitfloow/core";
import { fmtInt } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Chip } from "../../../ui/Chip";
import { EmptyState } from "../../../ui/EmptyState";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Sheet, useSheet } from "../../../ui/Sheet";
import { Skeleton } from "../../../ui/Skeleton";
import { Text } from "../../../ui/Text";
import { useFoodSearch, useRecentFoods } from "../useNutrition";
import { CustomFoodForm } from "./CustomFoodForm";
import { FoodDetail } from "./FoodDetail";

const LIST_HEIGHT = 320;

/** gorhom's scrollable, so the list and the sheet's pan gesture cooperate (its props are stricter). */
const SheetScroll = BottomSheetScrollView as unknown as React.ComponentType<ScrollViewProps>;

export interface SearchAddInput {
  food?: FoodDTO | null;
  custom?: { name: string; per100g: Per100g } | null;
  grams: number;
  meal: Meal;
}

export interface SearchSheetProps {
  meal: Meal;
  /** "search" opens the field, "recent" opens on the recents list, "manual" straight to the form. */
  start?: "search" | "recent" | "manual";
  onAdd: (input: SearchAddInput) => void;
  onClose: () => void;
  adding?: boolean;
}

type Mode = { kind: "list" } | { kind: "detail"; food: FoodDTO } | { kind: "custom" } | { kind: "customDetail"; name: string; per100g: Per100g };

/** Search / recents / custom food, all in one sheet with a back step to the list. */
export function SearchSheet({ meal: initialMeal, start = "search", onAdd, onClose, adding }: SearchSheetProps) {
  const sheet = useSheet();
  const { colors } = useTheme();
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [text, setText] = useState("");
  const [remote, setRemote] = useState(false);
  const [mode, setMode] = useState<Mode>(start === "manual" ? { kind: "custom" } : { kind: "list" });

  useEffect(() => sheet.present(), [sheet]);

  const search = useFoodSearch(text, { remote });
  const recents = useRecentFoods();
  const showRecents = search.query.length < 2;
  const items = showRecents ? recents.data ?? [] : [...search.foods, ...search.remote];

  const openDetail = useCallback((food: FoodDTO) => setMode({ kind: "detail", food }), []);
  const quickAdd = useCallback((food: FoodDTO, grams: number) => onAdd({ food, grams, meal }), [meal, onAdd]);

  const listEmpty = useMemo(() => {
    if (showRecents) {
      return recents.isPending ? <ResultsSkeleton /> : <EmptyState compact icon="time-outline" title="Henüz kayıt yok" body="Aramaya başla, sık yediklerin burada birikecek." />;
    }
    if (search.isPending) return <ResultsSkeleton />;
    return (
      <EmptyState
        compact
        icon="search"
        title="Bulamadım"
        body={remote ? "Bu adla bir şey çıkmadı. Elle girebilirsin." : "İnternette de arayabilir ya da elle girebilirsin."}
        action={remote ? { label: "Elle gir", onPress: () => setMode({ kind: "custom" }), icon: "create-outline" } : { label: "İnternette ara", onPress: () => setRemote(true), icon: "globe-outline" }}
      />
    );
  }, [recents.isPending, remote, search.isPending, showRecents]);

  return (
    <Sheet ref={sheet.ref} onDismiss={onClose}>
      {mode.kind === "detail" ? (
        <FoodDetail
          testID="search-detail"
          name={mode.food.name}
          brand={mode.food.brand ?? null}
          per100g={mode.food.per100g}
          servings={mode.food.servings}
          initialGrams={mode.food.defaultServingG}
          meal={meal}
          onMealChange={setMeal}
          onAdd={(grams) => onAdd({ food: mode.food, grams, meal })}
          onBack={() => setMode({ kind: "list" })}
          adding={adding}
        />
      ) : mode.kind === "customDetail" ? (
        <FoodDetail
          testID="custom-detail"
          name={mode.name}
          per100g={mode.per100g}
          initialGrams={100}
          meal={meal}
          onMealChange={setMeal}
          onAdd={(grams) => onAdd({ custom: { name: mode.name, per100g: mode.per100g }, grams, meal })}
          onBack={() => setMode({ kind: "custom" })}
          adding={adding}
        />
      ) : mode.kind === "custom" ? (
        <CustomFoodForm onBack={start === "manual" ? undefined : () => setMode({ kind: "list" })} onContinue={(name, per100g) => setMode({ kind: "customDetail", name, per100g })} />
      ) : (
        <View style={styles.stack}>
          <View style={[styles.field, { backgroundColor: colors.surfaceMuted }]}>
            <Icon name="search" size={18} color="inkSubtle" />
            <BottomSheetTextInput
              testID="food-search-input"
              value={text}
              onChangeText={setText}
              placeholder="Yemek ara (ör. tavuk)"
              placeholderTextColor={colors.inkSubtle}
              autoCorrect={false}
              autoFocus={start === "search"}
              returnKeyType="search"
              accessibilityLabel="Yemek ara"
              style={[styles.input, { color: colors.ink }]}
            />
            {text.length > 0 ? (
              <Pressable testID="food-search-clear" onPress={() => setText("")} haptic="select" minTarget={false} accessibilityLabel="Temizle" style={styles.clear}>
                <Icon name="close-circle" size={18} color="inkSubtle" />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.row}>
            <Text variant="label" color="inkMuted" style={styles.grow}>
              {showRecents ? "Son kullanılanlar" : `“${search.query}” için sonuçlar`}
            </Text>
            <Chip testID="remote-toggle" label="İnternette ara" size="sm" icon="globe-outline" selected={remote} onPress={() => setRemote((v) => !v)} />
          </View>

          <View style={styles.list}>
            <FlashList
              testID="food-results"
              data={items}
              renderScrollComponent={SheetScroll}
              keyExtractor={(f) => f.id}
              extraData={meal}
              renderItem={({ item }) => <FoodRow food={item} onPress={openDetail} onQuickAdd={quickAdd} />}
              ListEmptyComponent={listEmpty}
              keyboardShouldPersistTaps="handled"
            />
          </View>

          <Pressable testID="open-custom-food" onPress={() => setMode({ kind: "custom" })} haptic="select" style={styles.manual}>
            <Icon name="create-outline" size={18} color="primary" />
            <Text variant="label" color="primary">
              Listede yok, elle gir
            </Text>
          </Pressable>
        </View>
      )}
    </Sheet>
  );
}

function FoodRow({ food, onPress, onQuickAdd }: { food: FoodDTO; onPress: (f: FoodDTO) => void; onQuickAdd: (f: FoodDTO, grams: number) => void }) {
  const servings = (food.servings ?? []).slice(0, 2);
  return (
    <Pressable
      testID={`food-${food.id}`}
      onPress={() => onPress(food)}
      minTarget={false}
      accessibilityLabel={`${food.name}, 100 gramda ${fmtInt(food.per100g.kcal)} kilokalori`}
      style={styles.foodRow}
    >
      <View style={styles.grow}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {food.name}
        </Text>
        <Text variant="caption" color="inkMuted" tabular>
          {food.brand ? `${food.brand} · ` : ""}
          {fmtInt(food.per100g.kcal)} kcal / 100 g
        </Text>
        {servings.length > 0 ? (
          <View style={styles.servingChips}>
            {servings.map((s) => (
              <Chip
                key={`${food.id}-${s.label}`}
                testID={`quick-${food.id}-${s.grams}`}
                label={`${s.label} · ${fmtInt(s.grams)} g`}
                size="sm"
                tone="primary"
                onPress={() => onQuickAdd(food, s.grams)}
              />
            ))}
          </View>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={18} color="inkSubtle" />
    </Pressable>
  );
}

function ResultsSkeleton() {
  return (
    <View style={styles.skeleton} testID="food-results-skeleton">
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton width={`${50 + i * 8}%`} height={14} />
          <Skeleton width="35%" height={10} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  field: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radii.control, minHeight: 48 },
  input: { flex: 1, fontSize: 15, paddingVertical: spacing.md },
  clear: { padding: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
  list: { height: LIST_HEIGHT },
  foodRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, minHeight: 60 },
  servingChips: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  manual: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  skeleton: { gap: spacing.lg, paddingTop: spacing.sm },
  skeletonRow: { gap: spacing.sm },
});
