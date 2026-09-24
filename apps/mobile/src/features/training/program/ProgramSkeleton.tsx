import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Skeleton, SkeletonGroup } from "../../../ui/Skeleton";
import { TODAY_HERO_MIN_HEIGHT } from "./TodayHero";

/** Mirrors the program pane (same heights): today's card, then the upcoming days. */
export function ProgramSkeleton() {
  const { colors } = useTheme();
  return (
    <SkeletonGroup testID="program-skeleton" style={styles.wrap}>
      <View style={[styles.card, { height: TODAY_HERO_MIN_HEIGHT, backgroundColor: colors.surface }]}>
        <Skeleton width={160} height={12} />
        <Skeleton width={220} height={34} radius={10} style={{ marginTop: spacing.md }} />
        <Skeleton width={150} height={14} style={{ marginTop: spacing.sm }} />
        <Skeleton height={52} radius={radii.control} style={{ marginTop: spacing.xl }} />
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Skeleton width={140} height={18} />
        {Array.from({ length: 5 }).map((_, i) => (
          <View key={i} style={styles.row}>
            <Skeleton width={44} height={44} radius={radii.control} />
            <Skeleton height={14} radius={7} style={styles.grow} />
          </View>
        ))}
      </View>
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.cardGap },
  card: { borderRadius: radii.card, padding: spacing.cardPad, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  grow: { flex: 1 },
});
