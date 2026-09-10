import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Skeleton, SkeletonGroup } from "../../../ui/Skeleton";
import { DAY_CARD_MIN_HEIGHT } from "./CurrentDayCard";
import { HISTORY_ROW_HEIGHT } from "./HistoryRow";
import { VOLUME_CARD_MIN_HEIGHT } from "./VolumeCard";

/** Mirrors ProgramScreen 1:1 (same heights) so the crossfade has zero layout jump. */
export function ProgramSkeleton() {
  const { colors } = useTheme();
  return (
    <SkeletonGroup testID="program-skeleton" style={styles.wrap}>
      <Skeleton height={40} radius={radii.control} />
      <View style={styles.strip}>
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} height={64} radius={radii.control} style={styles.pill} />
        ))}
      </View>
      <View style={[styles.card, { height: DAY_CARD_MIN_HEIGHT, backgroundColor: colors.surface }]}>
        <Skeleton width={120} height={12} />
        <Skeleton width={210} height={30} radius={10} style={{ marginTop: spacing.md }} />
        <Skeleton width={150} height={14} style={{ marginTop: spacing.sm }} />
        <View style={[styles.row, { marginTop: spacing.lg }]}>
          <Skeleton height={14} radius={7} style={{ flex: 1 }} />
          <Skeleton height={14} radius={7} style={{ flex: 1 }} />
        </View>
        <Skeleton height={52} radius={radii.control} style={{ marginTop: spacing.lg }} />
      </View>
      <View style={[styles.card, { height: VOLUME_CARD_MIN_HEIGHT, backgroundColor: colors.surface }]}>
        <Skeleton width={140} height={18} />
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={{ marginTop: spacing.md, gap: spacing.xs }}>
            <Skeleton width={110} height={11} />
            <Skeleton height={6} radius={3} />
          </View>
        ))}
      </View>
      <Skeleton width={120} height={16} />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} height={HISTORY_ROW_HEIGHT - spacing.sm} radius={radii.md} />
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  strip: { flexDirection: "row", gap: spacing.xs },
  pill: { flex: 1 },
  card: { borderRadius: radii.card, padding: spacing.cardPad, overflow: "hidden" },
  row: { flexDirection: "row", gap: spacing.md },
});
