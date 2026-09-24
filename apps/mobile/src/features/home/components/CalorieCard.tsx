import React from "react";
import { StyleSheet, View } from "react-native";
import type { HomeDTO } from "@fitfloow/core";
import { fmtInt } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { CountUp } from "../../../ui/CountUp";
import { Icon } from "../../../ui/Icon";
import { ProgressBar } from "../../../ui/ProgressBar";
import { Ring } from "../../../ui/Ring";
import { Text } from "../../../ui/Text";
import { HOME_HEIGHTS } from "../HomeSkeleton";

/**
 * The day in one sum, the way MyFitnessPal taught everyone to read it: target minus what you ate
 * is what is left. The ring (the app's one gradient) shows how much of the day is used; the number
 * in it counts to its new value whenever a meal lands. Only "left" changes colour, and only when it
 * goes negative.
 */
export function CalorieCard({ today, onPress }: { today: HomeDTO["today"]; onPress: () => void }) {
  const { colors } = useTheme();
  const { calories, protein } = today;
  const over = calories.remaining < 0;
  const ratio = calories.target > 0 ? calories.eaten / calories.target : 0;
  const left = Math.abs(calories.remaining);
  return (
    <Card
      onPress={onPress}
      style={styles.card}
      testID="home-calorie-card"
      accessibilityLabel={`Bugün ${fmtInt(calories.eaten)} kcal yedin, ${fmtInt(left)} kcal ${over ? "fazla" : "kalan"}`}
    >
      <View style={styles.head}>
        <Text variant="title">Bugün</Text>
        <Icon icon="forward" size={18} color="inkSubtle" />
      </View>
      <View style={styles.row}>
        <Ring value={Math.min(1, ratio)} size={128} stroke={11} tone={over ? "warning" : "primary"} gradient={!over} testID="home-calorie-ring">
          <CountUp value={left} format={fmtInt} variant="number" align="center" numberOfLines={1} adjustsFontSizeToFit tone={over ? "warning" : undefined} />
          <Text variant="caption" color="inkMuted" align="center">
            {over ? "kcal fazla" : "kcal kalan"}
          </Text>
        </Ring>
        <View style={styles.sum} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SumLine label="Hedef" value={fmtInt(calories.target)} />
          <SumLine label="Yenen" value={`− ${fmtInt(calories.eaten)}`} />
          <View style={[styles.rule, { backgroundColor: colors.border }]} />
          <SumLine label={over ? "Fazla" : "Kalan"} value={fmtInt(left)} strong tone={over ? "warning" : undefined} />
        </View>
      </View>
      <ProgressBar
        value={protein.target > 0 ? protein.eaten / protein.target : 0}
        tone="success"
        height={6}
        label="Protein"
        valueLabel={`${fmtInt(protein.eaten)} / ${fmtInt(protein.target)} g`}
      />
    </Card>
  );
}

function SumLine({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "warning" }) {
  return (
    <View style={styles.line}>
      <Text variant={strong ? "bodyStrong" : "body"} color={strong ? "ink" : "inkMuted"}>
        {label}
      </Text>
      <Text variant={strong ? "title" : "bodyStrong"} tabular tone={tone}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: HOME_HEIGHTS.calorie, gap: spacing.lg },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xl },
  sum: { flex: 1, gap: spacing.sm },
  line: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.sm },
  rule: { height: StyleSheet.hairlineWidth },
});
