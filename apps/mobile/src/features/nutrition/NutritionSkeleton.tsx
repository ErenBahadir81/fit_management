import React from "react";
import { StyleSheet, View } from "react-native";
import { radii, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { Skeleton, SkeletonGroup } from "../../ui/Skeleton";
import { HERO_HEIGHT } from "./components/CalorieHero";
import { ROW_HEIGHTS } from "./components/MealRows";

/** Mirrors the day layout exactly (same heights) so the crossfade never moves anything. */
export function NutritionSkeleton({ testID = "nutrition-skeleton" }: { testID?: string }) {
  return (
    <SkeletonGroup testID={testID} style={styles.stack}>
      <Skeleton height={HERO_HEIGHT} radius={radii.card} />
      <MealSkeleton entries={2} />
      <MealSkeleton entries={3} />
    </SkeletonGroup>
  );
}

function MealSkeleton({ entries }: { entries: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.meal, { backgroundColor: colors.surface }]}>
      <View style={[styles.row, { minHeight: ROW_HEIGHTS.header }]}>
        <Skeleton width={28} height={28} circle />
        <Skeleton width={110} height={16} />
      </View>
      {Array.from({ length: entries }, (_, i) => (
        <View key={i} style={[styles.row, { minHeight: ROW_HEIGHTS.entry }]}>
          <View style={styles.grow}>
            <Skeleton width={`${55 + i * 10}%`} height={14} />
            <Skeleton width="40%" height={10} />
          </View>
          <Skeleton width={38} height={14} />
        </View>
      ))}
      <View style={[styles.row, { minHeight: ROW_HEIGHTS.add }]}>
        <Skeleton width={70} height={14} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  meal: { borderRadius: radii.card, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg },
  grow: { flex: 1, gap: spacing.sm },
});
