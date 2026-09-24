import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { MIN_SAFE_BODY_FAT } from "@fitfloow/core";
import { todayKey } from "../../../lib/dates";
import { fmtInt } from "../../../lib/format";
import { Floo } from "../../../mascot";
import { spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Screen } from "../../../ui/Screen";
import { SuccessCheck } from "../../../ui/SuccessCheck";
import { Text } from "../../../ui/Text";
import { gainCalories, maintenanceEnergy, summaryOf } from "../../goals/goalIntent";
import { instantPlan } from "../../goals/goalMath";
import type { OnboardingDraft } from "../model";

/**
 * The plan in one sentence, then the door into the app.
 *
 * The sentence is C4's `summaryTr` shape, composed locally from the same engine the server ran, so
 * what someone reads here is exactly what the home screen will keep telling them.
 */
export function DoneStep({ draft, bodyFatPct, onFinish }: { draft: OnboardingDraft; bodyFatPct: number | null; onFinish: () => void }) {
  const reduce = useReducedMotion();
  const sentence = useMemo(() => summarise(draft, bodyFatPct), [draft, bodyFatPct]);

  return (
    <Screen tabBar={false} edges={["top", "bottom"]} contentStyle={styles.content} testID="onboarding-done">
      <View style={styles.hero}>
        <SuccessCheck size={80} />
        <Text variant="display" align="center">
          Planın hazır
        </Text>
        <Text variant="title" color="inkMuted" align="center" tabular testID="done-summary">
          {sentence}
        </Text>
      </View>
      <View style={styles.footer}>
        <View style={styles.flooRow}>
          <Floo mood="cheer" size="m" animate={!reduce} testID="done-floo" />
          <Text variant="body" color="inkMuted" style={styles.flooText}>
            Her gün ne yaptığını buradan takip edeceğim. Ana sayfa hedefini hep önünde tutacak.
          </Text>
        </View>
        <Button label="Başlayalım" onPress={onFinish} full size="lg" iconRight="next" testID="done-start" />
      </View>
    </Screen>
  );
}

function summarise(draft: OnboardingDraft, bodyFatPct: number | null): string {
  const { intent, targetBodyFatPct, profile } = draft.goal;
  const p = draft.profile;
  const weightKg = draft.measurement.weightKg;
  if (bodyFatPct === null || weightKg === null || !p.gender || p.heightCm === null) {
    return "Ölçümün kaydedildi. Hedefini istediğin an Vücut sekmesinden koyabilirsin.";
  }
  if (intent === "lose" && targetBodyFatPct !== null && targetBodyFatPct >= MIN_SAFE_BODY_FAT[p.gender]) {
    try {
      return summaryOf(
        instantPlan({
          sex: p.gender,
          weightKg,
          bodyFatPct,
          heightCm: p.heightCm,
          birthDate: p.birthDate,
          activityLevel: p.activityLevel ?? "moderate",
          targetBodyFatPct,
          profile,
          todayKey: todayKey(),
        })
      );
    } catch {
      return "Planın kaydedildi. Ayrıntıları yol haritasında bulacaksın.";
    }
  }
  const energy = maintenanceEnergy({
    sex: p.gender,
    weightKg,
    bodyFatPct,
    heightCm: p.heightCm,
    birthDate: p.birthDate,
    activityLevel: p.activityLevel ?? "moderate",
    todayKey: todayKey(),
  });
  const maintenance = Math.round(energy.maintenance / 10) * 10;
  return intent === "gain"
    ? `Günde ${fmtInt(gainCalories(maintenance))} kcal ile kas yapmaya başlıyoruz. Kilonu koruyan seviye ${fmtInt(maintenance)} kcal.`
    : `Günde ${fmtInt(maintenance)} kcal ile formunu koruyoruz. Hedef koymak istersen Vücut sekmesinde seni bekliyor.`;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: "space-between", paddingVertical: spacing.xxl },
  hero: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.lg },
  footer: { gap: spacing.xl },
  flooRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  flooText: { flex: 1 },
});
