import React from "react";
import { StyleSheet, View } from "react-native";
import { fmtNumber } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import type { AppIcon } from "../../../ui/icons";
import { Pressable } from "../../../ui/Pressable";
import { Sheet, type SheetRef } from "../../../ui/Sheet";
import { Text } from "../../../ui/Text";
import { cardioSlots, cardioTotals, exerciseDone, exerciseTonnage, type LoggerState } from "../lib/logger";

export interface SessionSheetProps {
  sheetRef: React.RefObject<SheetRef | null>;
  state: LoggerState | null;
  /** Pane index in the pager — exercises first, then the cardio slots. */
  onJump: (paneIndex: number) => void;
}

/**
 * The whole session on one screen. Swiping is how you move between neighbours; this is how you see
 * where you are in the hour and jump straight to the thing you want to do next.
 */
export function SessionSheet({ sheetRef, state, onJump }: SessionSheetProps) {
  if (!state) {
    return (
      <Sheet ref={sheetRef}>
        <View testID="session-sheet-empty" />
      </Sheet>
    );
  }

  const slots = cardioSlots(state);

  return (
    <Sheet ref={sheetRef} title="Bugünün antrenmanı">
      <View style={styles.list} testID="session-sheet">
        {state.exercises.map((ex, i) => {
          const done = ex.sets.filter((s) => s.done).length;
          const tonnage = exerciseTonnage(ex);
          const status: Status = ex.skipped ? "skipped" : exerciseDone(ex) ? "done" : done > 0 ? "started" : "todo";
          return (
            <Row
              key={ex.id}
              current={state.activeIndex === i}
              status={status}
              title={ex.name}
              meta={ex.skipped ? "Atlandı" : `${done}/${ex.sets.length} set${tonnage > 0 ? ` · ${fmtNumber(tonnage, 0)} kg` : ""}`}
              onPress={() => onJump(i)}
              testID={`session-jump-${i}`}
            />
          );
        })}

        {slots.map((slot, i) => {
          const index = state.exercises.length + i;
          const totals = cardioTotals(state[slot]);
          return (
            <Row
              key={slot}
              current={state.activeIndex === index}
              status={totals.km > 0 || totals.min > 0 ? "done" : "todo"}
              icon={slot === "run" ? "run" : "swim"}
              title={slot === "run" ? "Koşu" : "Yüzme"}
              meta={`${fmtNumber(totals.km, 1)} km · ${fmtNumber(totals.min, 0)} dk`}
              onPress={() => onJump(index)}
              testID={`session-jump-${index}`}
            />
          );
        })}
      </View>
    </Sheet>
  );
}

type Status = "done" | "started" | "skipped" | "todo";

function Row({
  current,
  status,
  icon,
  title,
  meta,
  onPress,
  testID,
}: {
  current: boolean;
  status: Status;
  icon?: AppIcon;
  title: string;
  meta: string;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const badge =
    status === "done"
      ? { bg: colors.successSoft, fg: "success" as const, icon: "check" as AppIcon }
      : status === "skipped"
        ? { bg: colors.warningSoft, fg: "warning" as const, icon: "skip" as AppIcon }
        : status === "started"
          ? { bg: colors.primarySoft, fg: "primary" as const, icon: "start" as AppIcon }
          : { bg: colors.surfaceMuted, fg: "inkSubtle" as const, icon: icon ?? "strength" };

  return (
    <Pressable
      onPress={onPress}
      haptic="select"
      testID={testID}
      accessibilityLabel={`${title}, ${meta}${current ? ", şu an buradasın" : ""}`}
      accessibilityState={{ selected: current }}
      style={[styles.row, { backgroundColor: current ? colors.primarySoft : colors.surfaceMuted }]}
    >
      <View style={[styles.badge, { backgroundColor: badge.bg }]}>
        <Icon icon={badge.icon} size={status === "started" ? 10 : 16} color={badge.fg} />
      </View>
      <View style={styles.texts}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color="inkMuted" tabular numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {current ? (
        <Text variant="caption" tone="primary">
          Buradasın
        </Text>
      ) : (
        <Icon icon="forward" size={18} color="inkSubtle" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.lg, borderRadius: radii.md },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  texts: { flex: 1, gap: 2 },
});
