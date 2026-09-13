import React, { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import type { HomeDTO } from "@fitfloow/core";
import { Floo } from "../../mascot/Floo";
import { spacing } from "../../theme/tokens";
import { EmptyState } from "../../ui/EmptyState";
import { Entry } from "../../ui/Entry";
import { Reveal } from "../../ui/Reveal";
import { Screen } from "../../ui/Screen";
import { HomeSkeleton } from "./HomeSkeleton";
import { CalorieCard } from "./components/CalorieCard";
import { GoalHero } from "./components/GoalHero";
import { MascotHeader } from "./components/MascotHeader";
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
 * Order matters here: the goal is the anchor and everything under it is the day's work *toward*
 * that goal. The weigh-in nudge used to be a floating strip; it now lives inside the hero, because
 * weighing in is how the goal stays honest, not a separate chore.
 */
function HomeContent({ data, onProgram, onNutrition, onBody, onRoadmap, onSetGoal }: HomeContentProps) {
  const targetBf = data.goal?.actualBodyFatPct != null ? data.goal.actualBodyFatPct - data.goal.bfToGo : null;
  return (
    <View style={styles.stack}>
      <Entry index={0}>
        <MascotHeader data={data} />
      </Entry>
      <Entry index={1}>
        <GoalHero goal={data.goal} today={data.today} targetBf={targetBf} onOpenRoadmap={onRoadmap} onSetGoal={onSetGoal} onWeighIn={onBody} />
      </Entry>
      <Entry index={2}>
        <TodayCard today={data.today} onOpenProgram={onProgram} />
      </Entry>
      <Entry index={3}>
        <CalorieCard today={data.today} onPress={onNutrition} />
      </Entry>
      <Entry index={4}>
        <RecoveryStrip recovery={data.recovery} onPress={onProgram} />
      </Entry>
      <Entry index={5}>
        <StreaksRow streaks={data.streaks} />
      </Entry>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
});
