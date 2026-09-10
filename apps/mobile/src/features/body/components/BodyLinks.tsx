import React from "react";
import { StyleSheet, View } from "react-native";
import type { GoalView, WeeklyReportDTO } from "@fitfloow/core";
import { fmtKg, fmtPct } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { Ring } from "../../../ui/Ring";
import { Text } from "../../../ui/Text";
import { ON_TRACK_TR } from "../../home/components/GoalCard";
import { scoreTone } from "../../reports/reportMath";
import { BODY_HEIGHTS } from "../BodySkeleton";

/** Entry to the goal flow: roadmap when a goal exists, otherwise the setup CTA. */
export function GoalLinkCard({ view, onPress }: { view: GoalView | undefined; onPress: () => void }) {
  const { colors } = useTheme();
  const goal = view?.goal?.status === "active" ? view.goal : null;
  const progress = goal ? view?.progress : null;
  if (!goal || !progress) {
    return (
      <Card variant="muted" onPress={onPress} style={styles.min} testID="body-goal-link" accessibilityLabel="Hedef belirle">
        <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
          <Icon name="flag-outline" size={18} color="primary" />
        </View>
        <Text variant="bodyStrong" style={styles.title}>
          Hedef belirle
        </Text>
        <Text variant="caption" color="inkMuted" numberOfLines={2}>
          Yağ oranı seç, yol haritasını çizeyim.
        </Text>
      </Card>
    );
  }
  const track = ON_TRACK_TR[progress.onTrack];
  return (
    <Card onPress={onPress} style={styles.min} testID="body-goal-link" accessibilityLabel={`Hedef %${goal.targetBodyFatPct}, ilerleme ${fmtPct(progress.percentComplete, 0)}, ${track.label}`}>
      <View style={styles.row}>
        <Ring value={progress.percentComplete / 100} size={44} stroke={5} tone={track.tone === "danger" ? "warning" : track.tone} gradient={false}>
          <Text variant="caption" tabular>
            {Math.round(progress.percentComplete)}
          </Text>
        </Ring>
        <View style={styles.texts}>
          <Text variant="caption" color="inkMuted">
            Hedef {fmtPct(goal.targetBodyFatPct, 0)}
          </Text>
          <Text variant="bodyStrong" tabular numberOfLines={1}>
            {fmtKg(progress.kgToGo)} kaldı
          </Text>
        </View>
      </View>
      <Chip label={track.label} tone={track.tone} size="sm" />
    </Card>
  );
}

/** Entry to the weekly report: this week's live score. */
export function ReportLinkCard({ report, onPress }: { report: WeeklyReportDTO | undefined; onPress: () => void }) {
  const { colors } = useTheme();
  const tone = report ? scoreTone(report.score) : "primary";
  return (
    <Card onPress={onPress} style={styles.min} testID="body-report-link" accessibilityLabel={report ? `Haftalık rapor, bu hafta puan ${Math.round(report.score)}` : "Haftalık rapor"}>
      <View style={styles.row}>
        {report ? (
          <Ring value={report.score / 100} size={44} stroke={5} tone={tone} gradient={false}>
            <Text variant="caption" tabular>
              {Math.round(report.score)}
            </Text>
          </Ring>
        ) : (
          <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
            <Icon name="newspaper-outline" size={18} color="primary" />
          </View>
        )}
        <View style={styles.texts}>
          <Text variant="caption" color="inkMuted">
            Bu hafta
          </Text>
          <Text variant="bodyStrong" numberOfLines={1}>
            Haftalık rapor
          </Text>
        </View>
      </View>
      <View style={styles.footer}>
        <Text variant="caption" color="inkSubtle" tabular numberOfLines={1}>
          {report ? `${report.nutrition.daysLogged} gün kayıt · ${report.training.sessions} antrenman` : "Puan ve özet"}
        </Text>
        <Icon name="chevron-forward" size={14} color="inkSubtle" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  min: { flex: 1, minHeight: BODY_HEIGHTS.link, padding: spacing.lg, justifyContent: "space-between", gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  texts: { flex: 1, gap: 2 },
  badge: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { marginTop: spacing.xs },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
