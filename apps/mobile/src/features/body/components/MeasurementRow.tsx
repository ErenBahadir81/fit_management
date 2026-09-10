import React, { memo, useCallback } from "react";
import { StyleSheet, View } from "react-native";
import type { BodyEntryDTO } from "@fitfloow/core";
import { fmtCm, fmtDate, fmtDelta, fmtKg, fmtPct } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { SwipeToDelete } from "../../../ui/SwipeToDelete";
import { Text } from "../../../ui/Text";
import { BODY_HEIGHTS } from "../BodySkeleton";

export interface MeasurementRowProps {
  entry: BodyEntryDTO;
  /** The chronologically previous measurement (for the bf delta). */
  prev: BodyEntryDTO | null;
  onDelete: (id: string) => void;
}

/** History row: date, weight/waist, bf % with its delta. Swipe left to delete (a11y: "Sil" action). */
export const MeasurementRow = memo(function MeasurementRow({ entry, prev, onDelete }: MeasurementRowProps) {
  const { colors } = useTheme();
  const delta = prev ? entry.bodyFatPct - prev.bodyFatPct : null;
  const tone = delta === null ? "neutral" : delta < -0.05 ? "success" : delta > 0.05 ? "warning" : "neutral";
  const remove = useCallback(() => onDelete(entry.id), [entry.id, onDelete]);

  return (
    <SwipeToDelete onDelete={remove} deleteTestID={`entry-delete-${entry.id}`} deleteLabel="Ölçümü sil" radius={radii.control}>
      <View
        style={[styles.row, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}
        testID={`entry-row-${entry.id}`}
        accessible
        accessibilityLabel={`${fmtDate(entry.dateKey)}: yağ ${fmtPct(entry.bodyFatPct)}, ${fmtKg(entry.weightKg)}, bel ${fmtCm(entry.waistCm, 0)}`}
        accessibilityActions={[{ name: "delete", label: "Sil" }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "delete") remove();
        }}
      >
        <View style={styles.texts}>
          <Text variant="bodyStrong">{fmtDate(entry.dateKey)}</Text>
          <Text variant="caption" color="inkMuted" tabular>
            {fmtKg(entry.weightKg)} · bel {fmtCm(entry.waistCm, 0)} · boyun {fmtCm(entry.neckCm, 0)}
          </Text>
        </View>
        <View style={styles.right}>
          <Text variant="heading" tabular>
            {fmtPct(entry.bodyFatPct)}
          </Text>
          <Text variant="caption" tone={tone} tabular>
            {delta === null ? "ilk ölçüm" : fmtDelta(delta, "puan")}
          </Text>
        </View>
      </View>
    </SwipeToDelete>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: BODY_HEIGHTS.row, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  texts: { flex: 1, gap: 2 },
  right: { alignItems: "flex-end", gap: 2 },
});
