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

export const TODAY_HERO_MIN_HEIGHT = 248;

export const KIND_ICON: Record<DayDTO["kind"], AppIcon> = {
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

export interface TodayHeroProps {
  day: DayDTO | null;
  todayLog: WorkoutLogDTO | null;
  /** "6. döngü · 2/6. gün" / "Perşembe · 4. hafta". */
  eyebrow: string;
  resume?: ResumeState | null;
  busy?: boolean;
  onStart: () => void;
  /** "Dinlendim": the rest day is done through `logDay`, the cycle moves on. */
  onRestDone: () => void;
  /** "Bugün başka bir şey yaptım". */
  onOther: () => void;
  /** "Ara ver": a break, the planned day stays next. */
  onBreak: () => void;
  onUndo: () => void;
  onOpenLog: (log: WorkoutLogDTO) => void;
}

/**
 * Today, big: the one card that says what to do and holds the tab's single primary action. The
 * way out of the plan ("başka bir şey yaptım") sits right under it on every state, because that
 * is when people need it — not in a menu.
 */
export function TodayHero(props: TodayHeroProps) {
  const { day, todayLog } = props;
  if (todayLog) return isBreakLog(todayLog) ? <BreakCard {...props} log={todayLog} /> : <DoneCard {...props} log={todayLog} />;
  if (!day) return null;
  if (day.kind === "rest") return <RestCard {...props} day={day} />;
  return <DueCard {...props} day={day} />;
}

function DueCard({ day, eyebrow, resume, busy, onStart, onOther, onBreak }: TodayHeroProps & { day: DayDTO }) {
  const { colors } = useTheme();
  const counts = dayCounts(day);
  return (
    <Card variant="primary" style={styles.card} testID="current-day-card">
      <View style={styles.head}>
        <Text variant="label" color="onPrimaryMuted" tabular testID="today-eyebrow">
          Bugün · {eyebrow}
        </Text>
        <Icon icon={KIND_ICON[day.kind]} size={20} color="onPrimaryMuted" />
      </View>
      <Text variant="display" color="onPrimary" numberOfLines={2} style={styles.bigTitle} testID="today-title">
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
          {day.exercises.slice(0, 4).map((e, i) => (
            <View key={`${e.name}-${i}`} style={styles.exerciseRow}>
              <Text variant="body" color="onPrimary" numberOfLines={1} style={styles.shrink}>
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

      <Button
        label={resume ? "Antrenmana devam et" : "Antrenmana başla"}
        variant="inverse"
        size="lg"
        icon={resume ? "play-forward" : "play"}
        onPress={onStart}
        disabled={busy}
        full
        testID="start-workout"
        style={styles.cta}
      />
      {/* On the blue card the secondary affordances are surface pills — ghost ink would sink into the fill. */}
      <View style={styles.secondaryRow}>
        <Chip label="Başka bir şey yaptım" icon="shuffle-outline" onPress={onOther} disabled={busy} testID="other-day" />
        <Chip label="Ara ver" icon="skip" onPress={onBreak} disabled={busy} testID="skip-day" />
      </View>
    </Card>
  );
}

function RestCard({ day, eyebrow, busy, onRestDone, onOther }: TodayHeroProps & { day: DayDTO }) {
  const { colors } = useTheme();
  return (
    <Card variant="muted" style={styles.card} testID="current-day-card">
      <View style={styles.head}>
        <Text variant="label" color="inkMuted" tabular testID="today-eyebrow">
          Bugün · {eyebrow}
        </Text>
        <View style={[styles.badge, { backgroundColor: colors.surface }]}>
          <Icon icon="rest" size={18} color="primary" />
        </View>
      </View>
      <Text variant="display" style={styles.bigTitle} numberOfLines={2} testID="today-title">
        {day.title && day.title !== "Dinlenme" ? day.title : "Dinlenme günü"}
      </Text>
      <Text variant="body" color="inkMuted">
        Kaslar dinlenirken büyür. Hafif yürüyüş, bol su, iyi uyku. Günü bitirince «Dinlendim» de, program sıradaki güne geçsin.
      </Text>
      <Button label="Dinlendim" variant="primary" size="lg" icon="check" onPress={onRestDone} loading={busy} full testID="rest-done" style={styles.cta} />
      <View style={styles.secondaryRow}>
        <Button label="Başka bir şey yaptım" variant="ghost" size="sm" icon="shuffle-outline" onPress={onOther} disabled={busy} testID="other-day" />
      </View>
    </Card>
  );
}

function DoneCard({ log, busy, onUndo, onOpenLog, onOther }: TodayHeroProps & { log: WorkoutLogDTO }) {
  const { colors } = useTheme();
  const s = logSummary(log);
  const rest = log.kind === "rest";
  return (
    <Card style={styles.card} testID="current-day-card">
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: colors.successSoft }]}>
          <Icon icon="check" size={18} color="success" />
        </View>
        <Text variant="label" tone="success">
          {rest ? "Dinlenme tamam" : "Bugün tamamlandı"}
        </Text>
      </View>
      <Text variant="display" numberOfLines={2} style={styles.bigTitle} testID="today-title">
        {log.title}
      </Text>
      {rest ? (
        <Text variant="body" color="inkMuted">
          Program sıradaki güne geçti. Yarın görüşürüz.
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
        {!rest ? <Button label="Detay" variant="ghost" size="sm" icon="notes" onPress={() => onOpenLog(log)} testID="open-today-log" /> : null}
        <Button label="Geri al" variant="ghost" size="sm" icon="undo" onPress={onUndo} disabled={busy} testID="undo-today" />
        <Button label="Başka gün" variant="ghost" size="sm" icon="shuffle-outline" onPress={onOther} disabled={busy} testID="other-day" />
      </View>
    </Card>
  );
}

function BreakCard({ log, busy, onUndo, onOther }: TodayHeroProps & { log: WorkoutLogDTO }) {
  const { colors } = useTheme();
  return (
    <Card style={styles.card} testID="current-day-card">
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: colors.warningSoft }]}>
          <Icon icon="skip" size={18} color="warning" />
        </View>
        <Text variant="label" tone="warning">
          Bugün atlandı
        </Text>
      </View>
      <Text variant="display" numberOfLines={2} style={styles.bigTitle} testID="today-title">
        {log.title}
      </Text>
      <Text variant="body" color="inkMuted">
        Sorun değil. Bu gün sırada kalıyor, yarın buradan devam ederiz.
      </Text>
      <Divider />
      <View style={styles.secondaryRow}>
        <Button label="Geri al" variant="ghost" size="sm" icon="undo" onPress={onUndo} disabled={busy} testID="undo-today" />
        <Button label="Başka bir şey yaptım" variant="ghost" size="sm" icon="shuffle-outline" onPress={onOther} disabled={busy} testID="other-day" />
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
  card: { minHeight: TODAY_HERO_MIN_HEIGHT, gap: spacing.sm, justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  bigTitle: { fontSize: 34, lineHeight: 40 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.xs },
  meta: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  exerciseList: { gap: spacing.xs, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  exerciseRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  shrink: { flexShrink: 1 },
  resume: { gap: spacing.xs, marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  resumeHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  bar: { height: 6, borderRadius: radii.pill, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: radii.pill },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  cta: { marginTop: spacing.md },
  secondaryRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  badge: { width: 32, height: 32, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
});
