import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { BODY_FAT_CATEGORY_TR, MIN_SAFE_BODY_FAT, type GoalDTO, type GoalProfile } from "@fitfloow/core";
import { DEFAULT_GOAL_SETTINGS, bodyComposition, macrosFor } from "@fitfloow/core";
import { getApi } from "../../lib/api";
import { todayKey } from "../../lib/dates";
import { describeError } from "../../lib/errors";
import { fmtDate, fmtKg, fmtPct } from "../../lib/format";
import { Floo } from "../../mascot";
import { SpeechBubble } from "../../mascot/SpeechBubble";
import { useMascot } from "../../mascot/useMascot";
import { useTheme } from "../../theme/ThemeProvider";
import { radii, spacing } from "../../theme/tokens";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { EmptyState } from "../../ui/EmptyState";
import { Entry } from "../../ui/Entry";
import { Header } from "../../ui/Header";
import { Reveal } from "../../ui/Reveal";
import { Screen } from "../../ui/Screen";
import { Skeleton, SkeletonGroup } from "../../ui/Skeleton";
import { SuccessCheck } from "../../ui/SuccessCheck";
import { Text } from "../../ui/Text";
import { useToast } from "../../ui/Toast";
import { useSession } from "../auth/session";
import { useBodySummary } from "../body/useBody";
import { GoalChooserSection } from "./components/GoalChooserSection";
import { PLAN_OUTCOME_HEIGHT } from "./components/PlanOutcome";
import { gainCalories, intentForGoal, maintenanceEnergy, summaryOf, type GoalIntent } from "./goalIntent";
import { defaultTarget, snapTarget, targetBounds } from "./goalMath";
import { usePlansByPace } from "./useLocalPlan";
import { useAbandonGoal, useCreateGoal, useGoalPreview, useGoalView, useUpdateGoal } from "./useGoal";

export interface GoalSetupScreenProps {
  /** `edit` preloads the active goal's target and PATCHes instead of creating. */
  mode?: "create" | "edit";
}

/**
 * Choosing a goal.
 *
 * Intent first, then the number, then the pace — the same `GoalChooserSection` the onboarding flow
 * renders, so the decision looks and behaves identically whether you make it on day one or change
 * it six weeks in. Every choice redraws the arrival date instantly on device; the server preview
 * confirms the selected pace a beat later.
 */
