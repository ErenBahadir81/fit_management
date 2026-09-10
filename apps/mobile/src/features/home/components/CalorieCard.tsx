import React from "react";
import { StyleSheet, View } from "react-native";
import type { HomeDTO } from "@fitfloow/core";
import { RingChart } from "../../../charts/RingChart";
import { fmtInt } from "../../../lib/format";
import { spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Icon } from "../../../ui/Icon";
import { ProgressBar } from "../../../ui/ProgressBar";
import { Text } from "../../../ui/Text";
import { HOME_HEIGHTS } from "../HomeSkeleton";

export function CalorieCard({ today, onPress }: { today: HomeDTO["today"]; onPress: () => void }) {
  const { calories, protein } = today;
  const over = calories.remaining < 0;
  const ratio = calories.target > 0 ? calories.eaten / calories.target : 0;
  return (
    <Card onPress={onPress} style={styles.min} testID="home-calorie-card" accessibilityLabel={`Bugün ${fmtInt(calories.eaten)} kcal yedin, ${fmtInt(Math.abs(calories.remaining))} kcal ${over ? "fazla" : "kalan"}`}>
      <View style={styles.row}>
        <RingChart value={Math.min(1, ratio)} label={fmtInt(Math.abs(calories.remaining))} caption={over ? "fazla" : "kalan"} size={120} tone={over ? "warning" : "primary"} testID="home-calorie-ring" />
        <View style={styles.right}>
          <View style={styles.head}>
            <Text variant="label" color="inkMuted">
              Bugün
            </Text>
            <Icon name="chevron-forward" size={16} color="inkSubtle" />
          </View>
          <Text variant="title" tabular>
            {fmtInt(calories.eaten)}
            <Text variant="body" color="inkMuted" tabular>
              {" "}/ {fmtInt(calories.target)} kcal
            </Text>
          </Text>
          <ProgressBar value={protein.target > 0 ? protein.eaten / protein.target : 0} tone="success" label="Protein" valueLabel={`${fmtInt(protein.eaten)} / ${fmtInt(protein.target)} g`} style={styles.protein} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  min: { minHeight: HOME_HEIGHTS.calorie, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  right: { flex: 1, gap: spacing.sm },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  protein: { marginTop: spacing.xs },
});
