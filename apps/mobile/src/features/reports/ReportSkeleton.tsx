import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radii, spacing } from "../../theme/tokens";
import { Skeleton, SkeletonGroup, SkeletonText } from "../../ui/Skeleton";

/** Mirrors WeeklyReportScreen 1:1 (same card heights) so the crossfade has zero layout jump. */
export const REPORT_HEIGHTS = { hero: 248, deficit: 292, body: 176, training: 252, goal: 164, highlights: 172, history: 172 } as const;

function CardSkeleton({ height, children }: { height: number; children?: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { height, backgroundColor: colors.surface }]}>{children}</View>;
}

export function ReportSkeleton() {
  return (
    <SkeletonGroup testID="report-skeleton" style={styles.wrap}>
      <CardSkeleton height={REPORT_HEIGHTS.hero}>
        <View style={styles.row}>
          <Skeleton height={132} circle />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Skeleton width={120} height={22} />
            <Skeleton width={90} height={12} />
            <Skeleton width={60} height={24} radius={radii.pill} />
          </View>
        </View>
        <Skeleton height={48} radius={radii.md} style={{ marginTop: spacing.lg }} />
      </CardSkeleton>
      <CardSkeleton height={REPORT_HEIGHTS.deficit}>
        <Skeleton width={90} height={12} />
        <SkeletonText lines={2} lineHeight={16} lastWidth="55%" />
        <Skeleton height={140} radius={radii.md} style={{ marginTop: spacing.md }} />
      </CardSkeleton>
      <CardSkeleton height={REPORT_HEIGHTS.body}>
        <Skeleton width={60} height={12} />
        <View style={[styles.row, { marginTop: spacing.md }]}>
          <Skeleton height={56} radius={radii.md} style={{ flex: 1 }} />
          <Skeleton height={56} radius={radii.md} style={{ flex: 1 }} />
          <Skeleton height={56} radius={radii.md} style={{ flex: 1 }} />
        </View>
      </CardSkeleton>
      <CardSkeleton height={REPORT_HEIGHTS.training}>
        <View style={styles.row}>
          <Skeleton height={64} circle />
          <SkeletonText lines={2} lineHeight={12} />
        </View>
        <SkeletonText lines={4} lineHeight={10} lastWidth="80%" />
      </CardSkeleton>
      <CardSkeleton height={REPORT_HEIGHTS.goal}>
        <Skeleton width={110} height={12} />
        <Skeleton width={180} height={30} radius={10} style={{ marginTop: spacing.sm }} />
        <Skeleton height={8} radius={4} style={{ marginTop: spacing.lg }} />
      </CardSkeleton>
      <CardSkeleton height={REPORT_HEIGHTS.highlights}>
        <SkeletonText lines={4} lineHeight={14} />
      </CardSkeleton>
      <CardSkeleton height={REPORT_HEIGHTS.history}>
        <Skeleton height={40} radius={8} />
        <Skeleton height={44} radius={radii.pill} style={{ marginTop: spacing.md }} />
      </CardSkeleton>
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  card: { borderRadius: radii.card, padding: spacing.cardPad, overflow: "hidden", gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
});