export function GoalSetupScreen({ mode = "create" }: GoalSetupScreenProps) {
  const router = useRouter();
  const toast = useToast();
  const user = useSession((s) => s.user);
  const summaryQ = useBodySummary();
  const goalQ = useGoalView();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const abandon = useAbandonGoal();
  const [done, setDone] = useState<GoalDTO | null>(null);
  const [switching, setSwitching] = useState(false);

  const latest = summaryQ.data?.latest ?? null;
  const sex = summaryQ.data?.profile.gender ?? user?.gender ?? "male";
  const heightCm = latest?.heightCm ?? summaryQ.data?.profile.heightCm ?? user?.heightCm ?? 175;
  const currentBf = latest?.bodyFatPct ?? null;
  const bounds = useMemo(() => (currentBf === null ? { min: MIN_SAFE_BODY_FAT[sex], max: MIN_SAFE_BODY_FAT[sex] } : targetBounds(sex, currentBf)), [currentBf, sex]);
  const existing = mode === "edit" && goalQ.data?.goal?.status === "active" ? goalQ.data.goal : null;
  const editLoading = mode === "edit" && !goalQ.data;

  // The user's choices always win over the data-derived defaults; nothing is copied in an effect.
  const [chosenIntent, setIntent] = useState<GoalIntent | null>(null);
  const [chosenTarget, setTarget] = useState<number | null>(null);
  const [chosenPace, setPace] = useState<GoalProfile | null>(null);

  const initialTarget = useMemo(() => {
    if (currentBf === null || editLoading) return null;
    return existing ? snapTarget(existing.targetBodyFatPct, bounds) : defaultTarget(sex, currentBf);
  }, [bounds, currentBf, editLoading, existing, sex]);
  const target = chosenTarget ?? initialTarget;
  const pace: GoalProfile = chosenPace ?? existing?.profile ?? "optimal";
  const intent = chosenIntent ?? (existing ? intentForGoal(existing, currentBf) : bounds.max <= bounds.min ? "maintain" : "lose");

  const today = todayKey();
  const planInput = useMemo(
    () =>
      latest && target !== null
        ? { sex, weightKg: latest.weightKg, bodyFatPct: latest.bodyFatPct, heightCm, birthDate: user?.birthDate, activityLevel: user?.activityLevel ?? "moderate", targetBodyFatPct: target, todayKey: today, tdeeOverride: existing?.tdeeOverride }
        : null,
    [latest, target, sex, heightCm, user?.birthDate, user?.activityLevel, today, existing?.tdeeOverride]
  );
  const plans = usePlansByPace(planInput);

  const preview = useGoalPreview({ targetBodyFatPct: target ?? bounds.min, profile: pace, enabled: intent === "lose" && Boolean(latest) && target !== null });
  // Local numbers keep the screen instant; the server's answer replaces them once it agrees.
  const authoritative = preview.isCurrent && preview.server ? preview.server.plan : null;
  const shown = useMemo(() => ({ ...plans, [pace]: authoritative ?? plans[pace] }), [plans, pace, authoritative]);

  const energy = useMemo(
    () => (latest ? maintenanceEnergy({ sex, weightKg: latest.weightKg, bodyFatPct: latest.bodyFatPct, heightCm, birthDate: user?.birthDate, activityLevel: user?.activityLevel ?? "moderate", todayKey: today }) : null),
    [latest, sex, heightCm, user?.birthDate, user?.activityLevel, today]
  );
  const maintenance = energy ? Math.round(energy.maintenance / 10) * 10 : null;

  const plan = shown[pace];
  const warnings = intent === "lose" ? (plan?.warnings ?? []) : [];
  const blockedLose = intent === "lose" && (!plan || plan.roadmap.length === 0 || warnings.includes("TARGET_TOO_LOW") || bounds.max <= bounds.min);
  const blocked = intent === "lose" ? blockedLose : maintenance === null;

  /** Maintain / gain are not goals: they move the daily calorie target and retire any active goal. */
  const applyCalorieIntent = useCallback(async () => {
    if (!latest || maintenance === null) return;
    if (existing) await abandon.mutateAsync();
    if (intent === "maintain") {
      await getApi().nutrition.setTarget({ mode: "auto" });
      return;
    }
    const calories = gainCalories(maintenance);
    const { leanMassKg } = bodyComposition(latest.weightKg, latest.bodyFatPct);
    const macros = macrosFor({ sex, weightKg: latest.weightKg, leanMassKg, bodyFatPct: latest.bodyFatPct, dailyCalories: calories, settings: DEFAULT_GOAL_SETTINGS });
    await getApi().nutrition.setTarget({ mode: "manual", calories: macros.calories, protein: macros.protein, carbs: macros.carbs, fat: macros.fat });
  }, [abandon, existing, intent, latest, maintenance, sex]);

  const submit = useCallback(() => {
    if (blocked || switching) return;
    if (intent !== "lose") {
      setSwitching(true);
      applyCalorieIntent()
        .then(() => {
          toast.show({ message: intent === "maintain" ? "Günlük kalorin koruma seviyesine ayarlandı" : "Günlük kalorin kas için yükseltildi", kind: "success" });
          router.back();
        })
        .catch((e: unknown) => toast.show({ message: describeError(e, "Kalori hedefi ayarlanamadı. Tekrar dene."), kind: "error" }))
        .finally(() => setSwitching(false));
      return;
    }
    if (target === null) return;
    const input = { targetBodyFatPct: target, profile: pace };
    if (existing) update.mutate(input, { onSuccess: () => router.back() });
    else create.mutate(input, { onSuccess: (goal) => setDone(goal) });
  }, [applyCalorieIntent, blocked, create, existing, intent, pace, router, switching, target, toast, update]);

  const ready = Boolean(summaryQ.data) && !editLoading;
  const cta = intent !== "lose" ? (existing ? "Hedefi bırak ve devam et" : "Bu kaloriyle devam et") : existing ? "Hedefi güncelle" : "Hedefi başlat";

  if (done) return <SuccessView goal={done} onRoadmap={() => router.replace("/(modals)/goal/roadmap")} />;

  return (
    <Screen tabBar={false} edges={["top", "bottom"]}>
      <Header title={existing ? "Hedefi düzenle" : "Hedef belirle"} compact left={{ icon: "close", label: "Kapat", onPress: () => router.back() }} />
      <Reveal ready={ready} skeleton={<SetupSkeleton />}>
        {ready && !latest ? (
          <EmptyState
            illustration={<Floo mood="think" size="m" />}
            title="Önce bir ölçüm gerekli"
            body="Yağ oranını bilmeden yol haritası çizemem. Boyun ve bel ölçüsü iki dakika sürer."
            action={{ label: "Ölçüm ekle", onPress: () => router.back(), icon: "measure" }}
          />
        ) : ready && latest ? (
          <View style={styles.stack}>
            <Entry index={0}>
              <CurrentRow bf={latest.bodyFatPct} weight={latest.weightKg} category={summaryQ.data?.category ? BODY_FAT_CATEGORY_TR[summaryQ.data.category] : null} date={latest.dateKey} />
            </Entry>
            <Entry index={1}>
              <GoalChooserSection
                intent={intent}
                onIntent={setIntent}
                target={target}
                bounds={bounds}
                onTarget={(v) => setTarget(snapTarget(v, bounds))}
                pace={pace}
                onPace={setPace}
                plans={shown}
                todayKey={today}
                maintenanceCalories={maintenance}
                gainCaloriesValue={maintenance === null ? null : gainCalories(maintenance)}
                pending={preview.pending}
                warnings={warnings}
              />
            </Entry>
            <Entry index={2}>
              <Button label={cta} onPress={submit} disabled={blocked} loading={create.isPending || update.isPending || switching} full size="lg" icon="goal" testID="goal-submit" />
            </Entry>
          </View>
        ) : null}
      </Reveal>
    </Screen>
  );
}

