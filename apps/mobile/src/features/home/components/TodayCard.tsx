import React from "react";
import { StyleSheet, View } from "react-native";
import type { HomeDTO } from "@fitfloow/core";
import { fmtDuration } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import type { AppIcon } from "../../../ui/icons";
import { Text } from "../../../ui/Text";
import { HOME_HEIGHTS } from "../HomeSkeleton";

export interface TodayCardProps {
  today: HomeDTO["today"];
  onOpenProgram: () => void;
}

/** Today's workout: due (primary CTA) / done / skipped / rest. Exactly one primary action. */
export function TodayCard({ today, onOpenProgram }: TodayCardProps) {
  const { colors } = useTheme();
  const { day, log } = today.workout;

  if (!day) {
    return (
      <Card variant="muted" onPress={onOpenProgram} style={styles.min} testID="home-today">
        <Row icon="workout" eyebrow="Program" title="Henüz program yok" body="Bir program seç, günleri ben takip edeyim." />
      </Card>
    );
  }
  if (log && !log.isOffDay) {
    return (
      <Card onPress={onOpenProgram} style={styles.min} testID="home-today">
        <View style={styles.head}>
          <View style={[styles.badge, { backgroundColor: colors.successSoft }]}>
            <Icon icon="check" size={18} color="success" />
          </View>
          <Text variant="label" tone="success">
            Tamamlandı
          </Text>
        </View>
        <Text variant="heading" style={styles.title}>
          {log.title}
        </Text>
        <View style={styles.chips}>
          {log.durationMin ? <Chip label={fmtDuration(log.durationMin)} size="sm" icon="duration" /> : null}
          {log.strength.length ? <Chip label={`${log.strength.reduce((a, s) => a + s.sets.length, 0)} set`} size="sm" icon="volume" /> : null}
          {log.rpe ? <Chip label={`RPE ${log.rpe}`} size="sm" /> : null}
        </View>
        <Text variant="body" color="inkMuted">
          Kaslar şimdi şarj oluyor. Yarın görüşürüz.
        </Text>
      </Card>
    );
  }
  if (log?.isOffDay) {
    return (
      <Card variant="muted" onPress={onOpenProgram} style={styles.min} testID="home-today">
        <Row icon="skip" eyebrow="Bugün" title="Bugün atlandı" body="Sorun değil, program kaldığı yerden devam eder." />
      </Card>
    );
  }
  if (day.kind === "rest") {
    return (
      <Card variant="muted" onPress={onOpenProgram} style={styles.min} testID="home-today">
        <Row icon="rest" eyebrow="Bugün" title="Dinlenme günü" body="Kaslar dinlenirken büyür. Hafif yürüyüş, bol su, iyi uyku." />
      </Card>
    );
  }
  const count = day.kind === "strength" ? `${day.exercises.length} hareket` : day.run ? `${day.run.targetKm} km` : day.swim ? `${day.swim.targetKm} km` : "";
  const est = day.kind === "strength" ? `~${Math.round(day.exercises.reduce((a, e) => a + e.targetSets, 0) * 2.6)} dk` : day.run ? `~${day.run.targetMin} dk` : "";
  return (
    <Card style={styles.min} testID="home-today">
      <View style={styles.rowWrap}>
        <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
          <Icon icon="workout" size={18} color="primary" />
        </View>
        <View style={styles.rowTexts}>
          <Text variant="label" color="inkMuted">
            Bugünün antrenmanı
          </Text>
          <Text variant="heading" numberOfLines={1}>
            {day.title}
          </Text>
          {day.focus || count || est ? (
            <Text variant="body" color="inkMuted" numberOfLines={1}>
              {[day.focus, count, est].filter(Boolean).join(", ")}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.cta}>
        <Button label="Antrenmana başla" onPress={onOpenProgram} icon="start" full testID="home-start-workout" />
      </View>
    </Card>
  );
}

function Row({ icon, eyebrow, title, body }: { icon: AppIcon; eyebrow: string; title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.rowWrap}>
      <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
        <Icon icon={icon} size={18} color="primary" />
      </View>
      <View style={styles.rowTexts}>
        <Text variant="label" color="inkMuted">
          {eyebrow}
        </Text>
        <Text variant="heading">{title}</Text>
        <Text variant="body" color="inkMuted">
          {body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  min: { minHeight: HOME_HEIGHTS.today, justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  badge: { width: 36, height: 36, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  title: { marginTop: spacing.sm },
  chips: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm, flexWrap: "wrap" },
  cta: { marginTop: spacing.lg },
  rowWrap: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  rowTexts: { flex: 1, gap: spacing.xs },
});
