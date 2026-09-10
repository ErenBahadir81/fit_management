import React from "react";
import { StyleSheet, View } from "react-native";
import type { NutritionDayView } from "@fitfloow/core";
import { RingChart } from "../../../charts/RingChart";
import { fmtInt } from "../../../lib/format";
import { spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Icon } from "../../../ui/Icon";
import { ProgressBar } from "../../../ui/ProgressBar";
import { Text } from "../../../ui/Text";
import { calorieRatio, calorieTone, macroRows } from "../model/day";

export const HERO_HEIGHT = 196;

/** Calorie ring + the three macro bars. Tapping opens the target sheet. */
export function CalorieHero({ day, onPressTarget }: { day: NutritionDayView; onPressTarget: () => void }) {
  const { totals, target, remaining } = day;
  const over = remaining.kcal < 0;
  const tone = calorieTone(totals.kcal, target.calories);
  const rows = macroRows(totals, target);

  return (
    <Card
      testID="nutrition-hero"
      style={styles.card}
      onPress={onPressTarget}
      accessibilityLabel={`${fmtInt(totals.kcal)} kilokalori alındı, hedef ${fmtInt(target.calories)}. ${fmtInt(Math.abs(remaining.kcal))} kilokalori ${over ? "fazla" : "kalan"}`}
    >
      <View style={styles.row}>
        <RingChart
          testID="nutrition-ring"
          value={calorieRatio(totals.kcal, target.calories)}
          label={fmtInt(Math.abs(remaining.kcal))}
          caption={over ? "fazla" : "kalan"}
          size={132}
          tone={tone}
        />
        <View style={styles.right}>
          <View style={styles.head}>
            <Text variant="label" color="inkMuted">
              {target.mode === "auto" ? "Günlük hedef" : "Hedefin"}
            </Text>
            <Icon name="options-outline" size={16} color="inkSubtle" />
          </View>
          <Text variant="title" tabular>
            {fmtInt(totals.kcal)}
            <Text variant="body" color="inkMuted" tabular>
              {" "}
              / {fmtInt(target.calories)} kcal
            </Text>
          </Text>
          <View style={styles.macros}>
            {rows.map((r) => (
              <ProgressBar
                key={r.key}
                testID={`macro-${r.key}`}
                value={r.value}
                tone={r.tone}
                height={6}
                label={r.label}
                valueLabel={`${fmtInt(r.eaten)} / ${fmtInt(r.target)} g`}
              />
            ))}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: HERO_HEIGHT, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  right: { flex: 1, gap: spacing.sm },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  macros: { gap: spacing.sm, marginTop: spacing.xxs },
});
