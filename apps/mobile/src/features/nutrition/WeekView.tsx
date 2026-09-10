import React from "react";
import { StyleSheet, View } from "react-native";
import { WEEKDAYS_TR_SHORT, keyWeekday, type WeekNutrition } from "@fitfloow/core";
import { BarWeek } from "../../charts/BarWeek";
import { fmtInt, fmtPct } from "../../lib/format";
import { todayKey } from "../../lib/dates";
import { radii, spacing } from "../../theme/tokens";
import { Card } from "../../ui/Card";
import { Chip } from "../../ui/Chip";
import { Entry } from "../../ui/Entry";
import { Skeleton, SkeletonGroup } from "../../ui/Skeleton";
import { StatTile } from "../../ui/StatTile";
import { Text } from "../../ui/Text";

/** Some backends answer 0..1, the fake answers 0..100 — show a percentage either way. */
export function adherencePct(adherence: number): number {
  if (!Number.isFinite(adherence) || adherence <= 0) return 0;
  return adherence <= 1 ? Math.round(adherence * 100) : Math.round(adherence);
}

export function WeekView({ week }: { week: WeekNutrition }) {
  const today = todayKey();
  const target = week.days[0]?.target ?? 0;
  const days = week.days.map((d) => ({ label: WEEKDAYS_TR_SHORT[keyWeekday(d.dateKey)], value: d.totals.kcal, logged: d.logged }));
  const todayIndex = week.days.findIndex((d) => d.dateKey === today);
  const pct = adherencePct(week.adherence);
  const tone = pct >= 70 ? "success" : pct >= 40 ? "warning" : "danger";

  return (
    <View style={styles.stack} testID="nutrition-week">
      <Entry index={0}>
        <Card>
          <View style={styles.head}>
            <Text variant="title">Bu hafta</Text>
            <Chip testID="week-adherence" label={`${fmtPct(pct, 0)} hedefte`} size="sm" tone={tone} />
          </View>
          <View style={styles.chart}>
            <BarWeek testID="week-bars" days={days} target={target} todayIndex={todayIndex === -1 ? null : todayIndex} height={140} />
          </View>
        </Card>
      </Entry>
      <Entry index={1}>
        <View style={styles.tiles}>
          <StatTile testID="week-avg" label="Ortalama" value={fmtInt(week.avg.kcal)} hint="kcal / gün" icon="flame-outline" style={styles.grow} />
          <StatTile testID="week-logged" label="Kayıtlı gün" value={`${fmtInt(week.daysLogged)}/7`} hint="bu hafta" icon="calendar-outline" style={styles.grow} />
        </View>
      </Entry>
      <Entry index={2}>
        <Card variant="muted">
          <Text variant="label" color="inkMuted">
            Ortalama makrolar
          </Text>
          <Text variant="title" tabular>
            P {fmtInt(week.avg.protein)} g · K {fmtInt(week.avg.carbs)} g · Y {fmtInt(week.avg.fat)} g
          </Text>
        </Card>
      </Entry>
    </View>
  );
}

export function WeekSkeleton() {
  return (
    <SkeletonGroup style={styles.stack} testID="nutrition-week-skeleton">
      <Skeleton height={232} radius={radii.card} />
      <View style={styles.tiles}>
        <Skeleton height={92} radius={radii.md} style={styles.grow} />
        <Skeleton height={92} radius={radii.md} style={styles.grow} />
      </View>
      <Skeleton height={92} radius={radii.card} />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  chart: { marginTop: spacing.lg },
  tiles: { flexDirection: "row", gap: spacing.md },
  grow: { flex: 1 },
});
