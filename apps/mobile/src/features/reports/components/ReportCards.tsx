import React from "react";
import { StyleSheet, View } from "react-native";
import type { MuscleVolume, WeeklyReportDTO } from "@fitfloow/core";
import { fmtCm, fmtDate, fmtDelta, fmtInt, fmtKcal, fmtKg, fmtNumber, fmtPct } from "../../../lib/format";
import { Floo } from "../../../mascot/Floo";
import { SpeechBubble } from "../../../mascot/SpeechBubble";
import { useTheme } from "../../../theme/ThemeProvider";
import { spacing, type Tone } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Icon, type IconName } from "../../../ui/Icon";
import { ProgressBar } from "../../../ui/ProgressBar";
import { Ring } from "../../../ui/Ring";
import { Text } from "../../../ui/Text";
import { ON_TRACK_TR } from "../../home/components/GoalCard";
import { deficitBars, deficitSentence, scoreTone, scoreWord, trainingRatio, weekLabel } from "../reportMath";
import { REPORT_HEIGHTS } from "../ReportSkeleton";
import { CountUp } from "./CountUp";
import { DeficitBars } from "./DeficitBars";

const fmt0 = (v: number) => fmtNumber(v, 0);

/* ------------------------------- hero ------------------------------- */

export function ScoreHero({ report, mascotEnabled }: { report: WeeklyReportDTO; mascotEnabled: boolean }) {
  const { colors } = useTheme();
  const tone = scoreTone(report.score);
  const elapsed = report.dayIndexToday === null ? 7 : report.dayIndexToday + 1;
  return (
    <Card style={styles.hero} testID="report-hero" accessibilityLabel={`Haftalık puan ${Math.round(report.score)}, ${scoreWord(report.score)}`}>
      <View style={styles.heroRow}>
        <Ring value={report.score / 100} size={132} tone={tone} gradient={tone === "primary"} testID="report-score-ring">
          <CountUp value={report.score} format={fmt0} variant="hero" testID="report-score" />
          <Text variant="caption" color="inkMuted">
            puan
          </Text>
        </Ring>
        <View style={styles.heroTexts}>
          <Text variant="heading">{scoreWord(report.score)}</Text>
          <Text variant="body" color="inkMuted" tabular>
            {weekLabel(report.weekKey)}
          </Text>
          <View style={styles.heroChips}>
            {report.isCurrent ? <Chip label="Canlı" tone="success" size="sm" dot={colors.success} testID="report-live" /> : <Chip label="Tamamlandı" size="sm" />}
            <Text variant="caption" color="inkSubtle" tabular>
              {elapsed}/7 gün
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.mascotRow}>
        {mascotEnabled ? <Floo mood={report.mascot.mood} size="s" testID="report-floo" /> : null}
        <SpeechBubble text={report.mascot.text || "Haftanın özeti hazır."} tail={mascotEnabled ? "left" : "none"} style={styles.bubble} testID="report-bubble" />
      </View>
    </Card>
  );
}

/* ------------------------------ deficit ----------------------------- */

export function DeficitCard({ report }: { report: WeeklyReportDTO }) {
  const { bars, plannedPerDay } = deficitBars(report);
  const n = report.nutrition;
  const elapsed = report.dayIndexToday === null ? 7 : report.dayIndexToday + 1;
  const banked = n.deficitBankedKcal;
  return (
    <Card style={styles.deficit} testID="report-deficit">
      <Text variant="label" color="inkMuted">
        Kalori açığı
      </Text>
      <Text variant="title" style={styles.sentence} testID="report-deficit-sentence">
        {deficitSentence(report, fmtKcal, fmtKg)}
      </Text>
      <DeficitBars bars={bars} plannedPerDay={plannedPerDay} testID="report-deficit-bars" />
      <View style={styles.footer}>
        <Foot label="Planlanan" value={n.deficitPlannedKcal > 0 ? fmtKcal(n.deficitPlannedKcal) : "—"} />
        <Foot label="Gerçekleşen" value={fmtKcal(banked)} tone={banked >= 0 ? "success" : "danger"} />
        <Foot label="Kayıt" value={`${n.daysLogged}/${elapsed} gün`} />
      </View>
    </Card>
  );
}

/* -------------------------------- body ------------------------------ */

