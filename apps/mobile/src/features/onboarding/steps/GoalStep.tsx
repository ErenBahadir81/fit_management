import React, { forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import type { GoalDirection, GoalPlan, GoalProfile } from "@fitfloow/core";
import { fmtDate, fmtInt, fmtNumber, fmtPct } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { CountUp } from "../../../ui/CountUp";
import { Segmented } from "../../../ui/Segmented";
import { Text } from "../../../ui/Text";
import { WARNING_TR } from "../../goals/goalMath";
import { ChoiceList } from "../components/ChoiceList";
import { ValueSlider } from "../components/ValueSlider";
import { choiceTarget, goalBounds } from "../plan";
import type { Onboarding } from "../useOnboarding";
import { Question } from "./Question";

export const DIRECTION_TR: Record<GoalDirection, { label: string; hint: string }> = {
  cut: { label: "Yağ ver", hint: "Kasını koruyarak, kontrollü bir açıkla." },
  bulk: { label: "Kas kazan", hint: "Küçük bir fazlayla, yağı sınırda tutarak." },
  recomp: { label: "Rekomp", hint: "Yağ verirken aynı anda kas kazan; yavaş ama dengeli." },
};

const PACES: { value: GoalProfile; label: string }[] = [
  { value: "conservative", label: "Temkinli" },
  { value: "optimal", label: "Optimal" },
  { value: "aggressive", label: "Agresif" },
];

export interface GoalStepProps {
  o: Onboarding;
  /** Floo answers once the finger lets go, not on every tick. */
  onSettled: () => void;
}

/**
 * Stage 6 — Floo's recommendation, and the user's say over it. Direction, the one number that
 * direction is measured in, and the pace; the weeks, the weekly rate and the daily calories under
 * them are the real engine's and redraw with every step of the slider. Nothing is applied until
 * the user accepts — the button below says so — and "no goal for now" is always one tap away.
 */
export const GoalStep = forwardRef<View, GoalStepProps>(function GoalStep({ o, onSettled }, sliderRef) {
  const a = o.assessment;
  const c = o.choice;
  if (!a || !c) {
    return (
      <Text variant="body" color="inkMuted">
        Ölçülerin eksik; bir adım geri dönüp tamamlayalım.
      </Text>
    );
  }
  const rec = a.recommendation;
  const directions: GoalDirection[] = [rec.direction, ...rec.alternatives.filter((d) => d !== rec.direction)];
  const bounds = goalBounds(c.direction, a);
  const target = choiceTarget(c) ?? bounds.min;
  const bulk = c.direction === "bulk";
  const plan = o.plans?.[o.draft.goal.profile] ?? null;
  const onRecommendation = o.recommended !== null && c.direction === o.recommended.direction && choiceTarget(c) === choiceTarget(o.recommended);

  return (
    <View style={styles.stack}>
      <Question title="Yön" why="Floo'nun önerisi en üstte; istersen değiştir.">
        <ChoiceList
          options={directions.map((d) => ({ value: d, label: DIRECTION_TR[d].label, hint: DIRECTION_TR[d].hint, badge: d === rec.direction ? "Floo önerisi" : undefined }))}
          value={c.direction}
          onChange={(d) => {
            o.setDirection(d);
            onSettled();
          }}
          label="Hedefin yönü"
          testID="goal-direction"
        />
      </Question>

      <Question title={bulk ? "Ne kadar kas?" : "Hedef yağ oranı"} why={bulk ? "Yağsız kütleye eklenecek kilo." : `Şu an ${fmtPct(a.bodyFatPct)}.`}>
        <ValueSlider
          ref={sliderRef}
          value={target}
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          onChange={o.setTarget}
          onRelease={onSettled}
          format={(v) => (bulk ? `+${fmtNumber(v, 1)} kg` : fmtPct(v, 1))}
          label={bulk ? "Kazanılacak kas" : "Hedef yağ oranı"}
          minCaption={bulk ? undefined : `${fmtPct(bounds.min, 0)} sınır`}
          testID="goal-slider"
        />
      </Question>

      <Question title="Tempo">
        <Segmented<GoalProfile> options={PACES} value={o.draft.goal.profile} onChange={(profile) => o.patch((d) => ({ ...d, goal: { ...d.goal, profile } }))} testID="goal-pace" />
      </Question>

      <Outcome plan={plan} direction={c.direction} />

      {!onRecommendation ? <Button label="Floo'nun önerisine dön" variant="ghost" icon="refresh" onPress={o.resetToRecommendation} testID="goal-reset" /> : null}
      <Button label="Şimdilik hedef koymadan devam et" variant="ghost" onPress={o.skipGoal} disabled={o.busy} testID="goal-skip" />
    </View>
  );
});

/** The plan in four numbers. Counts to new values instead of jumping; the warnings say what limited it. */
function Outcome({ plan, direction }: { plan: GoalPlan | null; direction: GoalDirection }) {
  const { colors } = useTheme();
  if (!plan) {
    return (
      <Text variant="body" color="inkMuted" testID="goal-outcome-missing">
        Bu hedef için bir plan çıkmadı; hedefi biraz oynatmayı dene.
      </Text>
    );
  }
  const sign = direction === "bulk" ? "+" : "−";
  return (
    <View
      style={[styles.outcome, { backgroundColor: colors.surfaceMuted }]}
      testID="goal-outcome"
      accessible
      accessibilityLabel={`Tahmini ${plan.estimatedWeeks} hafta, ${fmtDate(plan.targetDate)}. Haftada ${fmtNumber(plan.initialRateKgPerWeek, 2)} kilo. Günde ${fmtInt(plan.initialDailyCalorieTarget)} kalori.`}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.outcomeRow}>
        <View style={styles.big}>
          <CountUp variant="hero" value={plan.estimatedWeeks} format={(n) => fmtInt(n)} duration={320} testID="goal-weeks" />
          <Text variant="label" color="inkMuted">
            hafta · {fmtDate(plan.targetDate)}
          </Text>
        </View>
        <View style={styles.facts}>
          <Fact label="Haftalık" value={`${sign}${fmtNumber(plan.initialRateKgPerWeek, 2)} kg`} testID="goal-rate" />
          <Fact label="Günlük" value={`${fmtInt(plan.initialDailyCalorieTarget)} kcal`} testID="goal-kcal" />
        </View>
      </View>
      {plan.warnings.length ? (
        <View style={styles.warnings}>
          {plan.warnings.slice(0, 2).map((w) => (
            <Chip key={w} label={WARNING_TR[w].label} tone={WARNING_TR[w].tone} size="sm" />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Fact({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View style={styles.fact}>
      <Text variant="caption" color="inkMuted">
        {label}
      </Text>
      <Text variant="title" tabular testID={testID}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xl },
  outcome: { borderRadius: radii.card, padding: spacing.lg, gap: spacing.md },
  outcomeRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.md },
  big: { gap: 2, flexShrink: 1 },
  facts: { gap: spacing.sm, alignItems: "flex-end" },
  fact: { alignItems: "flex-end" },
  warnings: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
});