function CurrentRow({ bf, weight, category, date }: { bf: number; weight: number; category: string | null; date: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.current, { backgroundColor: colors.surfaceMuted }]} accessibilityLabel={`Şu an yağ oranı ${fmtPct(bf)}, ${fmtKg(weight)}`}>
      <View style={styles.currentTexts}>
        <Text variant="caption" color="inkMuted">
          Şu an · {fmtDate(date, "short")}
        </Text>
        <View style={styles.currentValues}>
          <Text variant="heading" tabular testID="goal-current-bf">
            {fmtPct(bf)}
          </Text>
          <Text variant="body" color="inkMuted" tabular>
            {fmtKg(weight)}
          </Text>
        </View>
      </View>
      {category ? <Chip label={category} tone="primary" size="sm" /> : null}
    </View>
  );
}

function SuccessView({ goal, onRoadmap }: { goal: GoalDTO; onRoadmap: () => void }) {
  const mascot = useMascot("goal");
  return (
    <Screen tabBar={false} edges={["top", "bottom"]} contentStyle={styles.successContent}>
      <View style={styles.success}>
        <SuccessCheck size={80} />
        <Text variant="display" align="center">
          Yola çıktık
        </Text>
        <Text variant="body" color="inkMuted" align="center" tabular testID="goal-success-summary">
          {summaryOf(goal.plan)}
        </Text>
        <View style={styles.flooRow}>
          <Floo mood={mascot.mood === "happy" ? "cheer" : mascot.mood} size="m" testID="goal-success-floo" />
          <SpeechBubble text={mascot.text} tail="left" style={styles.bubble} testID="goal-success-bubble" />
        </View>
        <Button label="Yol haritasını gör" onPress={onRoadmap} full size="lg" iconRight="next" testID="goal-see-roadmap" />
      </View>
    </Screen>
  );
}

function SetupSkeleton() {
  return (
    <SkeletonGroup testID="goal-setup-skeleton" style={styles.stack}>
      <Skeleton height={72} radius={radii.md} />
      <Skeleton height={252} radius={radii.md} />
      <Skeleton height={168} radius={radii.card} />
      <Skeleton height={PLAN_OUTCOME_HEIGHT} radius={radii.card} />
      <Skeleton height={56} radius={radii.control + 2} />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  current: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radii.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 72 },
  currentTexts: { flex: 1, gap: 2 },
  currentValues: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  successContent: { flexGrow: 1, justifyContent: "center" },
  success: { alignItems: "center", gap: spacing.lg, paddingVertical: spacing.xxl },
  flooRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, alignSelf: "stretch", marginTop: spacing.sm },
  bubble: { flex: 1 },
});
