import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import type { GoalFeedback as GoalFeedbackDTO } from "@fitfloow/core";
import { toFlooMood, useFloo, useFlooEvents } from "../../../mascot";
import { springs } from "../../../theme/motion";
import { spacing, type Tone } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { ProgressBar } from "../../../ui/ProgressBar";
import { Text } from "../../../ui/Text";
import { useGoalView } from "../useGoal";

const STATUS: Record<GoalFeedbackDTO["status"], { label: string; tone: Tone }> = {
  ahead: { label: "Plandan önde", tone: "success" },
  onTrack: { label: "Planda", tone: "primary" },
  behind: { label: "Plandan geride", tone: "warning" },
  stalled: { label: "Durağan", tone: "warning" },
  noData: { label: "Veri bekleniyor", tone: "neutral" },
  reached: { label: "Hedefe vardın", tone: "success" },
};

/**
 * T7 — the goal's reaction to the latest weigh-in or measurement. The bars live on the body tab;
 * right after a new measurement, Floo says the engine's line and the card gives a little jump so the
 * eye goes to what moved.
 */
export function GoalFeedback() {
  const view = useGoalView();
  const { say } = useFloo();
  const feedback = view.data?.goal?.status === "active" ? view.data.feedback : null;

  // A measurement was saved: wait for the goal to refetch (the mutation invalidates it), then speak.
  const awaiting = useRef<number | null>(null);
  useFlooEvents((e) => {
    if (e.name === "measurementLogged") awaiting.current = e.at;
  });
  const updatedAt = view.dataUpdatedAt;
  const bump = useSharedValue(1);
  const reduce = useReducedMotion();
  useEffect(() => {
    const since = awaiting.current;
    if (since == null || updatedAt <= since || !feedback) return;
    awaiting.current = null;
    say({ text: feedback.textTr, mood: toFlooMood(feedback.mood), priority: "high", tone: feedback.tone === "attention" ? "warning" : feedback.tone === "positive" ? "success" : "neutral", dedupeKey: `goal:feedback:${updatedAt}` });
    if (!reduce) bump.value = withSequence(withTiming(1.04, { duration: 140 }), withSpring(1, springs.bouncy));
  }, [updatedAt, feedback, say, bump, reduce]);
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));

  if (!feedback) return null;
  const status = STATUS[feedback.status];
  const bars: { key: string; label: string; value: number | null; tone: Tone }[] = [
    { key: "goal", label: "Hedef", value: feedback.bars.goal, tone: "primary" },
    { key: "time", label: "Geçen süre", value: feedback.bars.time, tone: "neutral" },
    { key: "fat", label: "Yağ", value: feedback.bars.fat, tone: "warning" },
    { key: "lean", label: "Kas", value: feedback.bars.lean, tone: "success" },
  ];
  const saved = feedback.weeksSaved;
  return (
    <Animated.View style={bumpStyle}>
      <Card style={styles.card} testID="goal-feedback" accessibilityLabel={`${status.label}. ${feedback.textTr}`}>
        <View style={styles.head}>
          <Icon icon="goal" size={18} color="primary" />
          <Text variant="label" color="inkMuted" style={styles.flex}>
            Gidişat
          </Text>
          <Chip label={status.label} tone={status.tone} size="sm" testID="goal-feedback-status" />
        </View>
        <Text variant="body" testID="goal-feedback-text">
          {feedback.textTr}
        </Text>
        {bars
          .filter((b) => b.value != null)
          .map((b) => (
            <ProgressBar key={b.key} value={(b.value ?? 0) / 100} tone={b.tone} height={6} label={b.label} valueLabel={`%${Math.round(b.value ?? 0)}`} testID={`goal-feedback-bar-${b.key}`} />
          ))}
        {saved != null && Math.abs(saved) >= 1 && (feedback.status === "ahead" || feedback.status === "behind") ? (
          <Text variant="caption" color="inkMuted" tabular>
            {saved > 0 ? `Bu gidişle ${Math.round(saved)} hafta erken varıyorsun.` : `Bu gidişle ${Math.round(-saved)} hafta geç varıyorsun.`}
          </Text>
        ) : null}
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
});
