import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radii, spacing } from "../../theme/tokens";
import { Skeleton, SkeletonGroup, SkeletonText } from "../../ui/Skeleton";

/** Mirrors HomeScreen's layout 1:1 (same card heights) so the crossfade has zero layout jump. */
export const HOME_HEIGHTS = { today: 156, calorie: 168, goal: 150, recovery: 132, tile: 84 } as const;

function CardSkeleton({ height, children }: { height: number; children?: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { height, backgroundColor: colors.surface }]}>{children}</View>;
}

export function HomeSkeleton() {
  return (
    <SkeletonGroup testID="home-skeleton" style={styles.wrap}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Skeleton width={120} height={14} />
          <Skeleton width={200} height={30} radius={10} />
        </View>
        <Skeleton height={64} circle />
      </View>
      <Skeleton height={56} radius={radii.md} />
      <CardSkeleton height={HOME_HEIGHTS.today}>
        <Skeleton width={110} height={12} />
        <Skeleton width={180} height={26} radius={10} style={{ marginTop: spacing.md }} />
        <Skeleton width={140} height={14} style={{ marginTop: spacing.sm }} />
        <Skeleton width={160} height={44} radius={radii.control} style={{ marginTop: spacing.lg }} />
      </CardSkeleton>
      <CardSkeleton height={HOME_HEIGHTS.calorie}>
        <View style={styles.row}>
          <Skeleton height={120} circle />
          <View style={{ flex: 1, gap: spacing.md }}>
            <Skeleton width={70} height={12} />
            <Skeleton width={150} height={22} />
            <SkeletonText lines={2} lineHeight={10} />
          </View>
        </View>
      </CardSkeleton>
      <CardSkeleton height={HOME_HEIGHTS.goal}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Skeleton width={140} height={18} />
          <Skeleton width={70} height={28} radius={radii.pill} />
        </View>
        <Skeleton height={8} radius={4} style={{ marginTop: spacing.lg }} />
        <View style={[styles.row, { marginTop: spacing.lg }]}>
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={36} />
        </View>
      </CardSkeleton>
      <CardSkeleton height={HOME_HEIGHTS.recovery}>
        <View style={styles.row}>
          <Skeleton height={64} circle />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Skeleton width={90} height={12} />
            <Skeleton width={140} height={20} />
          </View>
        </View>
        <View style={[styles.row, { marginTop: spacing.md }]}>
          <Skeleton width={90} height={30} radius={radii.pill} />
          <Skeleton width={80} height={30} radius={radii.pill} />
          <Skeleton width={96} height={30} radius={radii.pill} />
        </View>
      </CardSkeleton>
      <View style={styles.row}>
        <Skeleton height={HOME_HEIGHTS.tile} radius={radii.md} style={{ flex: 1 }} />
        <Skeleton height={HOME_HEIGHTS.tile} radius={radii.md} style={{ flex: 1 }} />
        <Skeleton height={HOME_HEIGHTS.tile} radius={radii.md} style={{ flex: 1 }} />
      </View>
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  card: { borderRadius: radii.card, padding: spacing.cardPad, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
