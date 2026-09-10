import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Skeleton, SkeletonGroup } from "../../../ui/Skeleton";

/** Card heights live here so the skeleton and the real grid can never drift apart. */
export const MUSCLE_CARD_HEIGHT = 132;

/** Mirrors RecoveryPanel: overall card + a 2-column muscle grid. */
export function RecoverySkeleton() {
  const { colors } = useTheme();
  return (
    <SkeletonGroup testID="recovery-skeleton" style={styles.wrap}>
      <View style={[styles.overall, { backgroundColor: colors.surface }]}>
        <Skeleton height={96} circle />
        <View style={styles.texts}>
          <Skeleton width={110} height={12} />
          <Skeleton width={150} height={22} />
          <Skeleton width={120} height={26} radius={radii.pill} />
        </View>
      </View>
      <View style={styles.grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={MUSCLE_CARD_HEIGHT} radius={radii.md} style={styles.card} />
        ))}
      </View>
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  overall: { flexDirection: "row", alignItems: "center", gap: spacing.lg, minHeight: 152, borderRadius: radii.card, padding: spacing.cardPad },
  texts: { flex: 1, gap: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: { width: "47.5%", flexGrow: 1 },
});
