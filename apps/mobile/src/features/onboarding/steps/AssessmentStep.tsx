import React, { forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import type { BodyAssessment, FfmiBand } from "@fitfloow/core";
import { fmtKg, fmtNumber, fmtPct } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Divider } from "../../../ui/Divider";
import { ProgressBar } from "../../../ui/ProgressBar";
import { Text } from "../../../ui/Text";

/** What an FFMI band means for this person, in one plain sentence. */
export const FFMI_MEANING_TR: Record<FfmiBand, string> = {
  low: "Kas kütlen ortalamanın altında; en hızlı kazanımlar önünde.",
  average: "Kas kütlen ortalama; düzenli antrenmanla rahatça artar.",
  good: "Kas temelin iyi; üstüne koymak artık daha planlı ilerler.",
  advanced: "Kas kütlen ileri düzeyde; kazanımlar yavaş ama değerli.",
  nearLimit: "Doğal sınıra çok yakınsın; yağ oranı ince ayarı daha verimli.",
};

/**
 * Stage 5 — "Mevcut durumun": body fat, lean mass and FFMI read together, exactly as core's
 * `assessBody` reads them. Floo says the verdict; the card shows the numbers behind it.
 */
export const AssessmentStep = forwardRef<View, { assessment: BodyAssessment | null }>(function AssessmentStep({ assessment: a }, ref) {
  const { colors } = useTheme();
  if (!a) {
    return (
      <Text variant="body" color="inkMuted" testID="ob-assessment-missing">
        Ölçülerin eksik; bir adım geri dönüp tamamlayalım.
      </Text>
    );
  }
  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="ob-assessment"
      accessibilityLabel={`Mevcut durumun. Yağ oranı ${fmtPct(a.bodyFatPct)}, ${a.bodyFatBandTr}. Yağsız kütle ${fmtKg(a.leanMassKg)}. FFMI ${fmtNumber(a.ffmi)}, ${a.ffmiBandTr}.`}
    >
      <Text variant="heading" accessibilityRole="header">
        Mevcut durumun
      </Text>

      <View style={styles.tiles}>
        <Tile label="Yağ oranı" value={fmtPct(a.bodyFatPct)} caption={a.bodyFatBandTr} testID="ob-assess-bf" />
        <Tile label="Yağsız kütle" value={fmtKg(a.leanMassKg)} caption={`${fmtKg(a.fatMassKg)} yağ`} testID="ob-assess-lean" />
      </View>

      <Divider />

      <View style={styles.ffmi}>
        <View style={styles.ffmiHead}>
          <Text variant="label" color="inkMuted">
            FFMI · kas kütlesi endeksi
          </Text>
          <Text variant="number" tabular testID="ob-assess-ffmi">
            {fmtNumber(a.ffmi)}
          </Text>
        </View>
        <ProgressBar value={a.ffmiGauge / 100} height={8} accessibilityLabel={`FFMI ${fmtNumber(a.ffmi)}, doğal sınır ${fmtNumber(a.ffmiCeiling, 0)}`} />
        <View style={styles.ffmiHead}>
          <Text variant="label" tone="primary" testID="ob-assess-ffmi-band">
            {a.ffmiBandTr}
          </Text>
          <Text variant="caption" color="inkSubtle" tabular>
            doğal sınır ~{fmtNumber(a.ffmiCeiling, 0)}
          </Text>
        </View>
        <Text variant="body" color="inkMuted" testID="ob-assess-meaning">
          {FFMI_MEANING_TR[a.ffmiBand]}
        </Text>
      </View>
    </View>
  );
});

function Tile({ label, value, caption, testID }: { label: string; value: string; caption: string; testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.surfaceMuted }]}>
      <Text variant="label" color="inkMuted">
        {label}
      </Text>
      <Text variant="display" tabular testID={testID}>
        {value}
      </Text>
      <Text variant="caption" color="inkMuted">
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: spacing.lg, gap: spacing.lg },
  tiles: { flexDirection: "row", gap: spacing.sm },
  tile: { flex: 1, borderRadius: radii.md, padding: spacing.md, gap: 2 },
  ffmi: { gap: spacing.sm },
  ffmiHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
});
