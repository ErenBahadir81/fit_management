import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import type { GoalAdjustmentAction, GoalAdjustmentProposal, GoalPlanSnapshot } from "@fitfloow/core";
import { fmtDate, fmtInt } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { springs } from "../../../theme/motion";
import { radii, spacing, type Tone } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";

const KIND: Record<GoalAdjustmentProposal["kind"], { label: string; tone: Tone }> = {
  ahead: { label: "Plandan hızlısın", tone: "success" },
  behind: { label: "Plandan yavaşsın", tone: "warning" },
  stalled: { label: "Trend durdu", tone: "warning" },
  reached: { label: "Hedefe vardın", tone: "success" },
};

export interface AdjustmentCardProps {
  proposal: GoalAdjustmentProposal;
  /** Accept the chosen option (omitted action = the recommended one on the server too). */
  onAccept: (action: GoalAdjustmentAction) => void;
  onDismiss: () => void;
  busy?: boolean;
}

/**
 * Floo's adjustment proposal (T7): never applied silently. Floo says the why in the corner; the
 * card holds what a person compares before one tap: the options (the recommended one preselected)
 * and the plan before and after the chosen one.
 */
export function AdjustmentCard({ proposal, onAccept, onDismiss, busy }: AdjustmentCardProps) {
  const recommended = proposal.options.find((o) => o.recommended) ?? proposal.options[0]!;
  // Keyed by proposal: a new proposal (another id) starts from its own recommendation.
  const [pick, setPick] = useState<{ id: string; action: GoalAdjustmentAction } | null>(null);
  const chosen = pick?.id === proposal.id ? pick.action : recommended.action;
  const setChosen = (action: GoalAdjustmentAction) => setPick({ id: proposal.id, action });
  const option = proposal.options.find((o) => o.action === chosen) ?? recommended;
  const kind = KIND[proposal.kind];

  return (
    <Card style={styles.card} testID="goal-adjustment" accessibilityLabel={`${proposal.titleTr}. ${proposal.messageTr}`}>
      {/* Keyed so a new proposal pops again. */}
      <Pop key={proposal.id}>
        <View style={styles.head}>
          <Icon icon="goal" size={18} color="primary" />
          <Text variant="label" color="inkMuted" style={styles.flex}>
            {"Floo'nun önerisi"}
          </Text>
          <Chip label={kind.label} tone={kind.tone} size="sm" />
        </View>
      </Pop>
      <Text variant="title" testID="goal-adjustment-title">
        {proposal.titleTr}
      </Text>
      <Text variant="body" color="inkMuted">
        {proposal.messageTr}
      </Text>
      {proposal.options.length > 1 ? (
        <View style={styles.options} accessibilityRole="radiogroup">
          {proposal.options.map((o) => (
            <OptionRow key={o.action} label={o.labelTr} recommended={o.recommended} selected={o.action === chosen} onPress={() => setChosen(o.action)} testID={`goal-adjustment-option-${o.action}`} />
          ))}
        </View>
      ) : null}
      {option.after ? <Compare before={proposal.before} after={option.after} /> : null}
      <View style={styles.actions}>
        <Button label="Şimdilik değil" variant="ghost" size="sm" onPress={onDismiss} disabled={busy} testID="goal-adjustment-dismiss" />
        <Button
          label={proposal.options.length > 1 ? "Uygula" : option.labelTr}
          size="sm"
          icon="check"
          onPress={() => onAccept(option.action)}
          loading={busy}
          style={styles.flex}
          testID="goal-adjustment-accept"
        />
      </View>
    </Card>
  );
}

/** A small overshoot on mount: the card is news, and it should read as Floo handing it over. */
function Pop({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const s = useSharedValue(reduce ? 1 : 0.6);
  useEffect(() => {
    s.value = reduce ? 1 : withSpring(1, springs.bouncy);
  }, [reduce, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: Math.min(1, s.value) }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function OptionRow({ label, recommended, selected, onPress, testID }: { label: string; recommended: boolean; selected: boolean; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const dot = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    dot.value = reduce ? withTiming(selected ? 1 : 0, { duration: 120 }) : withSpring(selected ? 1 : 0, springs.snappy);
  }, [selected, reduce, dot]);
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dot.value }] }));
  return (
    <Pressable
      onPress={onPress}
      haptic="select"
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={recommended ? `${label}, önerilen` : label}
      testID={testID}
      style={[styles.option, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.surface }]}
    >
      <View style={[styles.radio, { borderColor: selected ? colors.primary : colors.border }]}>
        <Animated.View style={[styles.radioDot, { backgroundColor: colors.primary }, dotStyle]} />
      </View>
      <Text variant="bodyStrong" style={styles.flex}>
        {label}
      </Text>
      {recommended ? <Chip label="Önerilen" tone="primary" size="sm" /> : null}
    </Pressable>
  );
}

function Compare({ before, after }: { before: GoalPlanSnapshot; after: GoalPlanSnapshot }) {
  const { colors } = useTheme();
  const rows: { label: string; from: string; to: string; changed: boolean }[] = [
    { label: "Günlük kalori", from: `${fmtInt(before.dailyCalorieTarget)} kcal`, to: `${fmtInt(after.dailyCalorieTarget)} kcal`, changed: Math.round(before.dailyCalorieTarget) !== Math.round(after.dailyCalorieTarget) },
    { label: "Varış", from: fmtDate(before.targetDate, "medium"), to: fmtDate(after.targetDate, "medium"), changed: before.targetDate !== after.targetDate },
    { label: "Hedef yağ", from: `%${before.targetBodyFatPct}`, to: `%${after.targetBodyFatPct}`, changed: before.targetBodyFatPct !== after.targetBodyFatPct },
  ];
  return (
    <View style={[styles.compare, { backgroundColor: colors.surfaceMuted }]} testID="goal-adjustment-compare">
      {rows
        .filter((r) => r.changed)
        .map((r) => (
          <View key={r.label} style={styles.compareRow}>
            <Text variant="caption" color="inkMuted" style={styles.flex}>
              {r.label}
            </Text>
            <Text variant="caption" color="inkMuted" tabular style={styles.strike}>
              {r.from}
            </Text>
            <Icon icon="forward" size={14} color="inkMuted" />
            <Text variant="label" tone="primary" tabular>
              {r.to}
            </Text>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
  options: { gap: spacing.xs },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radii.control, borderWidth: 1.5 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  compare: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.control },
  compareRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  strike: { textDecorationLine: "line-through" },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
});
