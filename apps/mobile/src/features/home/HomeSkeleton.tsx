import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radii, spacing } from "../../theme/tokens";
import { Skeleton, SkeletonGroup, SkeletonText } from "../../ui/Skeleton";

/** Mirrors HomeScreen's layout 1:1 (same card heights) so the crossfade has zero layout jump. */
export const HOME_HEIGHTS = { goal: 176, calorie: 236, today: 168, recovery: 132, tile: 76 } as const;

function CardSkeleton({ height, children }: { height: number; children?: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { height, backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>;
}

export function HomeSkeleton() {
  return (
    <SkeletonGroup testID="home-skeleton" style={styles.wrap}>
      <View style={styles.header}>
        <Skeleton width={120} height={14} />
        <Skeleton width={210} height={30} radius={10} />
      </View>
      <CardSkeleton height={HOME_HEIGHTS.goal}>
        <Skeleton width={90} height={14} />
        <Skeleton width={160} height={24} radius={8} style={{ marginTop: spacing.lg }} />
        <Skeleton width={130} height={14} style={{ marginTop: spacing.sm }} />
        <Skeleton height={6} radius={radii.pill} style={{ marginTop: spacing.lg }} />
      </CardSkeleton>
      <CardSkeleton height={HOME_HEIGHTS.calorie}>
        <Skeleton width={70} height={18} />
        <View style={[styles.row, { marginTop: spacing.lg, gap: spacing.xl }]}>
          <Skeleton height={128} circle />
          <View style={{ flex: 1, gap: spacing.md }}>
            <Skeleton height={14} />
            <Skeleton height={14} />
            <Skeleton height={18} />
          </View>
        </View>
        <Skeleton height={6} radius={radii.pill} style={{ marginTop: spacing.lg }} />
      </CardSkeleton>
      <CardSkeleton height={HOME_HEIGHTS.today}>
        <View style={styles.row}>
          <Skeleton width={36} height={36} radius={radii.sm} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Skeleton width={110} height={12} />
            <Skeleton width={170} height={22} radius={8} />
          </View>
        </View>
        <Skeleton height={48} radius={radii.control} style={{ marginTop: spacing.lg }} />
      </CardSkeleton>
      <CardSkeleton height={HOME_HEIGHTS.recovery}>
        <View style={styles.row}>
          <Skeleton height={64} circle />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Skeleton width={90} height={12} />
            <Skeleton width={140} height={20} />
          </View>
        </View>
      </CardSkeleton>
      <Skeleton height={HOME_HEIGHTS.tile} radius={radii.card} />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.cardGap },
  header: { gap: spacing.sm, paddingVertical: spacing.sm },
  card: { borderRadius: radii.card, padding: spacing.cardPad, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
