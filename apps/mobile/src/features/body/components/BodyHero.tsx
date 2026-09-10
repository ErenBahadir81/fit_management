import React from "react";
import { StyleSheet, View } from "react-native";
import { BODY_FAT_CATEGORY_TR, type BodySummary, type BodyTrends } from "@fitfloow/core";
import { fmtCm, fmtDelta, fmtKg, fmtNumber, fmtPct } from "../../../lib/format";
import { Floo } from "../../../mascot/Floo";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Divider } from "../../../ui/Divider";
import { EmptyState } from "../../../ui/EmptyState";
import { Text } from "../../../ui/Text";
import { CountUp } from "../../reports/components/CountUp";
import { BF_UNCERTAINTY } from "../bodyMath";
import { BODY_HEIGHTS } from "../BodySkeleton";

const fmt1 = (v: number) => fmtNumber(v, 1);

/** Hero: trend (EWMA) weight as a rolling numeral, 7-day delta, bf % pill with its uncertainty, lean mass, waist. */
export function BodyHero({ summary, trends }: { summary: BodySummary; trends?: BodyTrends }) {
  const { colors } = useTheme();
  const weight = summary.ewmaWeightKg ?? summary.latestWeighIn?.weightKg ?? summary.latest?.weightKg ?? null;
  const latest = summary.latest;
  const delta7 = trends?.summary.weightDelta7d ?? null;

  if (weight === null && !latest) {
    return (
      <Card variant="muted" style={styles.min} testID="body-hero">
        <EmptyState compact illustration={<Floo mood="think" size="s" />} title="İlk tartını gir" body="Sabah, aç karnına. Trend birkaç günde belirir." />
      </Card>
    );
  }

  const category = summary.category ? BODY_FAT_CATEGORY_TR[summary.category] : null;
  const deltaTone = delta7 === null ? "neutral" : delta7 < -0.05 ? "success" : delta7 > 0.05 ? "warning" : "neutral";

  return (
    <Card style={styles.min} testID="body-hero" accessibilityLabel={`Trend kilo ${fmtKg(weight)}${latest ? `, yağ oranı ${fmtPct(latest.bodyFatPct)}` : ""}`}>
      <View style={styles.head}>
        <Text variant="label" color="inkMuted">
          Trend kilo
        </Text>
        {category ? <Chip label={category} tone="primary" size="sm" /> : null}
      </View>
      <View style={styles.heroRow}>
        <CountUp value={weight ?? 0} from={Math.max(0, (weight ?? 0) - 1.2)} format={fmt1} variant="hero" testID="body-hero-weight" />
        <Text variant="heading" color="inkMuted" style={styles.unit}>
          kg
        </Text>
      </View>
      <Text variant="body" tone={deltaTone} tabular testID="body-hero-delta">
        {delta7 === null ? "7 günlük değişim için birkaç tartı daha" : `7 günde ${fmtDelta(delta7, "kg")}`}
      </Text>
      <Divider style={styles.divider} />
      <View style={styles.stats}>
        <View style={[styles.pill, { backgroundColor: colors.primarySoft }]} testID="body-bf-pill" accessibilityLabel={latest ? `Yağ oranı ${fmtPct(latest.bodyFatPct)}, artı eksi ${fmtNumber(BF_UNCERTAINTY, 1)}` : "Yağ oranı ölçülmedi"}>
          <Text variant="caption" color="inkMuted">
            Yağ oranı
          </Text>
          <View style={styles.pillRow}>
            <Text variant="heading" tone="primary" tabular>
              {fmtPct(latest?.bodyFatPct)}
            </Text>
            {latest ? (
              <Text variant="caption" color="inkSubtle" tabular>
                ±{fmtNumber(BF_UNCERTAINTY, 1)}
              </Text>
            ) : null}
          </View>
        </View>
        <Stat label="Yağsız kütle" value={fmtKg(latest?.leanMassKg)} />
        <Stat label="Bel" value={fmtCm(latest?.waistCm, 0)} />
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
      <Text variant="title" tabular numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  min: { minHeight: BODY_HEIGHTS.hero, justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginTop: spacing.xs },
  unit: { marginBottom: 2 },
  divider: { marginVertical: spacing.md },
  stats: { flexDirection: "row", alignItems: "stretch", gap: spacing.md },
  pill: { flex: 1.3, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: 2 },
  pillRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs },
  stat: { flex: 1, gap: 2, justifyContent: "center" },
});
