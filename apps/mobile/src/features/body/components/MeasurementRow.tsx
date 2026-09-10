import React, { memo, useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import type { BodyEntryDTO } from "@fitfloow/core";
import { fmtCm, fmtDate, fmtDelta, fmtKg, fmtPct } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
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
  const swipe = useRef<SwipeableMethods>(null);
  const delta = prev ? entry.bodyFatPct - prev.bodyFatPct : null;
  const tone = delta === null ? "neutral" : delta < -0.05 ? "success" : delta > 0.05 ? "warning" : "neutral";

  const remove = useCallback(() => {
    swipe.current?.close();
    onDelete(entry.id);
  }, [entry.id, onDelete]);

  const renderRight = useCallback(
    () => (
      <Pressable onPress={remove} haptic="medium" accessibilityLabel="Ölçümü sil" style={[styles.action, { backgroundColor: colors.danger }]} testID={`entry-delete-${entry.id}`}>
        <Icon name="trash-outline" size={20} color="#FFFFFF" />
        <Text variant="label" style={styles.actionText}>
          Sil
        </Text>
      </Pressable>
    ),
    [colors.danger, entry.id, remove]
  );

  return (
    <ReanimatedSwipeable ref={swipe} renderRightActions={renderRight} rightThreshold={48} friction={2} overshootRight={false}>
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
    </ReanimatedSwipeable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: BODY_HEIGHTS.row, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  texts: { flex: 1, gap: 2 },
  right: { alignItems: "flex-end", gap: 2 },
  action: { width: 88, marginVertical: spacing.xs, borderRadius: radii.control, alignItems: "center", justifyContent: "center", gap: 2 },
  actionText: { color: "#FFFFFF" },
});
