import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radii, spacing } from "../../theme/tokens";
import { Skeleton, SkeletonGroup, SkeletonText } from "../../ui/Skeleton";

/** Mirrors BodyScreen 1:1 (same card heights) so the crossfade has zero layout jump. */
export const BODY_HEIGHTS = { hero: 212, weighIn: 116, trends: 352, link: 96, row: 76 } as const;

function CardSkeleton({ height, muted, children }: { height: number; muted?: boolean; children?: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { height, backgroundColor: muted ? colors.surfaceMuted : colors.surface }]}>{children}</View>;
}

export function BodySkeleton() {
  return (
    <SkeletonGroup testID="body-skeleton" style={styles.wrap}>
      <View style={styles.header}>
        <Skeleton width={110} height={30} radius={10} />
        <Skeleton height={44} circle />
      </View>
      <CardSkeleton height={BODY_HEIGHTS.hero}>
        <View style={styles.between}>
          <Skeleton width={90} height={12} />
          <Skeleton width={64} height={26} radius={radii.pill} />
        </View>
        <Skeleton width={190} height={44} radius={12} style={{ marginTop: spacing.md }} />
        <Skeleton width={120} height={14} style={{ marginTop: spacing.sm }} />
        <View style={[styles.row, { marginTop: spacing.xl }]}>
          <Skeleton height={48} radius={radii.md} style={{ flex: 1.3 }} />
          <Skeleton height={48} radius={radii.md} style={{ flex: 1 }} />
          <Skeleton height={48} radius={radii.md} style={{ flex: 1 }} />
        </View>
      </CardSkeleton>
      <CardSkeleton height={BODY_HEIGHTS.weighIn} muted>
        <Skeleton width={100} height={12} />
        <View style={[styles.between, { marginTop: spacing.md }]}>
          <Skeleton width={196} height={44} radius={radii.control} />
          <Skeleton width={104} height={52} radius={radii.control} />
        </View>
      </CardSkeleton>
      <CardSkeleton height={BODY_HEIGHTS.trends}>
        <View style={styles.between}>
          <Skeleton width={60} height={18} />
          <Skeleton width={140} height={12} />
        </View>
        <Skeleton height={40} radius={radii.control} style={{ marginTop: spacing.md }} />
        <Skeleton height={200} radius={radii.md} style={{ marginTop: spacing.lg }} />
      </CardSkeleton>
      <View style={styles.row}>
        <Skeleton height={BODY_HEIGHTS.link} radius={radii.card} style={{ flex: 1 }} />
        <Skeleton height={BODY_HEIGHTS.link} radius={radii.card} style={{ flex: 1 }} />
      </View>
      <View style={styles.between}>
        <Skeleton width={90} height={18} />
        <Skeleton width={110} height={40} radius={12} />
      </View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.rowItem, { height: BODY_HEIGHTS.row }]}>
          <SkeletonText lines={2} lineHeight={12} lastWidth="40%" />
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg, paddingHorizontal: spacing.gutter },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm },
  card: { borderRadius: radii.card, padding: spacing.cardPad, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowItem: { justifyContent: "center", paddingVertical: spacing.sm },
});
