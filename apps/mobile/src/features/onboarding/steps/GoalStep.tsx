import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { MIN_SAFE_BODY_FAT } from "@fitfloow/core";
import { todayKey } from "../../../lib/dates";
import { fmtInt, fmtPct } from "../../../lib/format";
import { spacing } from "../../../theme/tokens";
import { Text } from "../../../ui/Text";
import { GoalChooserSection } from "../../goals/components/GoalChooserSection";
import { gainCalories, maintenanceEnergy } from "../../goals/goalIntent";
import { defaultTarget, snapTarget, targetBounds } from "../../goals/goalMath";
import { usePlansByPace } from "../../goals/useLocalPlan";
import type { Onboarding } from "../useOnboarding";

/**
 * The screen the whole flow exists for.
 *
 * Intent first, then the number, then the pace — and every one of those choices redraws the arrival
 * date, the weekly rate and the daily calories underneath it. Same components as the goal-setup
 * screen inside the app, so the two can never drift apart.
 */
export function GoalStep({ o }: { o: Onboarding }) {
  const today = todayKey();
  const p = o.draft.profile;
  const m = o.draft.measurement;
  const sex = p.gender ?? "male";
  const bf = o.bodyFatPct;

  const bounds = useMemo(() => (bf === null ? { min: MIN_SAFE_BODY_FAT[sex], max: MIN_SAFE_BODY_FAT[sex] } : targetBounds(sex, bf)), [bf, sex]);
  const target = o.draft.goal.targetBodyFatPct ?? (bf === null ? null : defaultTarget(sex, bf));

  const planInput = useMemo(
    () =>
      bf === null || m.weightKg === null || p.heightCm === null || target === null
        ? null
        : { sex, weightKg: m.weightKg, bodyFatPct: bf, heightCm: p.heightCm, birthDate: p.birthDate, activityLevel: p.activityLevel ?? "moderate", targetBodyFatPct: target, todayKey: today },
    [bf, m.weightKg, p.heightCm, p.birthDate, p.activityLevel, sex, target, today]
  );
  const plans = usePlansByPace(planInput);

  const energy = useMemo(
    () =>
      bf === null || m.weightKg === null || p.heightCm === null
        ? null
        : maintenanceEnergy({ sex, weightKg: m.weightKg, bodyFatPct: bf, heightCm: p.heightCm, birthDate: p.birthDate, activityLevel: p.activityLevel ?? "moderate", todayKey: today }),
    [bf, m.weightKg, p.heightCm, p.birthDate, p.activityLevel, sex, today]
  );

  const maintenance = energy ? Math.round(energy.maintenance / 10) * 10 : null;

  return (
    <View style={styles.stack}>
      {bf !== null ? (
        <Text variant="body" color="inkMuted" tabular testID="goal-step-current">
          Şu an {fmtPct(bf)} yağ oranındasın{maintenance ? ` · kilonu koruyan kalori ${fmtInt(maintenance)} kcal` : ""}.
        </Text>
      ) : null}
      <GoalChooserSection
        intent={o.draft.goal.intent}
        onIntent={(intent) => o.patch((d) => ({ ...d, goal: { ...d.goal, intent, targetBodyFatPct: d.goal.targetBodyFatPct ?? (bf === null ? null : defaultTarget(sex, bf)) } }))}
        target={target}
        bounds={bounds}
        onTarget={(v) => o.patch((d) => ({ ...d, goal: { ...d.goal, targetBodyFatPct: snapTarget(v, bounds) } }))}
        pace={o.draft.goal.profile}
        onPace={(profile) => o.patch((d) => ({ ...d, goal: { ...d.goal, profile } }))}
        plans={plans}
        todayKey={today}
        maintenanceCalories={maintenance}
        gainCaloriesValue={maintenance === null ? null : gainCalories(maintenance)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
});
