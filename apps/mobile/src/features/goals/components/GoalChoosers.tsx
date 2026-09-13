import React from "react";
import { StyleSheet, View } from "react-native";
import type { GoalPlan, GoalProfile } from "@fitfloow/core";
import { fmtDate, fmtInt, fmtNumber } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { INTENT_OPTIONS, PACE_OPTIONS, type GoalIntent } from "../goalIntent";

/* ------------------------------------------------------------------ intent */

export interface IntentPickerProps {
  value: GoalIntent | null;
  onChange: (v: GoalIntent) => void;
  testID?: string;
}

/**
 * "What are you here to do?" — the first question, before any number.
 *
 * Three full-width options rather than a segmented control: each one needs a sentence to explain
 * what picking it actually changes, and a 3-way segment has nowhere to put one.
 */
export function IntentPicker({ value, onChange, testID }: IntentPickerProps) {
  return (
    <View style={styles.list} testID={testID}>
      {INTENT_OPTIONS.map((o) => (
        <OptionRow
          key={o.value}
          selected={value === o.value}
          onPress={() => onChange(o.value)}
          icon={o.icon}
          title={o.label}
          body={o.body}
          testID={testID ? `${testID}-${o.value}` : undefined}
        />
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------- pace */

export interface PacePickerProps {
  value: GoalProfile;
  onChange: (v: GoalProfile) => void;
  /** The plan each pace produces, so the choice is a comparison rather than a guess. */
  plans: Partial<Record<GoalProfile, GoalPlan | null>>;
  testID?: string;
}

/**
 * "How fast?" — with each option carrying its own arrival date and daily calories.
 *
 * The old screen made you pick a word ("Agresif") and then look elsewhere to find out what it cost.
 * Here the cost is on the option itself, live, so the trade-off is visible before you commit.
 */
export function PacePicker({ value, onChange, plans, testID }: PacePickerProps) {
  return (
    <View style={styles.list} testID={testID}>
      {PACE_OPTIONS.map((o) => {
        const plan = plans[o.value];
        const reachable = plan && plan.roadmap.length > 0;
        return (
          <OptionRow
            key={o.value}
            selected={value === o.value}
            onPress={() => onChange(o.value)}
            icon="pace"
            title={o.label}
            body={o.body}
            testID={testID ? `${testID}-${o.value}` : undefined}
            trailing={
              reachable ? (
                <View style={styles.pace}>
                  <Text variant="bodyStrong" tabular numberOfLines={1} testID={testID ? `${testID}-${o.value}-date` : undefined}>
                    {fmtDate(plan.targetDate, "short")}
                  </Text>
                  <Text variant="caption" color="inkMuted" tabular numberOfLines={1}>
                    {fmtInt(plan.initialDailyCalorieTarget)} kcal
                  </Text>
                  <Text variant="caption" color="inkSubtle" tabular numberOfLines={1}>
                    {fmtNumber(plan.initialRateKgPerWeek, 2)} kg/hf
                  </Text>
                </View>
              ) : null
            }
          />
        );
      })}
    </View>
  );
}

/* --------------------------------------------------------------------- row */

interface OptionRowProps {
  selected: boolean;
  onPress: () => void;
  icon: React.ComponentProps<typeof Icon>["icon"];
  title: string;
  body: string;
  trailing?: React.ReactNode;
  testID?: string;
}

function OptionRow({ selected, onPress, icon, title, body, trailing, testID }: OptionRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      haptic="select"
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${body}`}
      testID={testID}
      style={[styles.row, { backgroundColor: selected ? colors.primarySoft : colors.surface, borderColor: selected ? colors.primary : colors.border }]}
    >
      <View style={[styles.badge, { backgroundColor: selected ? colors.primary : colors.surfaceMuted }]}>
        <Icon icon={icon} size={18} color={selected ? "onPrimary" : "inkMuted"} />
      </View>
      <View style={styles.texts}>
        <Text variant="title">{title}</Text>
        <Text variant="body" color="inkMuted">
          {body}
        </Text>
      </View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 76, padding: spacing.lg, borderRadius: radii.md, borderWidth: 1.5 },
  badge: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  texts: { flex: 1, gap: 2 },
  pace: { alignItems: "flex-end", gap: 1 },
});
