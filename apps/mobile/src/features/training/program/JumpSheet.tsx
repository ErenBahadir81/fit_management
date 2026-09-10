import React from "react";
import { StyleSheet, View } from "react-native";
import type { DayDTO } from "@fitfloow/core";
import { fmtNumber } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Icon, type IconName } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Sheet, type SheetRef } from "../../../ui/Sheet";
import { Text } from "../../../ui/Text";
import { dayCounts } from "../lib/present";

const KIND_ICON: Record<DayDTO["kind"], IconName> = {
  strength: "barbell-outline",
  run: "walk-outline",
  swim: "water-outline",
  stretch: "body-outline",
  rest: "bed-outline",
};

export interface JumpSheetProps {
  sheetRef: React.RefObject<SheetRef | null>;
  days: readonly DayDTO[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

/** "Buradan devam et": pick which cycle day the program should continue from. */
export function JumpSheet({ sheetRef, days, currentIndex, onSelect }: JumpSheetProps) {
  const { colors } = useTheme();
  return (
    <Sheet ref={sheetRef} title="Buradan devam et">
      <View style={styles.body} testID="jump-sheet">
        <Text variant="body" color="inkMuted">
          Sıra kaydıysa doğru günü seç — program oradan devam eder.
        </Text>
        <View style={styles.list}>
          {days.map((day, index) => {
            const counts = dayCounts(day);
            const current = index === currentIndex;
            const meta = day.kind === "rest" ? "Dinlenme" : counts.km > 0 ? `${fmtNumber(counts.km, 1)} km · ${counts.min} dk` : `${counts.exercises} hareket · ${counts.sets} set`;
            return (
              <Pressable
                key={`${day.order}-${day.title}`}
                onPress={() => onSelect(index)}
                haptic="select"
                testID={`jump-day-${index}`}
                accessibilityState={{ selected: current }}
                accessibilityLabel={`${day.order}. gün, ${day.title}, ${meta}${current ? ", şu anki gün" : ""}`}
                style={[styles.row, { backgroundColor: current ? colors.primarySoft : colors.surfaceMuted }]}
              >
                <View style={[styles.icon, { backgroundColor: colors.surface }]}>
                  <Icon name={KIND_ICON[day.kind]} size={18} color={current ? "primary" : "inkMuted"} />
                </View>
                <View style={styles.texts}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {day.order}. {day.title}
                  </Text>
                  <Text variant="caption" color="inkMuted" tabular numberOfLines={1}>
                    {meta}
                  </Text>
                </View>
                {current ? <Icon name="ellipse" size={10} color="primary" /> : <Icon name="chevron-forward" size={18} color="inkSubtle" />}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  list: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 60, borderRadius: radii.md },
  icon: { width: 34, height: 34, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  texts: { flex: 1, gap: 2 },
});
