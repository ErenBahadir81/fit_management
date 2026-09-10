import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import type { WeeklyReportSummary } from "@fitfloow/core";
import { Sparkline } from "../../../charts/Sparkline";
import { fmtDate } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { historyScores, scoreTone } from "../reportMath";
import { REPORT_HEIGHTS } from "../ReportSkeleton";

export interface HistoryCarouselProps {
  weeks: WeeklyReportSummary[] | undefined;
  selectedWeekKey: string;
  onSelect: (weekKey: string) => void;
}

/** Last 12 finished weeks: score sparkline + tappable week tiles. */
export function HistoryCarousel({ weeks, selectedWeekKey, onSelect }: HistoryCarouselProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const ordered = weeks ? [...weeks].sort((a, b) => (a.weekKey < b.weekKey ? -1 : 1)) : [];
  const scores = historyScores(weeks ?? []);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  return (
    <Card style={styles.card} testID="report-history" padded={false}>
      <View style={styles.head} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.texts}>
          <Text variant="label" color="inkMuted">
            Son 12 hafta
          </Text>
          <Text variant="body" color="inkMuted" tabular>
            {avg !== null ? `ortalama ${avg} puan` : "henüz geçmiş yok"}
          </Text>
        </View>
        {scores.length >= 2 && width > 0 ? <Sparkline values={scores} width={Math.min(160, width * 0.45)} height={36} testID="report-history-spark" /> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} testID="report-history-strip">
        {ordered.map((w) => {
          const selected = w.weekKey === selectedWeekKey;
          const tone = scoreTone(w.score);
          const color = { success: colors.success, primary: colors.primary, warning: colors.warning, danger: colors.danger, neutral: colors.inkSubtle }[tone];
          return (
            <Pressable
              key={w.weekKey}
              onPress={() => onSelect(w.weekKey)}
              haptic="select"
              minTarget={false}
              accessibilityLabel={`${fmtDate(w.weekKey, "short")} haftası, ${Math.round(w.score)} puan`}
              accessibilityState={{ selected }}
              style={[styles.tile, { backgroundColor: selected ? colors.primary : colors.surfaceMuted }]}
              testID={`history-${w.weekKey}`}
            >
              <Text variant="heading" tabular style={{ color: selected ? colors.onPrimary : color }}>
                {Math.round(w.score)}
              </Text>
              <Text variant="caption" style={{ color: selected ? colors.onPrimary : colors.inkMuted }} tabular>
                {fmtDate(w.weekKey, "short")}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: REPORT_HEIGHTS.history, paddingVertical: spacing.cardPad, gap: spacing.md },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.cardPad, gap: spacing.md },
  texts: { flex: 1, gap: 2 },
  strip: { paddingHorizontal: spacing.cardPad, gap: spacing.sm },
  tile: { width: 72, height: 64, borderRadius: radii.md, alignItems: "center", justifyContent: "center", gap: 2 },
});
