import React from "react";
import { StyleSheet, View } from "react-native";
import type { HomeDTO } from "@fitfloow/core";
import { fmtDate, fmtInt, fmtKg, fmtPct } from "../../../lib/format";
import { todayKey } from "../../../lib/dates";
import { useTheme } from "../../../theme/ThemeProvider";
import { spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { Ring } from "../../../ui/Ring";
import { Text } from "../../../ui/Text";
import { ON_TRACK_TR, etaBetweenTr } from "../../goals/goalIntent";
import { HOME_HEIGHTS } from "../HomeSkeleton";

export interface GoalHeroProps {
  goal: HomeDTO["goal"];
  today: HomeDTO["today"];
  /** Body-fat percentage the plan is aiming at. */
  targetBf: number | null;
  onOpenRoadmap: () => void;
  onSetGoal: () => void;
  onWeighIn: () => void;
}

/**
 * The home screen's anchor.
 *
 * Four questions, in this order, because that is the order people ask them: where am I, where am I
 * going, when do I get there, and did today move me. Everything else on the home screen is detail
 * hanging off this card.
 */
export function GoalHero({ goal, today, targetBf, onOpenRoadmap, onSetGoal, onWeighIn }: GoalHeroProps) {
  const { colors } = useTheme();
  if (!goal) return <NoGoal onSetGoal={onSetGoal} />;

  const track = ON_TRACK_TR[goal.onTrack];
  const arrival = goal.projectedDate;
  const eta = arrival ? etaBetweenTr(todayKey(), arrival) : `${goal.weeksRemainingPlan} hafta kaldı`;

  return (
    <Card
      variant="primary"
      onPress={onOpenRoadmap}
      style={styles.card}
      testID="home-goal-hero"
      accessibilityLabel={`Hedefin ${fmtPct(goal.percentComplete, 0)} tamamlandı, ${track.label}. ${arrival ? `${fmtDate(arrival, "medium")} tarihinde varıyorsun, ${eta}.` : ""} ${fmtKg(goal.kgToGo)} kaldı.`}
    >
      <View style={styles.head}>
        <Text variant="label" color="onPrimaryMuted">
          Hedefin
        </Text>
        <Chip label={track.label} tone={track.tone} size="sm" testID="home-goal-track" />
      </View>

      <View style={styles.row}>
        <Ring value={goal.percentComplete / 100} size={92} stroke={9} color={colors.onPrimary} trackColor={colors.onPrimaryBorder} gradient={false} testID="home-goal-ring">
          <Text variant="title" color="onPrimary" tabular>
            {fmtPct(goal.percentComplete, 0)}
          </Text>
        </Ring>
        <View style={styles.texts}>
          <Text variant="display" color="onPrimary" tabular numberOfLines={1} testID="home-goal-date">
            {arrival ? fmtDate(arrival, "medium") : "—"}
          </Text>
          <Text variant="body" color="onPrimaryMuted" tabular numberOfLines={1} testID="home-goal-where">
            {targetBf != null ? `${fmtPct(targetBf, 0)} yağ · ` : ""}
            {fmtKg(goal.kgToGo)} kaldı
          </Text>
          <Text variant="caption" color="onPrimaryMuted" tabular>
            {eta}
          </Text>
        </View>
      </View>

      <TodayLine today={today} onWeighIn={onWeighIn} />
    </Card>
  );
}

/** Did today move you toward it? One sentence, plus the weigh-in if it is still missing. */
function TodayLine({ today, onWeighIn }: { today: HomeDTO["today"]; onWeighIn: () => void }) {
  const { colors } = useTheme();
  const { eaten, target, remaining } = today.calories;
  const said = eaten > 0;
  const under = remaining >= 0;
  const sentence = !said
    ? "Bugün henüz kalori yazmadın."
    : under
      ? `Bugün hedefinin ${fmtInt(remaining)} kcal altındasın.`
      : `Bugün hedefini ${fmtInt(-remaining)} kcal aştın.`;

  return (
    <View style={[styles.todayRow, { borderTopColor: colors.onPrimaryBorder }]}>
      <Icon icon={!said ? "info" : under ? "check" : "warning"} size={16} color="onPrimary" />
      <Text variant="label" color="onPrimary" tabular style={styles.todayText} numberOfLines={2} testID="home-goal-today">
        {sentence}
        {said ? <Text variant="caption" color="onPrimaryMuted">{`  hedef ${fmtInt(target)} kcal`}</Text> : null}
      </Text>
      {today.weighedIn ? (
        <Icon icon="weighIn" size={16} color="onPrimaryMuted" />
      ) : (
        <Button label="Tartıl" variant="inverse" size="sm" icon="weighIn" onPress={onWeighIn} testID="home-weigh-in" />
      )}
    </View>
  );
}

/** No goal yet: the invitation gets the same weight the plan would, because it is the whole point. */
function NoGoal({ onSetGoal }: { onSetGoal: () => void }) {
  return (
    <Card variant="primary" style={styles.card} testID="home-goal-hero">
      <View style={styles.head}>
        <Text variant="label" color="onPrimaryMuted">
          Hedefin
        </Text>
      </View>
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
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 22 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  texts: { flex: 1, gap: 2 },
  todayRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, minHeight: spacing.touch },
  todayText: { flex: 1 },
  invite: { marginBottom: spacing.sm },
});
