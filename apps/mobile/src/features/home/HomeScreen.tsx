import React, { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import type { HomeDTO } from "@fitfloow/core";
import { Floo } from "../../mascot/Floo";
import { useTheme } from "../../theme/ThemeProvider";
import { radii, spacing } from "../../theme/tokens";
import { Chip } from "../../ui/Chip";
import { EmptyState } from "../../ui/EmptyState";
import { Entry } from "../../ui/Entry";
import { Icon } from "../../ui/Icon";
import { Reveal } from "../../ui/Reveal";
import { Screen } from "../../ui/Screen";
import { Text } from "../../ui/Text";
import { HomeSkeleton } from "./HomeSkeleton";
import { CalorieCard } from "./components/CalorieCard";
import { GoalCard } from "./components/GoalCard";
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
        {q.data ? <HomeContent data={q.data} onProgram={goProgram} onNutrition={goNutrition} onBody={goBody} /> : null}
      </Reveal>
    </Screen>
  );
}

function HomeContent({ data, onProgram, onNutrition, onBody }: { data: HomeDTO; onProgram: () => void; onNutrition: () => void; onBody: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stack}>
      <Entry index={0}>
        <MascotHeader data={data} />
      </Entry>
      {!data.today.weighedIn && (
        <Entry index={1}>
          <View style={[styles.nudge, { backgroundColor: colors.surfaceMuted }]}>
            <Icon name="scale-outline" size={18} color="primary" />
            <Text variant="bodyStrong" style={styles.nudgeText}>
              Bugün henüz tartılmadın
            </Text>
            <Chip label="Tartıl" tone="primary" size="sm" onPress={onBody} testID="home-weigh-in" />
          </View>
        </Entry>
      )}
      <Entry index={2}>
        <TodayCard today={data.today} onOpenProgram={onProgram} />
      </Entry>
      <Entry index={3}>
        <CalorieCard today={data.today} onPress={onNutrition} />
      </Entry>
      <Entry index={4}>
        <GoalCard goal={data.goal} targetBf={data.goal?.actualBodyFatPct != null ? data.goal.actualBodyFatPct - data.goal.bfToGo : null} onPress={onBody} />
      </Entry>
      <Entry index={5}>
        <RecoveryStrip recovery={data.recovery} onPress={onProgram} />
      </Entry>
      <Entry index={6}>
        <StreaksRow streaks={data.streaks} />
      </Entry>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  nudge: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radii.md, paddingVertical: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.sm, minHeight: 56 },
  nudgeText: { flex: 1 },
});
