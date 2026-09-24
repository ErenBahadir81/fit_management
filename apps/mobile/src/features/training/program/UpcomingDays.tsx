import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import type { ScheduleEntry } from "@fitfloow/core";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { STATUS_TR, stripItems, type StripItem } from "../lib/present";
import { KIND_ICON } from "./TodayHero";

export interface UpcomingDaysProps {
  title: string;
  entries: readonly ScheduleEntry[];
  /** A day that carries a log opens it. */
  onOpenLog: (entry: ScheduleEntry) => void;
}

/**
 * The days around today, one row each: the weekday, the program day, and what happened. Weekly
 * programs show the calendar week (past days included); cycles show the next seven days walked
 * forward from the pointer. Static on purpose — this list is read, not played with.
 */
export function UpcomingDays({ title, entries, onOpenLog }: UpcomingDaysProps) {
  const items = stripItems(entries);
  return (
    <Card style={styles.card} testID="upcoming-days">
      <Text variant="title">{title}</Text>
      <View>
        {items.map((item, i) => (
          <DayRow key={item.dateKey} item={item} entry={entries[i]} last={i === items.length - 1} onOpenLog={onOpenLog} />
        ))}
      </View>
    </Card>
  );
}

const STATUS_ICON: Partial<Record<ScheduleEntry["status"], { name: "checkmark-circle-outline" | "play-skip-forward-outline"; color: "success" | "warning" }>> = {
  done: { name: "checkmark-circle-outline", color: "success" },
  skipped: { name: "play-skip-forward-outline", color: "warning" },
};

const DayRow = memo(function DayRow({ item, entry, last, onOpenLog }: { item: StripItem; entry: ScheduleEntry; last: boolean; onOpenLog: (e: ScheduleEntry) => void }) {
  const { colors } = useTheme();
  const logged = entry.logId !== null;
  const status = STATUS_ICON[item.status];
  const rest = item.kind === "rest";
  const past = item.status === "past";
  const content = (
    <View style={[styles.row, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.date, item.isToday && { backgroundColor: colors.primary }]}>
        <Text variant="caption" color={item.isToday ? "onPrimaryMuted" : "inkSubtle"}>
          {item.label}
        </Text>
        <Text variant="bodyStrong" tabular color={item.isToday ? "onPrimary" : past ? "inkMuted" : "ink"}>
          {item.dayNumber}
        </Text>
      </View>
      {item.kind ? <Icon icon={KIND_ICON[item.kind]} size={18} color={rest || past ? "inkSubtle" : "primary"} /> : null}
      <Text variant="body" color={rest || past ? "inkMuted" : "ink"} numberOfLines={1} style={styles.title}>
        {item.title ?? "—"}
      </Text>
      {status ? (
        <View style={styles.status}>
          <Icon name={status.name} size={16} color={status.color} />
          <Text variant="caption" tone={status.color}>
            {STATUS_TR[item.status]}
          </Text>
        </View>
      ) : item.isToday ? (
        <Text variant="caption" color="primary">
          Bugün
        </Text>
      ) : past ? (
        <Text variant="caption" color="inkSubtle">
          {STATUS_TR.past}
        </Text>
      ) : null}
    </View>
  );
  if (!logged) {
    return (
      <View testID={`upcoming-day-${item.dateKey}`} accessible accessibilityLabel={item.a11y}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={`upcoming-day-${item.dateKey}`}
      onPress={() => onOpenLog(entry)}
      haptic="select"
      minTarget={false}
      scaleTo={0.99}
      accessibilityLabel={`${item.a11y}. Kaydı açmak için dokun`}
    >
      {content}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52, paddingVertical: spacing.xs },
  date: { width: 44, height: 44, borderRadius: radii.control, alignItems: "center", justifyContent: "center" },
  title: { flex: 1 },
  status: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
});
