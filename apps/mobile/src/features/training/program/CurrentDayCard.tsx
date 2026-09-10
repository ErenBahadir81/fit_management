import React from "react";
import { StyleSheet, View } from "react-native";
import type { DayDTO, WorkoutLogDTO } from "@fitfloow/core";
import { fmtDuration, fmtNumber } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Divider } from "../../../ui/Divider";
import { Icon, type IconName } from "../../../ui/Icon";
import { Text } from "../../../ui/Text";
import { dayCounts, logSummary } from "../lib/present";

export const DAY_CARD_MIN_HEIGHT = 260;

const KIND_ICON: Record<DayDTO["kind"], IconName> = {
  strength: "barbell-outline",
  run: "walk-outline",
  swim: "water-outline",
  stretch: "body-outline",
  rest: "bed-outline",
};

export interface CurrentDayCardProps {
  day: DayDTO | null;
  todayLog: WorkoutLogDTO | null;
  weekNumber: number;
  busy?: boolean;
  onStart: () => void;
  onSkip: () => void;
  onJump: () => void;
  onUndo: () => void;
  onOpenLog: (log: WorkoutLogDTO) => void;
}

/** The one card that says what to do today — and holds the screen's single primary action. */
export function CurrentDayCard({ day, todayLog, weekNumber, busy, onStart, onSkip, onJump, onUndo, onOpenLog }: CurrentDayCardProps) {
  if (todayLog) return <DoneCard log={todayLog} busy={busy} onUndo={onUndo} onOpenLog={onOpenLog} onJump={onJump} />;
  if (!day) return null;
  if (day.kind === "rest") return <RestCard day={day} busy={busy} onSkip={onSkip} onJump={onJump} />;
  return <DueCard day={day} weekNumber={weekNumber} busy={busy} onStart={onStart} onSkip={onSkip} onJump={onJump} />;
}

function DueCard({ day, weekNumber, busy, onStart, onSkip, onJump }: { day: DayDTO; weekNumber: number; busy?: boolean; onStart: () => void; onSkip: () => void; onJump: () => void }) {
  const { colors } = useTheme();
  const counts = dayCounts(day);
  return (
    <Card variant="primary" style={styles.card} testID="current-day-card">
      <View style={styles.head}>
        <Text variant="label" color="onPrimaryMuted" tabular>
          {weekNumber}. hafta · {day.order}. gün
        </Text>
        <Icon name={KIND_ICON[day.kind]} size={18} color="onPrimaryMuted" />
      </View>
      <Text variant="display" color="onPrimary" numberOfLines={2}>
        {day.title}
      </Text>
      {day.focus ? (
        <Text variant="body" color="onPrimaryMuted" numberOfLines={1}>
          {day.focus}
        </Text>
      ) : null}
      <View style={styles.metaRow}>
        {counts.exercises > 0 ? <Meta icon="list-outline" label={`${counts.exercises} hareket`} /> : null}
        {counts.sets > 0 ? <Meta icon="layers-outline" label={`${counts.sets} set`} /> : null}
        {counts.km > 0 ? <Meta icon="navigate-outline" label={`${fmtNumber(counts.km, 1)} km`} /> : null}
        {counts.estimateMin > 0 ? <Meta icon="time-outline" label={`~${counts.estimateMin} dk`} /> : null}
      </View>

      {day.exercises.length > 0 ? (
        <View style={[styles.exerciseList, { borderTopColor: colors.onPrimaryBorder }]}>
          {day.exercises.slice(0, 4).map((e) => (
            <View key={e.name} style={styles.exerciseRow}>
              <Text variant="body" color="onPrimary" numberOfLines={1}>
                {e.name}
              </Text>
              <Text variant="label" tabular color="onPrimaryMuted">
                {e.targetSets}×{e.targetReps}
                {e.metric === "time" ? " sn" : ""}
                {e.targetRIR !== null ? ` · RIR ${e.targetRIR}` : ""}
              </Text>
            </View>
          ))}
          {day.exercises.length > 4 ? (
            <Text variant="caption" color="onPrimaryMuted">
              +{day.exercises.length - 4} hareket daha
            </Text>
          ) : null}
        </View>
      ) : null}

      {day.run || day.swim ? (
        <View style={styles.chips}>
          {day.run ? <Chip label={`Koşu ${fmtNumber(day.run.targetKm, 1)} km · ${day.run.targetMin} dk`} size="sm" icon="navigate-outline" /> : null}
          {day.swim ? <Chip label={`Yüzme ${fmtNumber(day.swim.targetKm, 1)} km · ${day.swim.targetMin} dk`} size="sm" icon="water-outline" /> : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button label="Antrenmana başla" variant="inverse" icon="play" onPress={onStart} disabled={busy} testID="start-workout" style={styles.grow} />
      </View>
      {/* On the violet card the secondary affordances are light pills — `ghost` ink would sink into the gradient. */}
      <View style={styles.secondaryRow}>
        <Chip label="Atla" icon="play-skip-forward-outline" onPress={onSkip} disabled={busy} testID="skip-day" />
        <Chip label="Buradan devam et" icon="swap-vertical-outline" onPress={onJump} disabled={busy} testID="jump-day" />
      </View>
    </Card>
  );
}

function RestCard({ day, busy, onSkip, onJump }: { day: DayDTO; busy?: boolean; onSkip: () => void; onJump: () => void }) {
  const { colors } = useTheme();
  return (
    <Card variant="muted" style={styles.card} testID="current-day-card">
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: colors.surface }]}>
          <Icon name="bed-outline" size={18} color="primary" />
        </View>
        <Text variant="label" color="inkMuted" tabular>
          {day.order}. gün
        </Text>
      </View>
      <Text variant="heading">Dinlenme günü</Text>
      <Text variant="body" color="inkMuted">
        Kaslar dinlenirken büyür. Hafif yürüyüş, bol su, iyi uyku.
      </Text>
      <View style={styles.actions}>
        <Button label="Dinlendim, devam et" variant="secondary" icon="checkmark" onPress={onSkip} disabled={busy} testID="skip-day" style={styles.grow} />
      </View>
      <View style={styles.secondaryRow}>
        <Button label="Buradan devam et" variant="ghost" size="sm" icon="swap-vertical-outline" onPress={onJump} disabled={busy} testID="jump-day" />
      </View>
    </Card>
  );
}

