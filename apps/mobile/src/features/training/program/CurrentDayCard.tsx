import React from "react";
import { StyleSheet, View } from "react-native";
import { clamp, isBreakLog, type DayDTO, type WorkoutLogDTO } from "@fitfloow/core";
import { fmtDuration, fmtInt, fmtNumber } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Divider } from "../../../ui/Divider";
import { Icon } from "../../../ui/Icon";
import type { AppIcon } from "../../../ui/icons";
import { Text } from "../../../ui/Text";
import { dayCounts, logSummary } from "../lib/present";

export const DAY_CARD_MIN_HEIGHT = 260;

const KIND_ICON: Record<DayDTO["kind"], AppIcon> = {
  strength: "strength",
  run: "run",
  swim: "swim",
  stretch: "stretch",
  rest: "rest",
};

/** A session left open on this device — the card offers to carry on rather than to start over. */
export interface ResumeState {
  doneSets: number;
  totalSets: number;
}

export interface CurrentDayCardProps {
  day: DayDTO | null;
  todayLog: WorkoutLogDTO | null;
  cycleNumber: number;
  resume?: ResumeState | null;
  busy?: boolean;
  onStart: () => void;
  onSkip: () => void;
  onJump: () => void;
  onUndo: () => void;
  onOpenLog: (log: WorkoutLogDTO) => void;
}

/** The one card that says what to do today — and holds the screen's single primary action. */
export function CurrentDayCard({ day, todayLog, cycleNumber, resume, busy, onStart, onSkip, onJump, onUndo, onOpenLog }: CurrentDayCardProps) {
  if (todayLog) return <DoneCard log={todayLog} busy={busy} onUndo={onUndo} onOpenLog={onOpenLog} onJump={onJump} />;
  if (!day) return null;
  if (day.kind === "rest") return <RestCard day={day} busy={busy} onSkip={onSkip} onJump={onJump} />;
  return <DueCard day={day} cycleNumber={cycleNumber} resume={resume ?? null} busy={busy} onStart={onStart} onSkip={onSkip} onJump={onJump} />;
}

function DueCard({
  day,
  cycleNumber,
  resume,
  busy,
  onStart,
  onSkip,
  onJump,
}: {
  day: DayDTO;
  cycleNumber: number;
  resume: ResumeState | null;
  busy?: boolean;
  onStart: () => void;
  onSkip: () => void;
  onJump: () => void;
}) {
  const { colors } = useTheme();
  const counts = dayCounts(day);
  return (
    <Card variant="primary" style={styles.card} testID="current-day-card">
      <View style={styles.head}>
        <Text variant="label" color="onPrimaryMuted" tabular>
          {cycleNumber}. hafta · {day.order}. gün
        </Text>
        <Icon icon={KIND_ICON[day.kind]} size={18} color="onPrimaryMuted" />
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
        {counts.exercises > 0 ? <Meta icon="exercises" label={`${counts.exercises} hareket`} /> : null}
        {counts.sets > 0 ? <Meta icon="sets" label={`${counts.sets} set`} /> : null}
        {counts.km > 0 ? <Meta icon="distance" label={`${fmtNumber(counts.km, 1)} km`} /> : null}
        {counts.estimateMin > 0 ? <Meta icon="duration" label={`~${counts.estimateMin} dk`} /> : null}
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
          {day.run ? <Chip label={`Koşu ${fmtNumber(day.run.targetKm, 1)} km · ${day.run.targetMin} dk`} size="sm" icon="distance" /> : null}
          {day.swim ? <Chip label={`Yüzme ${fmtNumber(day.swim.targetKm, 1)} km · ${day.swim.targetMin} dk`} size="sm" icon="swim" /> : null}
        </View>
      ) : null}

      {resume ? (
        <View style={[styles.resume, { borderTopColor: colors.onPrimaryBorder }]} testID="resume-progress">
          <View style={styles.resumeHead}>
            <Text variant="label" color="onPrimary">
              Yarım kalan antrenman
            </Text>
            <Text variant="label" color="onPrimaryMuted" tabular>
              {resume.doneSets}/{resume.totalSets} set
            </Text>
          </View>
          <OnPrimaryBar value={resume.totalSets > 0 ? resume.doneSets / resume.totalSets : 0} label={`${resume.doneSets} / ${resume.totalSets} set tamam`} />
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={resume ? "Antrenmana devam et" : "Antrenmana başla"}
          variant="inverse"
          icon={resume ? "play-forward" : "play"}
          onPress={onStart}
          disabled={busy}
          testID="start-workout"
          style={styles.grow}
        />
      </View>
      {/* On the blue card the secondary affordances are surface pills — `ghost` ink would sink into the gradient. */}
      <View style={styles.secondaryRow}>
        <Chip label="Atla" icon="skip" onPress={onSkip} disabled={busy} testID="skip-day" />
        <Chip label="Buradan devam et" icon="reorder" onPress={onJump} disabled={busy} testID="jump-day" />
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
          <Icon icon="rest" size={18} color="primary" />
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
        <Button label="Dinlendim, devam et" variant="secondary" icon="check" onPress={onSkip} disabled={busy} testID="skip-day" style={styles.grow} />
      </View>
      <View style={styles.secondaryRow}>
        <Button label="Buradan devam et" variant="ghost" size="sm" icon="reorder" onPress={onJump} disabled={busy} testID="jump-day" />
      </View>
    </Card>
  );
}

