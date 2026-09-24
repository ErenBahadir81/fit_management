import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { DEFAULT_GOAL_SETTINGS, macrosFor, type Macros } from "@fitfloow/core";
import { todayKey } from "../../../lib/dates";
import { fmtGrams, fmtInt } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Text } from "../../../ui/Text";
import { maintenanceEnergy } from "../../goals/goalIntent";
import type { OnboardingDraft } from "../model";
import type { OnboardingResult } from "../useOnboarding";
import { DIRECTION_TR } from "./GoalStep";

/**
 * Stage 7 — what is now set up, in three cards: the goal in one sentence, the daily nutrition
 * target it implies, and the first program. Everything shown is what the server stored (or, with no
 * goal, the maintenance target the diet tab will follow), so the home screen says the same thing.
 */
export function DoneStep({ draft, bodyFatPct, result }: { draft: OnboardingDraft; bodyFatPct: number | null; result: OnboardingResult | null }) {
  const goal = result?.goal ?? null;
  const program = result?.program ?? null;
  const nutrition = useMemo(() => nutritionFor(draft, bodyFatPct, goal?.plan.macros ?? null), [draft, bodyFatPct, goal]);
  const trainingDays = program?.days.filter((d) => d.kind !== "rest") ?? [];

  return (
    <View style={styles.stack} testID="onboarding-done">
      <Card icon="goal" title={goal ? DIRECTION_TR[goal.direction].label : "Hedef"} testID="done-goal">
        <Text variant="body" color="inkMuted" testID="done-summary">
          {goal?.plan.summaryTr || "Şimdilik hedef yok; kilonu koruyan kaloriyle başlıyoruz. Hedefini istediğin an Vücut sekmesinden koyabilirsin."}
        </Text>
      </Card>

      <Card icon="nutrition" title="Beslenme hedefin" testID="done-nutrition">
        {nutrition ? (
          <>
            <Text variant="display" tabular testID="done-kcal">
              {fmtInt(nutrition.calories)} kcal
            </Text>
            <Text variant="label" color="inkMuted" tabular>
              Protein {fmtGrams(nutrition.protein)} · Karbonhidrat {fmtGrams(nutrition.carbs)} · Yağ {fmtGrams(nutrition.fat)}
            </Text>
          </>
        ) : (
          <Text variant="body" color="inkMuted">
            Günlük hedefin Beslenme sekmesinde.
          </Text>
        )}
      </Card>

      <Card icon="program" title="İlk programın" testID="done-program">
        {program ? (
          <>
            <Text variant="title" testID="done-program-name">
              {program.name}
            </Text>
            <View style={styles.days}>
              {trainingDays.map((d) => (
                <Text key={d.id} variant="label" color="inkMuted">
                  {d.title}
                </Text>
              ))}
            </View>
            <Text variant="caption" color="inkSubtle">
              Günleri ve hareketleri Program sekmesinden dilediğin gibi değiştirebilirsin.
            </Text>
          </>
        ) : (
          <Text variant="body" color="inkMuted">
            Programın Program sekmesinde seni bekliyor.
          </Text>
        )}
      </Card>
    </View>
  );
}

/** The goal's first-week target, or maintenance macros when there is no goal. */
function nutritionFor(draft: OnboardingDraft, bf: number | null, planMacros: Macros | null): Macros | null {
  if (planMacros) return planMacros;
  const { gender, heightCm, birthDate } = draft.profile;
  const weightKg = draft.measurement.weightKg;
  if (bf === null || !gender || heightCm === null || weightKg === null) return null;
  const e = maintenanceEnergy({ sex: gender, weightKg, bodyFatPct: bf, heightCm, birthDate, activityLevel: draft.training.activityLevel ?? "moderate", todayKey: todayKey() });
  const calories = Math.round(e.maintenance / 10) * 10;
  return macrosFor({ sex: gender, weightKg, leanMassKg: e.leanMassKg, bodyFatPct: bf, dailyCalories: calories, settings: DEFAULT_GOAL_SETTINGS });
}

function Card({ icon, title, children, testID }: { icon: "goal" | "nutrition" | "program"; title: string; children: React.ReactNode; testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={testID}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
          <Icon icon={icon} size={18} color="primary" />
        </View>
        <Text variant="label" color="inkMuted" accessibilityRole="header">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  card: { borderRadius: radii.card, borderWidth: 1, padding: spacing.lg, gap: spacing.xs },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  days: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.md, rowGap: 2 },
});
