import React from "react";
import { StyleSheet, View } from "react-native";
import type { HomeDTO } from "@fitfloow/core";
import { fmtDate, fmtKg, fmtPct } from "../../../lib/format";
import { todayKey } from "../../../lib/dates";
import { spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { ProgressBar } from "../../../ui/ProgressBar";
import { Text } from "../../../ui/Text";
import { ON_TRACK_TR, etaBetweenTr } from "../../goals/goalIntent";
import { HOME_HEIGHTS } from "../HomeSkeleton";

export interface GoalStripProps {
  goal: HomeDTO["goal"];
  today: HomeDTO["today"];
  /** Body-fat percentage the plan is aiming at. */
  targetBf: number | null;
  onOpenRoadmap: () => void;
  onSetGoal: () => void;
  onWeighIn: () => void;
}

/**
 * The goal, as the line the day hangs from: where you land, when, and how far along you are.
 * Compact on purpose. The day's own numbers are the big card below it; the full plan is one tap
 * away (the roadmap). Weighing in lives here because it is how the goal stays honest.
 */
export function GoalStrip({ goal, today, targetBf, onOpenRoadmap, onSetGoal, onWeighIn }: GoalStripProps) {
  if (!goal) return <NoGoal onSetGoal={onSetGoal} />;
  const track = ON_TRACK_TR[goal.onTrack];
  const arrival = goal.projectedDate;
  const eta = arrival ? etaBetweenTr(todayKey(), arrival) : `${goal.weeksRemainingPlan} hafta kaldı`;
  const pct = Math.round(goal.percentComplete);

  return (
    <Card
      onPress={onOpenRoadmap}
      style={styles.card}
      testID="home-goal-hero"
      accessibilityLabel={`Hedefin yüzde ${pct} tamamlandı, ${track.label}. ${arrival ? `${fmtDate(arrival, "medium")} tarihinde varıyorsun, ${eta}.` : ""} ${fmtKg(goal.kgToGo)} kaldı.`}
    >
      <View style={styles.head}>
        <Icon icon="goal" size={18} color="primary" />
        <Text variant="label" color="inkMuted" style={styles.flex}>
          Hedefin
        </Text>
        <Chip label={track.label} tone={track.tone} size="sm" testID="home-goal-track" />
      </View>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text variant="heading" tabular numberOfLines={1} testID="home-goal-date">
            {arrival ? fmtDate(arrival, "medium") : "Tarih hesaplanıyor"}
          </Text>
          <Text variant="body" color="inkMuted" tabular numberOfLines={1} testID="home-goal-where">
            {targetBf != null ? `${fmtPct(targetBf, 0)} yağ, ` : ""}
            {`${fmtKg(goal.kgToGo)} kaldı`}
          </Text>
        </View>
        <Text variant="number" tone="primary" tabular>
          {fmtPct(goal.percentComplete, 0)}
        </Text>
      </View>
      <ProgressBar
        value={goal.percentComplete / 100}
        height={6}
        accessibilityLabel={`Hedef ilerlemesi yüzde ${pct}`}
        testID="home-goal-ring"
      />
      <View style={styles.foot}>
        <Text variant="caption" color="inkMuted" tabular style={styles.flex} testID="home-goal-today">
          {today.weighedIn ? `Bugün tartıldın. ${eta}.` : `${eta}. Bugün henüz tartılmadın.`}
        </Text>
        {today.weighedIn ? null : <Button label="Tartıl" variant="secondary" size="sm" icon="weighIn" onPress={onWeighIn} testID="home-weigh-in" />}
      </View>
    </Card>
  );
}

/** No goal yet: the one solid-blue card on the screen, because choosing one is the whole point. */
function NoGoal({ onSetGoal }: { onSetGoal: () => void }) {
  return (
    <Card variant="primary" style={styles.card} testID="home-goal-hero">
      <Text variant="label" color="onPrimaryMuted">
        Hedefin
      </Text>
      <Text variant="display" color="onPrimary">
        Nereye gidiyoruz?
      </Text>
      <Text variant="body" color="onPrimaryMuted" style={styles.invite}>
        Bir yağ oranı seç; kaç hafta süreceğini, hangi gün varacağını ve günde kaç kalori yiyeceğini hesaplayayım.
      </Text>
      <Button label="Hedef belirle" onPress={onSetGoal} variant="inverse" full icon="goal" testID="home-set-goal" />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: HOME_HEIGHTS.goal, gap: spacing.md },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 24 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md },
  flex: { flex: 1 },
  foot: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 40 },
  invite: { marginBottom: spacing.sm },
});
