import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import type { GoalPlan, GoalWarning } from "@fitfloow/core";
import { fmtDate, fmtInt, fmtNumber, fmtPct } from "../../../lib/format";
import { spacing } from "../../../theme/tokens";
import { useTheme } from "../../../theme/ThemeProvider";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { Text } from "../../../ui/Text";
import { WARNING_TR } from "../goalMath";
import { milestonesOf, summaryOf } from "../goalIntent";
import { MilestoneSpine } from "./MilestoneSpine";

export const PLAN_OUTCOME_HEIGHT = 244;

/** What the current choice actually produces. */
export type Outcome =
  | { kind: "plan"; plan: GoalPlan; todayKey: string }
  /** No fat-loss goal: the choice sets a daily calorie level instead. */
  | { kind: "calories"; headline: string; calories: number; body: string }
  | { kind: "blocked"; headline: string; body: string };

export interface PlanOutcomeProps {
  outcome: Outcome;
  /** The server's answer for the *current* input is still in flight; the numbers shown are local. */
  pending?: boolean;
  warnings?: GoalWarning[];
  testID?: string;
}

/**
 * "Here is what that choice means."
 *
 * The same card in onboarding and in goal setup, so the promise a person is shown while choosing is
 * literally the promise they keep seeing afterwards. The arrival **date** is the hero, because that
 * is the question the old plan card never answered.
 */
export function PlanOutcome({ outcome, pending = false, warnings = [], testID }: PlanOutcomeProps) {
  return (
    <View style={styles.wrap}>
      <Card variant="primary" style={styles.card} testID={testID} accessibilityLabel={describe(outcome)}>
        <View style={styles.head}>
          <Text variant="label" color="onPrimaryMuted">
            {outcome.kind === "plan" ? "Planın" : "Sonuç"}
          </Text>
          {outcome.kind === "plan" ? <Status pending={pending} /> : null}
        </View>
        {outcome.kind === "plan" ? <PlanBody plan={outcome.plan} todayKey={outcome.todayKey} /> : <SimpleBody outcome={outcome} />}
      </Card>
      {warnings.length > 0 ? (
        <View style={styles.warnings} accessibilityLabel="Uyarılar">
          {warnings.map((w) => (
            <Chip key={w} label={WARNING_TR[w].label} tone={WARNING_TR[w].tone} size="sm" icon="warning" testID={`warning-${w}`} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PlanBody({ plan, todayKey }: { plan: GoalPlan; todayKey: string }) {
  const milestones = milestonesOf(plan, todayKey);
  return (
    <>
      <View style={styles.hero}>
        <Text variant="hero" color="onPrimary" tabular numberOfLines={1} testID="outcome-date">
          {fmtDate(plan.targetDate, "medium")}
        </Text>
        <Text variant="title" color="onPrimaryMuted" tabular numberOfLines={1} testID="outcome-body">
          ~{fmtNumber(plan.targetWeightKg, 1)} kg · {fmtPct(milestones[milestones.length - 1]?.bodyFatPct ?? 0, 0)} yağ
        </Text>
      </View>
      <View style={styles.stats}>
        <Stat value={`${plan.estimatedWeeks} hafta`} label="süre" testID="outcome-weeks" />
        <Stat value={`${fmtNumber(plan.initialRateKgPerWeek, 2)} kg`} label="haftada" testID="outcome-rate" />
        <Stat value={`${fmtInt(plan.initialDailyCalorieTarget)} kcal`} label="günde" testID="outcome-kcal" />
      </View>
      <MilestoneSpine milestones={milestones} todayKey={todayKey} testID="outcome-spine" />
    </>
  );
}

function SimpleBody({ outcome }: { outcome: Extract<Outcome, { kind: "calories" | "blocked" }> }) {
  return (
    <View style={styles.simple}>
      <Text variant="display" color="onPrimary" numberOfLines={2}>
        {outcome.headline}
      </Text>
      {outcome.kind === "calories" ? (
        <Text variant="hero" color="onPrimary" tabular testID="outcome-kcal">
          {fmtInt(outcome.calories)}
          <Text variant="title" color="onPrimaryMuted">
            {" "}
            kcal
          </Text>
        </Text>
      ) : null}
      <Text variant="body" color="onPrimaryMuted">
        {outcome.body}
      </Text>
    </View>
  );
}

function Stat({ value, label, testID }: { value: string; label: string; testID?: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="title" color="onPrimary" tabular numberOfLines={1} testID={testID}>
        {value}
      </Text>
      <Text variant="caption" color="onPrimaryMuted">
        {label}
      </Text>
    </View>
  );
}

/** A pulse while the authoritative preview is in flight, a check once it agrees with the screen. */
function Status({ pending }: { pending: boolean }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (pending && !reduce) pulse.set(withRepeat(withTiming(0.3, { duration: 600, easing: Easing.inOut(Easing.quad) }), -1, true));
    else {
      cancelAnimation(pulse);
      pulse.set(withTiming(1, { duration: 150 }));
    }
    return () => cancelAnimation(pulse);
  }, [pending, reduce, pulse]);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  return (
    <View style={styles.status} accessibilityLiveRegion="polite" testID="outcome-status">
      {pending ? <Animated.View style={[styles.dot, { backgroundColor: colors.onPrimary }, dot]} /> : <Icon icon="done" size={14} color="onPrimary" />}
      <Text variant="caption" color="onPrimaryMuted">
        {pending ? "hesaplanıyor" : "plan doğrulandı"}
      </Text>
    </View>
  );
}

function describe(outcome: Outcome): string {
  if (outcome.kind === "plan") return summaryOf(outcome.plan);
  return outcome.kind === "calories" ? `${outcome.headline}: günde ${fmtInt(outcome.calories)} kalori. ${outcome.body}` : `${outcome.headline}. ${outcome.body}`;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  card: { minHeight: PLAN_OUTCOME_HEIGHT, gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 20 },
  hero: { gap: 2 },
  stats: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  stat: { flex: 1, gap: 2 },
  simple: { gap: spacing.sm, paddingVertical: spacing.sm },
  status: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  warnings: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
