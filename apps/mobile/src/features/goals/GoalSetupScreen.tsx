import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { BODY_FAT_CATEGORY_TR, MIN_SAFE_BODY_FAT, type GoalDTO, type GoalProfile } from "@fitfloow/core";
import { todayKey } from "../../lib/dates";
import { fmtDate, fmtInt, fmtKg, fmtPct } from "../../lib/format";
import { Floo } from "../../mascot/Floo";
import { SpeechBubble } from "../../mascot/SpeechBubble";
import { useMascot } from "../../mascot/useMascot";
import { useTheme } from "../../theme/ThemeProvider";
import { radii, spacing } from "../../theme/tokens";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Chip } from "../../ui/Chip";
import { EmptyState } from "../../ui/EmptyState";
import { Entry } from "../../ui/Entry";
import { Header } from "../../ui/Header";
import { Reveal } from "../../ui/Reveal";
import { Screen } from "../../ui/Screen";
import { Segmented } from "../../ui/Segmented";
import { Skeleton, SkeletonGroup } from "../../ui/Skeleton";
import { SuccessCheck } from "../../ui/SuccessCheck";
import { Text } from "../../ui/Text";
import { useSession } from "../auth/session";
import { useBodySummary } from "../body/useBody";
import { PreviewCard, PREVIEW_HEIGHT } from "./components/PreviewCard";
import { TargetSlider } from "./components/TargetSlider";
import { PROFILE_OPTIONS, defaultTarget, instantPlan, snapTarget, targetBounds } from "./goalMath";
import { useCreateGoal, useGoalPreview, useGoalView, useUpdateGoal } from "./useGoal";

const PROFILE_SEG = PROFILE_OPTIONS.map((p) => ({ value: p.value, label: p.label }));

export interface GoalSetupScreenProps {
  /** `edit` preloads the active goal's target and PATCHes instead of creating. */
  mode?: "create" | "edit";
}

/**
 * Goal setup: current bf → target slider → pace → live preview → "Hedefi başlat".
 * The preview is instant (core engine on-device) and confirmed by the API when the slider settles.
 */
