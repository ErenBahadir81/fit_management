import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { fmtDate, fmtDelta, fmtInt, fmtKg } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Chip } from "../../../ui/Chip";
import { Text } from "../../../ui/Text";
import type { RoadmapRow } from "../goalMath";

export const WEEK_ROW_HEIGHT = 84;

/** One plan week: dates, kcal/day, deficit, expected end weight; past weeks show actual vs expected. */
export const RoadmapWeekRow = memo(function RoadmapWeekRow({ row }: { row: RoadmapRow }) {
  const { colors } = useTheme();
  const { week, state } = row;
  const delta = row.deltaVsExpectedKg;
  const deltaTone = delta === null ? "neutral" : delta <= -0.4 ? "success" : delta >= 0.4 ? "warning" : "success";
  const current = state === "current";
  return (
    <View
      style={[styles.row, { backgroundColor: current ? colors.primarySoft : "transparent", borderBottomColor: colors.border }, current && styles.current]}
      testID={`week-row-${week.weekIndex}`}
      accessible
      accessibilityLabel={`Hafta ${week.weekIndex}, ${fmtDate(week.startKey, "short")} – ${fmtDate(week.endKey, "short")}, günde ${fmtInt(week.dailyCalorieTarget)} kalori, beklenen ${fmtKg(week.endWeightKg)}${delta !== null ? `, fark ${fmtDelta(delta, "kg")}` : ""}`}
    >
      <View style={styles.left}>
        <View style={styles.titleRow}>
          <Text variant="bodyStrong" style={state === "past" && !current ? styles.past : undefined}>
            Hafta {week.weekIndex}
          </Text>
          {current ? <Chip label="Bu hafta" tone="primary" size="sm" /> : null}
        </View>
        <Text variant="caption" color="inkMuted" tabular>
          {fmtDate(week.startKey, "short")} – {fmtDate(week.endKey, "short")} · {fmtInt(week.dailyCalorieTarget)} kcal/gün · −{fmtInt(week.weeklyDeficitKcal)} kcal
        </Text>
      </View>
      <View style={styles.right}>
        <Text variant="title" tabular>
          {fmtKg(week.endWeightKg)}
        </Text>
        <Text variant="caption" tone={deltaTone} color="inkMuted" tabular>
          {state === "future" ? "beklenen" : delta === null ? "tartı yok" : `gerçek ${fmtDelta(delta, "kg")}`}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: WEEK_ROW_HEIGHT, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  current: { borderRadius: radii.md, borderBottomWidth: 0, paddingHorizontal: spacing.md },
  left: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  past: { opacity: 0.7 },
  right: { alignItems: "flex-end", gap: 2 },
});
