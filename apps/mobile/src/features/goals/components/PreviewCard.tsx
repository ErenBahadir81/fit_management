import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import type { GoalPlan, GoalWarning } from "@fitfloow/core";
import { fmtDate, fmtInt, fmtNumber } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { Text } from "../../../ui/Text";
import { CountUp } from "../../reports/components/CountUp";
import { WARNING_TR } from "../goalMath";

const fmt1 = (v: number) => fmtNumber(v, 1);
export const PREVIEW_HEIGHT = 196;

export interface PreviewCardProps {
  plan: GoalPlan | null;
  /** Server answer for the current input still on its way (instant numbers are shown meanwhile). */
  pending: boolean;
  warnings: GoalWarning[];
}

/** Live plan preview: fat to lose, weeks, daily kcal, target date — updates instantly as the slider moves. */
export function PreviewCard({ plan, pending, warnings }: PreviewCardProps) {
  const reachable = Boolean(plan && plan.roadmap.length > 0);
  return (
    <View style={styles.wrap}>
      <Card variant="primary" style={styles.card} testID="goal-preview" accessibilityLabel={plan && reachable ? `Plan: ${fmtNumber(plan.fatToLoseKg, 1)} kilo yağ, ${plan.estimatedWeeks} hafta, günde ${fmtInt(plan.initialDailyCalorieTarget)} kalori` : "Plan hesaplanamadı"}>
        <View style={styles.head}>
          <Text variant="label" color="onPrimaryMuted">
            Plan önizleme
          </Text>
          <Status pending={pending} />
        </View>
        {plan && reachable ? (
          <>
            <View style={styles.heroRow}>
              <CountUp value={plan.fatToLoseKg} format={fmt1} variant="hero" color="onPrimary" testID="preview-fat" />
              <Text variant="title" color="onPrimaryMuted">
                kg yağ
              </Text>
            </View>
            <View style={styles.stats}>
              <Stat value={`${plan.estimatedWeeks} hafta`} label="süre" testID="preview-weeks" />
              <Stat value={`${fmtInt(plan.initialDailyCalorieTarget)} kcal`} label="günlük" testID="preview-kcal" />
              <Stat value={fmtDate(plan.targetDate, "short")} label="hedef tarih" testID="preview-date" />
            </View>
            <Text variant="caption" color="onPrimaryMuted" tabular>
              Haftada ~{fmtNumber(plan.initialRateKgPerWeek, 2)} kg · {fmtInt(plan.macros.protein)} g protein
            </Text>
          </>
        ) : (
          <View style={styles.unreachable}>
            <Text variant="title" color="onPrimary">
              {plan ? "Bu hedef zaten geride" : "Önce bir ölçüm gerekli"}
            </Text>
            <Text variant="body" color="onPrimaryMuted">
              {plan ? "Şu anki oranının altında bir hedef seç." : "Yağ oranını hesaplamak için boyun ve bel ölçüsü lazım."}
            </Text>
          </View>
        )}
      </Card>
      {warnings.length > 0 ? (
        <View style={styles.warnings} accessibilityLabel="Uyarılar">
          {warnings.map((w) => (
            <Chip key={w} label={WARNING_TR[w].label} tone={WARNING_TR[w].tone} size="sm" icon="alert-circle-outline" testID={`warning-${w}`} />
          ))}
        </View>
      ) : null}
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

/** "hesaplanıyor" pulse while the authoritative preview is in flight, a check once it matches. */
function Status({ pending }: { pending: boolean }) {
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
  const { colors } = useTheme();
  return (
    <View style={styles.status} accessibilityLiveRegion="polite" testID="preview-status">
      {pending ? <Animated.View style={[styles.dot, { backgroundColor: colors.onPrimary }, dot]} /> : <Icon name="checkmark-circle" size={14} color="onPrimary" />}
      <Text variant="caption" color="onPrimaryMuted">
        {pending ? "hesaplanıyor" : "plan doğrulandı"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  card: { minHeight: PREVIEW_HEIGHT, gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  stats: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  stat: { flex: 1, gap: 2 },
  unreachable: { gap: spacing.xs, paddingVertical: spacing.md },
  status: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  warnings: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