export function BodyReportCard({ report }: { report: WeeklyReportDTO }) {
  const b = report.body;
  const delta = b.ewmaDelta;
  const expected = b.expectedDelta;
  const tone: Tone = delta === null ? "neutral" : expected === null ? (delta <= 0 ? "success" : "warning") : delta <= expected + 0.2 ? "success" : "warning";
  return (
    <Card style={styles.body} testID="report-body">
      <View style={styles.head}>
        <Text variant="label" color="inkMuted">
          Vücut
        </Text>
        <Text variant="caption" color="inkSubtle" tabular>
          {b.weighInDays}/7 tartı{b.hasMeasurement ? " · ölçüm var" : ""}
        </Text>
      </View>
      {delta === null ? (
        <Text variant="body" color="inkMuted" style={styles.sentence}>
          Bu hafta trend için yeterli tartı yok. Sabahları bir kez tart, gerisini ben hallederim.
        </Text>
      ) : (
        <View style={styles.trendRow}>
          <View style={styles.trendMain}>
            <Text variant="caption" color="inkMuted">
              Trend kilo
            </Text>
            <Text variant="display" tone={tone} tabular testID="report-ewma-delta">
              {fmtDelta(delta, "kg", 2)}
            </Text>
            <Text variant="caption" color="inkSubtle" tabular>
              {expected !== null ? `beklenen ${fmtDelta(expected, "kg", 2)}` : "plan yok"} · {fmtKg(b.ewmaStart, 1)} → {fmtKg(b.ewmaEnd, 1)}
            </Text>
          </View>
        </View>
      )}
      <View style={styles.footer}>
        <Foot label="Yağ oranı" value={b.bodyFatStart !== null ? `${fmtPct(b.bodyFatStart)} → ${fmtPct(b.bodyFatEnd)}` : "—"} />
        <Foot label="Bel" value={b.waistStart !== null ? `${fmtCm(b.waistStart, 0)} → ${fmtCm(b.waistEnd, 0)}` : "—"} />
        <Foot label="Tartı" value={b.weightStart !== null ? `${fmtNumber(b.weightStart, 1)} → ${fmtNumber(b.weightEnd, 1)}` : "—"} />
      </View>
    </Card>
  );
}

/* ------------------------------ training ---------------------------- */

const VOLUME_TONE: Record<MuscleVolume["status"], Tone> = { in: "success", under: "warning", over: "danger", none: "neutral" };

