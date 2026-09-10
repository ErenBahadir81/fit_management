import React from "react";
import { StyleSheet, View } from "react-native";
import type { GoalProgress, OnTrack } from "@fitfloow/core";
import { fmtDate, fmtKg, fmtPct } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { spacing, type Tone } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { ProgressBar } from "../../../ui/ProgressBar";
import { Text } from "../../../ui/Text";
import { HOME_HEIGHTS } from "../HomeSkeleton";

export const ON_TRACK_TR: Record<OnTrack, { label: string; tone: Tone }> = {
  ahead: { label: "Önde", tone: "success" },
  onTrack: { label: "Rotada", tone: "success" },
  behind: { label: "Geride", tone: "warning" },
  stalled: { label: "Durakladı", tone: "danger" },
};

export function GoalCard({ goal, targetBf, onPress }: { goal: GoalProgress | null; targetBf?: number | null; onPress: () => void }) {
  const { colors } = useTheme();
  if (!goal) {
    return (
      <Card variant="muted" onPress={onPress} style={styles.min} testID="home-goal-card">
        <View style={styles.row}>
          <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
            <Icon name="flag-outline" size={18} color="primary" />
          </View>
          <View style={styles.texts}>
            <Text variant="heading">Hedef belirle</Text>
            <Text variant="body" color="inkMuted">
              Bir yağ oranı seç; kaç hafta süreceğini ve günlük kaloriyi ben hesaplayayım.
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color="inkSubtle" />
        </View>
      </Card>
    );
  }
  const track = ON_TRACK_TR[goal.onTrack];
  return (
    <Card onPress={onPress} style={styles.min} testID="home-goal-card" accessibilityLabel={`Hedef ilerlemesi ${fmtPct(goal.percentComplete, 0)}, ${track.label}`}>
      <View style={styles.head}>
        <View style={styles.texts}>
          <Text variant="label" color="inkMuted">
            Hedef
          </Text>
          <Text variant="title">{targetBf != null ? `${fmtPct(targetBf, 0)} yağ oranı` : "Yağ oranı hedefi"}</Text>
        </View>
        <Chip label={track.label} tone={track.tone} size="sm" />
      </View>
      <ProgressBar value={goal.percentComplete / 100} tone={track.tone === "danger" ? "warning" : track.tone} valueLabel={fmtPct(goal.percentComplete, 0)} label="İlerleme" style={styles.bar} />
      <View style={styles.stats}>
        <Stat label="Kalan" value={fmtKg(goal.kgToGo)} />
        <Stat label="Tahmini bitiş" value={goal.projectedDate ? fmtDate(goal.projectedDate, "short") : "—"} />
        <Stat label="Kalan hafta" value={String(goal.weeksRemainingPlan)} />
      </View>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="caption" color="inkMuted">
        {label}
      </Text>
      <Text variant="bodyStrong" tabular numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  min: { minHeight: HOME_HEIGHTS.goal, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  texts: { flex: 1, gap: 2 },
  badge: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  bar: { marginTop: spacing.md },
  stats: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  stat: { flex: 1, gap: 2 },
});
