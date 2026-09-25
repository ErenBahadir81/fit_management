import React, { memo, useCallback } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import type { FoodDTO, Meal } from "@fitfloow/core";
import { fmtInt } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { MEAL_LABEL } from "../model/meals";
import { useRecentFoods } from "../useNutrition";

const MAX = 8;

export interface QuickAddBarProps {
  /** Where a tap lands: the meal of the current hour. */
  meal: Meal;
  onAdd: (food: FoodDTO, meal: Meal) => void;
  testID?: string;
}

/**
 * "Son yenenler" as one row of chips: a tap logs one usual serving into the meal of the hour.
 * No sheet, no grams step; a wrong amount is one tap away on the entry itself.
 * Renders nothing until there is something recent to offer.
 */
export function QuickAddBar({ meal, onAdd, testID = "quick-add" }: QuickAddBarProps) {
  const q = useRecentFoods();
  const foods = (q.data ?? []).slice(0, MAX);
  if (foods.length === 0) return null;
  return (
    <View style={styles.wrap} testID={testID}>
      <Text variant="label" color="inkMuted" style={styles.title}>
        {`Hızlı ekle · ${MEAL_LABEL[meal]}`}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {foods.map((f) => (
          <QuickChip key={f.id} food={f} meal={meal} onAdd={onAdd} testID={`${testID}-${f.id}`} />
        ))}
      </ScrollView>
    </View>
  );
}

const QuickChip = memo(function QuickChip({ food, meal, onAdd, testID }: { food: FoodDTO; meal: Meal; onAdd: (food: FoodDTO, meal: Meal) => void; testID: string }) {
  const { colors } = useTheme();
  const press = useCallback(() => onAdd(food, meal), [food, meal, onAdd]);
  const kcal = (food.per100g.kcal * food.defaultServingG) / 100;
  return (
    <Pressable
      testID={testID}
      onPress={press}
      accessibilityLabel={`${food.name}, ${fmtInt(food.defaultServingG)} gram, ${fmtInt(kcal)} kcal, ${MEAL_LABEL[meal]} öğününe ekle`}
      style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Icon icon="add" size={16} color="primary" />
      <View>
        <Text variant="label" numberOfLines={1} style={styles.name}>
          {food.name}
        </Text>
        <Text variant="caption" color="inkMuted" tabular>
          {`${fmtInt(food.defaultServingG)} g · ${fmtInt(kcal)} kcal`}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.lg },
  title: { paddingHorizontal: spacing.xs },
  row: { gap: spacing.sm, paddingRight: spacing.gutter },
  chip: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  name: { maxWidth: 160 },
});
