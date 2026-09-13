import React from "react";
import { StyleSheet, View } from "react-native";
import type { GoalProfile, GoalWarning } from "@fitfloow/core";
import { fmtPct } from "../../../lib/format";
import { spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Text } from "../../../ui/Text";
import type { GoalIntent } from "../goalIntent";
import type { Bounds } from "../goalMath";
import type { PlansByPace } from "../useLocalPlan";
import { IntentPicker, PacePicker } from "./GoalChoosers";
import { PlanOutcome, type Outcome } from "./PlanOutcome";
import { TargetSlider } from "./TargetSlider";

export interface GoalChooserSectionProps {
  intent: GoalIntent | null;
  onIntent: (v: GoalIntent) => void;
  target: number | null;
  bounds: Bounds;
  onTarget: (v: number) => void;
  pace: GoalProfile;
  onPace: (v: GoalProfile) => void;
  plans: PlansByPace;
  todayKey: string;
  /** Calories that hold the current weight, for the two intents that are not a fat-loss goal. */
  maintenanceCalories: number | null;
  gainCaloriesValue: number | null;
  /** A server preview for the current input is still in flight. */
  pending?: boolean;
  warnings?: GoalWarning[];
}

/**
 * Intent, then target, then pace, then the consequence — the whole goal decision in one block.
 *
 * Onboarding's fifth step and the in-app goal screen render this same component, so improving the
 * decision improves it in both places at once and the two cannot drift.
 */
export function GoalChooserSection({
  intent,
  onIntent,
  target,
  bounds,
  onTarget,
  pace,
  onPace,
  plans,
  todayKey,
  maintenanceCalories,
  gainCaloriesValue,
  pending = false,
  warnings = [],
}: GoalChooserSectionProps) {
  const plan = plans[pace];
  const collapsed = bounds.max <= bounds.min;

  return (
    <View style={styles.stack}>
      <Section title="Ne yapmak istiyorsun?">
        <IntentPicker value={intent} onChange={onIntent} testID="goal-intent" />
      </Section>

      {intent === "lose" ? (
        <>
          <Section title="Hedef yağ oranın" hint={collapsed ? undefined : `Sağlıklı alt sınır ${fmtPct(bounds.min, 0)}.`}>
            <Card>
              <View style={styles.targetHead}>
                <Text variant="label" color="inkMuted">
                  Hedef
                </Text>
                <Text variant="display" tone="primary" tabular testID="goal-target">
                  {target === null ? "—" : fmtPct(target, 1)}
                </Text>
              </View>
              <TargetSlider value={target ?? bounds.min} bounds={bounds} onChange={onTarget} testID="goal-slider" />
              {collapsed ? (
                <Text variant="caption" tone="warning" style={styles.collapsed}>
                  Zaten sağlıklı alt sınırdasın; yeni bir yağ hedefi önermiyorum. Formunu korumak sana daha uygun.
                </Text>
              ) : null}
            </Card>
          </Section>

          <Section title="Ne kadar hızlı?" hint="Her seçeneğin altındaki tarih, o tempoyla varacağın gün.">
            <PacePicker value={pace} onChange={onPace} plans={plans} testID="goal-pace" />
          </Section>
        </>
      ) : null}

      <PlanOutcome outcome={outcomeFor({ intent, plan, todayKey, maintenanceCalories, gainCaloriesValue })} pending={intent === "lose" && pending} warnings={warnings} testID="goal-outcome" />
    </View>
  );
}

function outcomeFor(i: {
  intent: GoalIntent | null;
  plan: GoalChooserSectionProps["plans"][GoalProfile] | null;
  todayKey: string;
  maintenanceCalories: number | null;
  gainCaloriesValue: number | null;
}): Outcome {
  if (i.intent === "maintain") {
    return i.maintenanceCalories === null
      ? { kind: "blocked", headline: "Koruma seviyesi hesaplanamadı", body: "Ölçümün tamamlanınca günlük kalorini buraya yazacağım." }
      : { kind: "calories", headline: "Kilonu koruyan günlük kalori", calories: i.maintenanceCalories, body: "Hedef koymuyoruz. Bu seviyede kalırsan tartın yerinde durur." };
  }
  if (i.intent === "gain") {
    return i.gainCaloriesValue === null
      ? { kind: "blocked", headline: "Kalori hedefi hesaplanamadı", body: "Ölçümün tamamlanınca günlük kalorini buraya yazacağım." }
      : { kind: "calories", headline: "Kas için günlük kalori", calories: i.gainCaloriesValue, body: "Koruma seviyesinin %10 üstü. Yavaş ve büyük kısmı kas olan bir artış." };
  }
  if (!i.intent) return { kind: "blocked", headline: "Bir yön seç", body: "Yukarıdan birini seçince ne olacağını buraya yazacağım." };
  if (!i.plan || i.plan.roadmap.length === 0) {
    return { kind: "blocked", headline: "Bu hedefe bir yol çıkmadı", body: "Şu anki oranının altında bir hedef seç ya da formunu korumayı dene." };
  }
  return { kind: "plan", plan: i.plan, todayKey: i.todayKey };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="title">{title}</Text>
      {hint ? (
        <Text variant="caption" color="inkMuted">
          {hint}
        </Text>
      ) : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xxl },
  section: { gap: spacing.xxs },
  sectionBody: { marginTop: spacing.sm },
  targetHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing.sm },
  collapsed: { marginTop: spacing.sm },
});