function DoneCard({ log, busy, onUndo, onOpenLog, onJump }: { log: WorkoutLogDTO; busy?: boolean; onUndo: () => void; onOpenLog: (l: WorkoutLogDTO) => void; onJump: () => void }) {
  const { colors } = useTheme();
  const s = logSummary(log);
  // A break is "skipped"; a rest day that was done is a done day like any other.
  const skipped = isBreakLog(log);
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
          {s.tonnageKg > 0 ? <Chip label={`${fmtInt(s.tonnageKg)} kg`} size="sm" icon="strength" tone="primary" /> : null}
          {s.sets > 0 ? <Chip label={`${s.sets} set`} size="sm" icon="sets" /> : null}
          {s.km > 0 ? <Chip label={`${fmtNumber(s.km, 1)} km`} size="sm" icon="distance" /> : null}
          {log.durationMin ? <Chip label={fmtDuration(log.durationMin)} size="sm" icon="duration" /> : null}
          {log.rpe ? <Chip label={`RPE ${log.rpe}`} size="sm" tone="primary" /> : null}
        </View>
      )}
      <Divider />
      <View style={styles.secondaryRow}>
        {!skipped ? <Button label="Detay" variant="ghost" size="sm" icon="notes" onPress={() => onOpenLog(log)} testID="open-today-log" /> : null}
        <Button label="Geri al" variant="ghost" size="sm" icon="undo" onPress={onUndo} disabled={busy} testID="undo-today" />
        <Button label="Gün seç" variant="ghost" size="sm" icon="reorder" onPress={onJump} disabled={busy} testID="jump-day" />
      </View>
    </Card>
  );
}

/** The shared ProgressBar paints itself for the app background; on the blue card it would vanish. */
function OnPrimaryBar({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp(value, 0, 1) * 100) }}
      style={[styles.bar, { backgroundColor: colors.onPrimaryBorder }]}
    >
      <View style={[styles.barFill, { width: `${clamp(value, 0, 1) * 100}%`, backgroundColor: colors.onPrimary }]} />
    </View>
  );
}

function Meta({ icon, label }: { icon: AppIcon; label: string }) {
  return (
    <View style={styles.meta}>
      <Icon icon={icon} size={14} color="onPrimaryMuted" />
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
  resume: { gap: spacing.xs, marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  resumeHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  bar: { height: 6, borderRadius: radii.pill, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: radii.pill },
  exerciseRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  actions: { flexDirection: "row", marginTop: spacing.md },
  grow: { flex: 1 },
  secondaryRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  badge: { width: 32, height: 32, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
});