export function GoalSetupScreen({ mode = "create" }: GoalSetupScreenProps) {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const summaryQ = useBodySummary();
  const goalQ = useGoalView();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const [done, setDone] = useState<GoalDTO | null>(null);

  const latest = summaryQ.data?.latest ?? null;
  const sex = summaryQ.data?.profile.gender ?? user?.gender ?? "male";
  const heightCm = latest?.heightCm ?? summaryQ.data?.profile.heightCm ?? user?.heightCm ?? 175;
  const currentBf = latest?.bodyFatPct ?? null;
  const bounds = useMemo(() => (currentBf === null ? { min: MIN_SAFE_BODY_FAT[sex], max: MIN_SAFE_BODY_FAT[sex] } : targetBounds(sex, currentBf)), [currentBf, sex]);
  const existing = mode === "edit" && goalQ.data?.goal?.status === "active" ? goalQ.data.goal : null;
  const editLoading = mode === "edit" && !goalQ.data;

  // The user's choices override the data-derived defaults; nothing is copied into state in an effect.
  const [chosenTarget, setTarget] = useState<number | null>(null);
  const [chosenProfile, setProfile] = useState<GoalProfile | null>(null);
  const initialTarget = useMemo(() => {
    if (currentBf === null || editLoading) return null;
    return existing ? snapTarget(existing.targetBodyFatPct, bounds) : defaultTarget(sex, currentBf);
  }, [bounds, currentBf, editLoading, existing, sex]);
  const target = chosenTarget ?? initialTarget;
  const profile: GoalProfile = chosenProfile ?? existing?.profile ?? "optimal";

  const today = todayKey();
  const instant = useMemo(
    () => (latest && target !== null ? instantPlan({ sex, weightKg: latest.weightKg, bodyFatPct: latest.bodyFatPct, heightCm, birthDate: user?.birthDate, activityLevel: user?.activityLevel ?? "moderate", targetBodyFatPct: target, profile, todayKey: today, tdeeOverride: existing?.tdeeOverride }) : null),
    [latest, target, sex, heightCm, user?.birthDate, user?.activityLevel, profile, today, existing?.tdeeOverride]
  );
  const preview = useGoalPreview({ targetBodyFatPct: target ?? bounds.min, profile, enabled: Boolean(latest) && target !== null });
  const plan = preview.isCurrent && preview.server ? preview.server.plan : instant;
  const warnings = plan?.warnings ?? [];
  const blocked = !plan || plan.roadmap.length === 0 || warnings.includes("TARGET_TOO_LOW") || bounds.max <= bounds.min;

  const submit = useCallback(() => {
    if (target === null || blocked) return;
    const input = { targetBodyFatPct: target, profile };
    if (existing) update.mutate(input, { onSuccess: () => router.back() });
    else create.mutate(input, { onSuccess: (goal) => setDone(goal) });
  }, [target, blocked, profile, existing, update, create, router]);

  const ready = Boolean(summaryQ.data) && !editLoading;

  if (done) return <SuccessView goal={done} onRoadmap={() => router.replace("/(modals)/goal/roadmap")} />;

  return (
    <Screen tabBar={false} edges={["top", "bottom"]}>
      <Header title={existing ? "Hedefi düzenle" : "Hedef belirle"} compact left={{ icon: "close", label: "Kapat", onPress: () => router.back() }} />
      <Reveal ready={ready} skeleton={<SetupSkeleton />}>
        {ready && !latest ? (
          <EmptyState illustration={<Floo mood="think" size="m" />} title="Önce bir ölçüm gerekli" body="Yağ oranını bilmeden yol haritası çizemem. Boyun ve bel ölçüsü iki dakika sürer." action={{ label: "Ölçüm ekle", onPress: () => router.back(), icon: "add" }} />
        ) : ready && latest && target !== null ? (
          <View style={styles.stack}>
            <Entry index={0}>
              <CurrentRow bf={latest.bodyFatPct} weight={latest.weightKg} category={summaryQ.data?.category ? BODY_FAT_CATEGORY_TR[summaryQ.data.category] : null} date={latest.dateKey} />
            </Entry>
            <Entry index={1}>
              <Card>
                <View style={styles.cardHead}>
                  <Text variant="label" color="inkMuted">
                    Hedef yağ oranı
                  </Text>
                  <Text variant="display" tone="primary" tabular testID="goal-target">
                    {fmtPct(target, 1)}
                  </Text>
                </View>
                <TargetSlider value={target} bounds={bounds} onChange={setTarget} testID="goal-slider" />
                {bounds.max <= bounds.min ? (
                  <Text variant="caption" tone="warning" style={styles.hint}>
                    Zaten sağlıklı alt sınırdasın; yeni bir yağ hedefi önermiyorum.
                  </Text>
                ) : null}
              </Card>
            </Entry>
            <Entry index={2}>
              <Card>
                <Text variant="label" color="inkMuted" style={styles.hint}>
                  Tempo
                </Text>
                <Segmented options={PROFILE_SEG} value={profile} onChange={setProfile} testID="goal-profile" />
                <Text variant="body" color="inkMuted" style={styles.profileHint} accessibilityLiveRegion="polite">
                  {PROFILE_OPTIONS.find((p) => p.value === profile)?.hint}
                </Text>
              </Card>
            </Entry>
            <Entry index={3}>
              <PreviewCard plan={plan} pending={preview.pending} warnings={warnings} />
            </Entry>
            <Entry index={4}>
              <Button label={existing ? "Hedefi güncelle" : "Hedefi başlat"} onPress={submit} disabled={blocked} loading={create.isPending || update.isPending} full size="lg" icon="flag" testID="goal-submit" />
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
        <Text variant="body" color="inkMuted" align="center" tabular>
          Hedef {fmtPct(goal.targetBodyFatPct, 1)} · {goal.plan.estimatedWeeks} hafta · günde {fmtInt(goal.plan.initialDailyCalorieTarget)} kcal
        </Text>
        <View style={styles.flooRow}>
          <Floo mood={mascot.mood === "happy" ? "cheer" : mascot.mood} size="m" testID="goal-success-floo" />
          <SpeechBubble text={mascot.text} tail="left" style={styles.bubble} testID="goal-success-bubble" />
        </View>
        <Button label="Yol haritasını gör" onPress={onRoadmap} full size="lg" iconRight="arrow-forward" testID="goal-see-roadmap" />
      </View>
    </Screen>
  );
}

function SetupSkeleton() {
  return (
    <SkeletonGroup testID="goal-setup-skeleton" style={styles.stack}>
      <Skeleton height={72} radius={radii.md} />
      <Skeleton height={168} radius={radii.card} />
      <Skeleton height={132} radius={radii.card} />
      <Skeleton height={PREVIEW_HEIGHT} radius={radii.card} />
      <Skeleton height={56} radius={radii.control + 2} />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  current: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radii.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 72 },
  currentTexts: { flex: 1, gap: 2 },
  currentValues: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing.sm },
  hint: { marginBottom: spacing.sm },
  profileHint: { marginTop: spacing.md, minHeight: 44 },
  successContent: { flexGrow: 1, justifyContent: "center" },
  success: { alignItems: "center", gap: spacing.lg, paddingVertical: spacing.xxl },
  flooRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, alignSelf: "stretch", marginTop: spacing.sm },
  bubble: { flex: 1 },
});
