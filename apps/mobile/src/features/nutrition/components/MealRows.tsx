import React, { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import type { Meal, MealEntryDTO, Totals } from "@fitfloow/core";
import { fmtGrams, fmtInt } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { MEAL_ICON, MEAL_LABEL } from "../model/meals";
import { SwipeToDelete } from "./SwipeToDelete";

export const ROW_HEIGHTS = { header: 56, entry: 60, empty: 52, add: 56 } as const;

/** Section head: meal name, its kcal, and a rounded top edge for the section "card". */
export function MealHeaderRow({ meal, totals, count }: { meal: Meal; totals: Totals; count: number }) {
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
}

export function MealEmptyRow({ meal }: { meal: Meal }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, styles.empty, { backgroundColor: colors.surface }]}>
      <Text variant="body" color="inkSubtle">
        {meal === "snack" ? "Ara öğün yok" : "Henüz bir şey eklemedin"}
      </Text>
    </View>
  );
}

export function MealAddRow({ meal, onPress }: { meal: Meal; onPress: (meal: Meal) => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={`meal-add-${meal}`}
      onPress={() => onPress(meal)}
      accessibilityLabel={`${MEAL_LABEL[meal]} öğününe ekle`}
      minTarget={false}
      style={[styles.section, styles.add, styles.bottom, { backgroundColor: colors.surface, borderTopColor: colors.border }]}
    >
      <Icon name="add-circle-outline" size={18} color="primary" />
      <Text variant="label" color="primary">
        Ekle
      </Text>
    </Pressable>
  );
}

export interface EntryRowProps {
  entry: MealEntryDTO;
  onPress: (entry: MealEntryDTO) => void;
  onDelete: (entry: MealEntryDTO) => void;
}

/** One logged food: tap to edit grams, swipe left to delete (with undo in the day screen). */
export function EntryRow({ entry, onPress, onDelete }: EntryRowProps) {
  const { colors } = useTheme();
  const remove = useCallback(() => onDelete(entry), [entry, onDelete]);

  return (
    <SwipeToDelete onDelete={remove}>
      <Pressable
        testID={`entry-${entry.id}`}
        onPress={() => onPress(entry)}
        minTarget={false}
        accessibilityLabel={`${entry.name}, ${fmtGrams(entry.grams)}, ${fmtInt(entry.totals.kcal)} kilokalori. Düzenlemek için dokun.`}
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
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  top: { minHeight: ROW_HEIGHTS.header, borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card, paddingTop: spacing.xs },
  bottom: { borderBottomLeftRadius: radii.card, borderBottomRightRadius: radii.card, marginBottom: spacing.lg },
  entry: { minHeight: ROW_HEIGHTS.entry, gap: spacing.xs },
  empty: { minHeight: ROW_HEIGHTS.empty },
  add: { minHeight: ROW_HEIGHTS.add, borderTopWidth: StyleSheet.hairlineWidth },
  iconBubble: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1 },
});