export function TrainingCard({ report }: { report: WeeklyReportDTO }) {
  const { colors } = useTheme();
  const t = report.training;
  const ratio = trainingRatio(t);
  const muscles = [...t.volumeByMuscle].sort((a, b) => b.done - a.done).slice(0, 8);
  return (
    <Card style={styles.training} testID="report-training">
      <View style={styles.trainRow}>
        <Ring value={ratio} size={64} stroke={6} tone={ratio >= 1 ? "success" : ratio >= 0.5 ? "primary" : "warning"} gradient={false}>
          <Text variant="label" tabular testID="report-sessions">
            {t.sessions}/{t.plannedSessions}
          </Text>
        </Ring>
        <View style={styles.trainTexts}>
          <Text variant="label" color="inkMuted">
            Antrenman
          </Text>
          <Text variant="heading" tabular>
            {t.sessions} seans
          </Text>
          <Text variant="caption" color="inkSubtle" tabular>
            {fmtInt(t.sets)} set · {fmtNumber(t.cardioKm, 1)} km kardiyo{t.offDays ? ` · ${t.offDays} atlanan` : ""}
          </Text>
        </View>
      </View>
      <View style={styles.matrix} accessibilityLabel="Kas hacmi hedeflere göre">
        {muscles.map((m) => {
          const max = Math.max(1, m.target.max);
          return (
            <View key={m.key} style={styles.muscleRow}>
              <Text variant="caption" color="inkMuted" numberOfLines={1} style={styles.muscleName}>
                {m.name}
              </Text>
              <View style={[styles.track, { backgroundColor: colors.ringTrack }]}>
                <View style={[styles.fill, { width: `${Math.min(100, (m.done / max) * 100)}%`, backgroundColor: { success: colors.success, warning: colors.warning, danger: colors.danger, neutral: colors.inkSubtle, primary: colors.primary }[VOLUME_TONE[m.status]] }]} />
                {m.target.min !== undefined ? <View style={[styles.minTick, { left: `${Math.min(100, (m.target.min / max) * 100)}%`, backgroundColor: colors.inkSubtle }]} /> : null}
              </View>
              <Text variant="caption" tone={VOLUME_TONE[m.status]} tabular style={styles.muscleValue}>
                {fmtNumber(m.done, 0)}/{m.target.min ?? m.target.max}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

/* ---------------------------- goal distance ------------------------- */

export function GoalDistanceCard({ report, onPress }: { report: WeeklyReportDTO; onPress: () => void }) {
  const { colors } = useTheme();
  const g = report.goalDistance;
  if (!g || !report.goal) {
    return (
      <Card variant="muted" onPress={onPress} style={styles.goal} testID="report-goal">
        <View style={styles.trainRow}>
          <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
            <Icon name="flag-outline" size={18} color="primary" />
          </View>
          <View style={styles.trainTexts}>
            <Text variant="heading">Hedef belirle</Text>
            <Text variant="body" color="inkMuted">
              Hedef olunca bu kart mesafeyi ve tahmini tarihi gösterir.
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color="inkSubtle" />
        </View>
      </Card>
    );
  }
  const track = ON_TRACK_TR[g.onTrack];
  return (
    <Card onPress={onPress} style={styles.goal} testID="report-goal" accessibilityLabel={`Hedefe ${fmtKg(g.kgToGo)} kaldı, ${track.label}`}>
      <View style={styles.head}>
        <Text variant="label" color="inkMuted">
          Hedefe mesafe · {fmtPct(report.goal.targetBodyFatPct, 0)}
        </Text>
        <Chip label={track.label} tone={track.tone} size="sm" testID="report-track" />
      </View>
      <Text variant="display" tabular style={styles.sentence}>
        {fmtKg(g.kgToGo)}
        <Text variant="body" color="inkMuted" tabular>
          {"  "}
          {fmtNumber(g.bfToGo, 1)} puan
        </Text>
      </Text>
      <ProgressBar value={g.percentComplete / 100} tone={track.tone === "danger" ? "warning" : track.tone} valueLabel={fmtPct(g.percentComplete, 0)} label="İlerleme" />
      <View style={styles.footer}>
        <Foot label="Plan" value={`${g.weeksRemainingPlan} hafta`} />
        <Foot label="Tahmin" value={g.weeksRemainingProjected !== null ? `${g.weeksRemainingProjected} hafta` : "—"} />
        <Foot label="Tarih" value={g.projectedDate ? fmtDate(g.projectedDate, "short") : "—"} />
      </View>
    </Card>
  );
}

/* ------------------------------ highlights -------------------------- */

const HIGHLIGHT_ICONS: IconName[] = ["barbell-outline", "flame-outline", "restaurant-outline", "trending-down-outline", "fitness-outline"];

export function Highlights({ report }: { report: WeeklyReportDTO }) {
  if (report.highlights.length === 0) return null;
  return (
    <Card style={styles.highlights} testID="report-highlights">
      <Text variant="label" color="inkMuted" style={styles.sentence}>
        Öne çıkanlar
      </Text>
      {report.highlights.map((h, i) => (
        <View key={i} style={styles.hl}>
          <Icon name={HIGHLIGHT_ICONS[i % HIGHLIGHT_ICONS.length]} size={16} color="primary" />
          <Text variant="body" style={styles.hlText}>
            {h}
          </Text>
        </View>
      ))}
    </Card>
  );
}

/* ------------------------------- shared ----------------------------- */

function Foot({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <View style={styles.foot}>
      <Text variant="caption" color="inkMuted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="bodyStrong" tone={tone} tabular numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: REPORT_HEIGHTS.hero, gap: spacing.lg },
  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  heroTexts: { flex: 1, gap: spacing.xs },
  heroChips: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  mascotRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  bubble: { flex: 1 },
  deficit: { minHeight: REPORT_HEIGHTS.deficit, gap: spacing.sm },
  sentence: { marginBottom: spacing.xs },
  footer: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  foot: { flex: 1, gap: 2 },
  body: { minHeight: REPORT_HEIGHTS.body, gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  trendRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  trendMain: { flex: 1, gap: 2 },
  training: { minHeight: REPORT_HEIGHTS.training, gap: spacing.md },
  trainRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  trainTexts: { flex: 1, gap: 2 },
  matrix: { gap: spacing.xs + 2 },
  muscleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  muscleName: { width: 76 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  minTick: { position: "absolute", top: 0, width: 2, height: "100%" },
  muscleValue: { width: 44, textAlign: "right" },
  goal: { minHeight: REPORT_HEIGHTS.goal, gap: spacing.sm },
  badge: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  highlights: { minHeight: REPORT_HEIGHTS.highlights, gap: spacing.sm },
  hl: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: 2 },
  hlText: { flex: 1 },
});
