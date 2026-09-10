import React, { useCallback, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import type { WorkoutLogDTO } from "@fitfloow/core";
import { fmtDate, fmtDuration, fmtNumber } from "../../../lib/format";
import { relativeDayLabel } from "../../../lib/dates";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Icon, type IconName } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { logSummary } from "../lib/present";

export const HISTORY_ROW_HEIGHT = 76;

const KIND_ICON: Record<WorkoutLogDTO["kind"], IconName> = {
  strength: "barbell-outline",
  run: "walk-outline",
  swim: "water-outline",
  stretch: "body-outline",
  rest: "bed-outline",
};

export interface HistoryRowProps {
  log: WorkoutLogDTO;
  onPress: (log: WorkoutLogDTO) => void;
  onDelete: (log: WorkoutLogDTO) => void;
}

/** One session in the history list. Tap → detail sheet, swipe left → delete (with undo). */
export function HistoryRow({ log, onPress, onDelete }: HistoryRowProps) {
  const { colors } = useTheme();
  const swipe = useRef<SwipeableMethods>(null);
  const s = useMemo(() => logSummary(log), [log]);

  const remove = useCallback(() => {
    swipe.current?.close();
    onDelete(log);
  }, [log, onDelete]);

  const meta = [
    s.sets > 0 ? `${s.sets} set` : null,
    s.km > 0 ? `${fmtNumber(s.km, 1)} km` : null,
    log.durationMin ? fmtDuration(log.durationMin) : null,
    log.rpe ? `RPE ${log.rpe}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const rightActions = useCallback(
    () => (
      <Pressable
        onPress={remove}
        haptic="medium"
        testID={`history-delete-${log.id}`}
        accessibilityLabel={`${log.title} kaydını sil`}
        style={[styles.deleteAction, { backgroundColor: colors.dangerSoft }]}
      >
        <Icon name="trash-outline" size={20} color="danger" />
        <Text variant="caption" tone="danger">
          Sil
        </Text>
      </Pressable>
    ),
    [colors.dangerSoft, log.id, log.title, remove]
  );

  return (
    <ReanimatedSwipeable ref={swipe} renderRightActions={rightActions} rightThreshold={48} friction={1.6} overshootRight={false} testID={`history-swipe-${log.id}`}>
      <Pressable
        onPress={() => onPress(log)}
        testID={`history-row-${log.id}`}
        accessibilityLabel={`${fmtDate(log.dateKey)}, ${log.title}${meta ? `, ${meta}` : ""}`}
        style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={[styles.icon, { backgroundColor: log.isOffDay ? colors.warningSoft : colors.primarySoft }]}>
          <Icon name={log.isOffDay ? "play-skip-forward-outline" : KIND_ICON[log.kind]} size={18} color={log.isOffDay ? "warning" : "primary"} />
        </View>
        <View style={styles.texts}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {log.isOffDay ? "Atlandı" : log.title}
          </Text>
          <Text variant="caption" color="inkMuted" tabular numberOfLines={1}>
            {relativeDayLabel(log.dateKey)}
            {meta ? ` · ${meta}` : ""}
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color="inkSubtle" />
      </Pressable>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    height: HISTORY_ROW_HEIGHT - spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 36, height: 36, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  texts: { flex: 1, gap: 2 },
  deleteAction: { width: 84, marginLeft: spacing.sm, borderRadius: radii.md, alignItems: "center", justifyContent: "center", gap: 2 },
});
