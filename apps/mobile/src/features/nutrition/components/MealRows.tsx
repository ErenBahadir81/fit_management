import React, { memo, useCallback } from "react";
import { StyleSheet, View } from "react-native";
import type { Meal, MealEntryDTO, Totals } from "@fitfloow/core";
import { fmtGrams, fmtInt } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { SwipeToDelete } from "../../../ui/SwipeToDelete";
import { Text } from "../../../ui/Text";
import { MEAL_ICON, MEAL_LABEL } from "../model/meals";

export const ROW_HEIGHTS = { header: 56, entry: 60, empty: 52, add: 56 } as const;

/** Section head: meal name, its kcal, and a rounded top edge for the section "card". */
export const MealHeaderRow = memo(function MealHeaderRow({ meal, totals, count }: { meal: Meal; totals: Totals; count: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, styles.top, { backgroundColor: colors.surface }]}>
      <View style={[styles.iconBubble, { backgroundColor: colors.primarySoft }]}>
        <Icon name={MEAL_ICON[meal]} size={16} color="primary" />
      </View>
      <Text variant="title" style={styles.grow}>
        {MEAL_LABEL[meal]}
      </Text>
      {count > 0 ? (
        <Text variant="label" color="inkMuted" tabular>
          {fmtInt(totals.kcal)} kcal
        </Text>
      ) : null}
    </View>
  );
});

/**
 * An empty meal. When the same meal had food yesterday, one tap logs it again ("Dünkü gibi"):
 * the fastest add there is, since most breakfasts are yesterday's breakfast.
 */
export const MealEmptyRow = memo(function MealEmptyRow({ meal, repeat = [], onRepeat }: { meal: Meal; repeat?: MealEntryDTO[]; onRepeat?: (meal: Meal, entries: MealEntryDTO[]) => void }) {
  const { colors } = useTheme();
  const press = useCallback(() => onRepeat?.(meal, repeat), [meal, onRepeat, repeat]);
  if (repeat.length > 0 && onRepeat) {
    const kcal = repeat.reduce((sum, e) => sum + e.totals.kcal, 0);
    const names = repeat.map((e) => e.name).join(", ");
    return (
      <View style={[styles.section, styles.empty, styles.repeatRow, { backgroundColor: colors.surface }]}>
        <Pressable
          testID={`meal-repeat-${meal}`}
          onPress={press}
          accessibilityLabel={`Dünkü ${MEAL_LABEL[meal].toLocaleLowerCase("tr")} öğününü tekrar ekle: ${names}, ${fmtInt(kcal)} kcal`}
          style={[styles.repeat, { backgroundColor: colors.primarySoft }]}
        >
          <Icon icon="refresh" size={16} color="primary" />
          <Text variant="label" color="primary" numberOfLines={1} style={styles.shrink}>
            Dünkü gibi
          </Text>
          <Text variant="caption" color="inkMuted" numberOfLines={1} style={styles.shrink}>
            {`${repeat.length} yiyecek · ${fmtInt(kcal)} kcal`}
          </Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={[styles.section, styles.empty, { backgroundColor: colors.surface }]}>
      <Text variant="body" color="inkSubtle">
        {meal === "snack" ? "Ara öğün yok" : "Henüz bir şey eklemedin"}
      </Text>
    </View>
  );
});

export const MealAddRow = memo(function MealAddRow({ meal, onPress }: { meal: Meal; onPress: (meal: Meal) => void }) {
  const { colors } = useTheme();
  const press = useCallback(() => onPress(meal), [meal, onPress]);
  return (
    <Pressable
      testID={`meal-add-${meal}`}
      onPress={press}
      accessibilityLabel={`${MEAL_LABEL[meal]} öğününe ekle`}
      minTarget={false}
      style={[styles.section, styles.add, styles.bottom, { backgroundColor: colors.surface, borderTopColor: colors.border }]}
    >
      <Icon icon="add" size={18} color="primary" />
      <Text variant="label" color="primary">
        Ekle
      </Text>
    </Pressable>
  );
});

export interface EntryRowProps {
  entry: MealEntryDTO;
  onPress: (entry: MealEntryDTO) => void;
  onDelete: (entry: MealEntryDTO) => void;
}

/** One logged food: tap to edit grams, swipe left to delete (with undo in the day screen). */
export const EntryRow = memo(function EntryRow({ entry, onPress, onDelete }: EntryRowProps) {
  const { colors } = useTheme();
  const remove = useCallback(() => onDelete(entry), [entry, onDelete]);
  const open = useCallback(() => onPress(entry), [entry, onPress]);

  return (
    <SwipeToDelete onDelete={remove} deleteTestID={`entry-delete-${entry.id}`} deleteLabel={`${entry.name} kaydını sil`} radius={0}>
      <Pressable
        testID={`entry-${entry.id}`}
        onPress={open}
        minTarget={false}
        accessibilityLabel={`${entry.name}, ${fmtGrams(entry.grams)}, ${fmtInt(entry.totals.kcal)} kilokalori. Düzenlemek için dokun.`}
        accessibilityActions={[{ name: "delete", label: "Sil" }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "delete") remove();
        }}
        style={[styles.section, styles.entry, { backgroundColor: colors.surface }]}
      >
        <View style={styles.grow}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {entry.name}
          </Text>
          <Text variant="caption" color="inkMuted" tabular>
            {fmtGrams(entry.grams)} · P {fmtInt(entry.totals.protein)} · K {fmtInt(entry.totals.carbs)} · Y {fmtInt(entry.totals.fat)}
          </Text>
        </View>
        <Text variant="bodyStrong" tabular>
          {fmtInt(entry.totals.kcal)}
        </Text>
        <Text variant="caption" color="inkSubtle">
          kcal
        </Text>
      </Pressable>
    </SwipeToDelete>
  );
});

const styles = StyleSheet.create({
  repeatRow: { alignItems: "flex-start" },
  repeat: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radii.pill, maxWidth: "100%" },
  shrink: { flexShrink: 1 },
  section: { paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  top: { minHeight: ROW_HEIGHTS.header, borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card, paddingTop: spacing.xs },
  bottom: { borderBottomLeftRadius: radii.card, borderBottomRightRadius: radii.card, marginBottom: spacing.lg },
  entry: { minHeight: ROW_HEIGHTS.entry, gap: spacing.xs },
  empty: { minHeight: ROW_HEIGHTS.empty },
  add: { minHeight: ROW_HEIGHTS.add, borderTopWidth: StyleSheet.hairlineWidth },
  iconBubble: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1 },
});
