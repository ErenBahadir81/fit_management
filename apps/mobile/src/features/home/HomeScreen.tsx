import React, { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import type { HomeDTO } from "@fitfloow/core";
import { Floo, overTargetKey, useFlooOnce } from "../../mascot";
import { fmtInt } from "../../lib/format";
import { spacing } from "../../theme/tokens";
import { EmptyState } from "../../ui/EmptyState";
import { GoalAdjustment } from "../goals/components/GoalAdjustment";
import { Reveal } from "../../ui/Reveal";
import { Screen } from "../../ui/Screen";
import { HomeSkeleton } from "./HomeSkeleton";
import { CalorieCard } from "./components/CalorieCard";
import { GoalStrip } from "./components/GoalStrip";
import { HomeHeader } from "./components/HomeHeader";
import { RecoveryStrip } from "./components/RecoveryStrip";
import { StreaksRow } from "./components/StreaksRow";
import { TodayCard } from "./components/TodayCard";
import { useHome } from "./useHome";

/** Home: one query, cache-first, skeleton only when cold, staggered entry. */
export function HomeScreen() {
  const q = useHome();
  const router = useRouter();
  const goProgram = useCallback(() => router.push("/(tabs)/program"), [router]);
  const goNutrition = useCallback(() => router.push("/(tabs)/nutrition"), [router]);
  const goBody = useCallback(() => router.push("/(tabs)/body"), [router]);
  const goRoadmap = useCallback(() => router.push("/(modals)/goal/roadmap"), [router]);
  const goSetGoal = useCallback(() => router.push("/(modals)/goal/setup"), [router]);

  if (q.isError && !q.data) {
    return (
      <Screen>
        <EmptyState
          illustration={<Floo mood="worried" size="m" />}
          title="Bir şeyler ters gitti"
          body="Ana sayfa yüklenemedi. Bağlantını kontrol edip tekrar dene."
          action={{ label: "Tekrar dene", onPress: () => void q.refetch(), icon: "refresh" }}
        />
      </Screen>
    );
  }

  return (
    <Screen refreshing={q.isRefetching && !q.isPending} onRefresh={() => void q.refetch()}>
      <Reveal ready={Boolean(q.data)} skeleton={<HomeSkeleton />}>
        {q.data ? (
          <HomeContent data={q.data} onProgram={goProgram} onNutrition={goNutrition} onBody={goBody} onRoadmap={goRoadmap} onSetGoal={goSetGoal} />
        ) : null}
      </Reveal>
    </Screen>
  );
}

interface HomeContentProps {
  data: HomeDTO;
  onProgram: () => void;
  onNutrition: () => void;
  onBody: () => void;
  onRoadmap: () => void;
  onSetGoal: () => void;
}

/**
 * Order: the goal is the line the day hangs from (compact, at the top), then the day's sum, then
 * the day's workout, then how the body is doing. One primary action on the screen: start the
 * workout. No entry cascade: `Reveal` crossfades the skeleton once, and a warm cache shows the
 * screen as it is. Six cards sliding in on every visit was what made the screen feel tiring.
 */
function HomeContent({ data, onProgram, onNutrition, onBody, onRoadmap, onSetGoal }: HomeContentProps) {
  const targetBf = data.goal?.actualBodyFatPct != null ? data.goal.actualBodyFatPct - data.goal.bfToGo : null;
  const over = data.today.calories.remaining < 0 ? -data.today.calories.remaining : 0;
  // Going over the day's target is a warning, so it is Floo's to say, once per day. The key is the
  // one the meal that crossed the target already used, so Floo never tells the same day twice.
  useFlooOnce(over > 0 ? overTargetKey(data.today.dateKey) : null, {
    text: `Bugün hedefini ${fmtInt(over)} kcal aştın. Sorun değil, yarın biraz dengeleriz.`,
    priority: "high",
    mood: "worried",
    trigger: "overTarget",
    action: { label: "Beslenmeye git", onPress: onNutrition },
  });
  return (
    <View style={styles.stack}>
      <HomeHeader data={data} />
      <GoalStrip goal={data.goal} today={data.today} targetBf={targetBf} onOpenRoadmap={onRoadmap} onSetGoal={onSetGoal} onWeighIn={onBody} />
      <GoalAdjustment />
      <CalorieCard today={data.today} onPress={onNutrition} />
      <TodayCard today={data.today} onOpenProgram={onProgram} />
      <RecoveryStrip recovery={data.recovery} onPress={onProgram} />
      <StreaksRow streaks={data.streaks} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.cardGap },
});