function DoneCard({ log, busy, onUndo, onOpenLog, onJump }: { log: WorkoutLogDTO; busy?: boolean; onUndo: () => void; onOpenLog: (l: WorkoutLogDTO) => void; onJump: () => void }) {
  const { colors } = useTheme();
  const s = logSummary(log);
  const skipped = log.isOffDay;
  return (
    <Card style={styles.card} testID="current-day-card">
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: skipped ? colors.warningSoft : colors.successSoft }]}>
          <Icon name={skipped ? "play-skip-forward" : "checkmark"} size={18} color={skipped ? "warning" : "success"} />
        </View>
        <Text variant="label" tone={skipped ? "warning" : "success"}>
          {skipped ? "Bugün atlandı" : "Bugün tamamlandı"}
        </Text>
      </View>
      <Text variant="heading" numberOfLines={1}>
        {log.title}
      </Text>
      {skipped ? (
        <Text variant="body" color="inkMuted">
          Sorun değil — program kaldığı yerden devam ediyor.
        </Text>
      ) : (
        <View style={styles.chips}>
          {s.sets > 0 ? <Chip label={`${s.sets} set`} size="sm" icon="layers-outline" /> : null}
          {s.km > 0 ? <Chip label={`${fmtNumber(s.km, 1)} km`} size="sm" icon="navigate-outline" /> : null}
          {log.durationMin ? <Chip label={fmtDuration(log.durationMin)} size="sm" icon="time-outline" /> : null}
          {log.rpe ? <Chip label={`RPE ${log.rpe}`} size="sm" tone="primary" /> : null}
        </View>
      )}
      <Divider />
      <View style={styles.secondaryRow}>
        {!skipped ? <Button label="Detay" variant="ghost" size="sm" icon="reader-outline" onPress={() => onOpenLog(log)} testID="open-today-log" /> : null}
        <Button label="Geri al" variant="ghost" size="sm" icon="arrow-undo-outline" onPress={onUndo} disabled={busy} testID="undo-today" />
        <Button label="Gün seç" variant="ghost" size="sm" icon="swap-vertical-outline" onPress={onJump} disabled={busy} testID="jump-day" />
      </View>
    </Card>
  );
}

function Meta({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.meta}>
      <Icon name={icon} size={14} color="onPrimaryMuted" />
      <Text variant="caption" tabular color="onPrimaryMuted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: DAY_CARD_MIN_HEIGHT, gap: spacing.sm, justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.xs },
  meta: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  exerciseList: { gap: spacing.xs, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  exerciseRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  actions: { flexDirection: "row", marginTop: spacing.md },
  grow: { flex: 1 },
  secondaryRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  badge: { width: 32, height: 32, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
});
