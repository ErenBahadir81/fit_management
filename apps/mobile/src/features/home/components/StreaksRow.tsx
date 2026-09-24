import React from "react";
import { StyleSheet, View } from "react-native";
import type { HomeDTO } from "@fitfloow/core";
import { useTheme } from "../../../theme/ThemeProvider";
import { spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Icon } from "../../../ui/Icon";
import type { AppIcon } from "../../../ui/icons";
import { Text } from "../../../ui/Text";
import { HOME_HEIGHTS } from "../HomeSkeleton";

/** Three streaks in one flat card, split by hairlines: one glance, not three boxes to parse. */
export function StreaksRow({ streaks }: { streaks: HomeDTO["streaks"] }) {
  const { colors } = useTheme();
  const items: { label: string; value: number; icon: AppIcon }[] = [
    { label: "Antrenman", value: streaks.workout, icon: "streak" },
    { label: "Kayıt", value: streaks.logging, icon: "meal" },
    { label: "Tartı", value: streaks.weighIn, icon: "weighIn" },
  ];
  return (
    <Card style={styles.card} padded={false} accessibilityLabel={`Seriler: ${items.map((i) => `${i.label} ${i.value} gün`).join(", ")}`} testID="home-streaks">
      {items.map((item, i) => (
        <View key={item.label} style={[styles.cell, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}>
          <View style={styles.top}>
            <Icon icon={item.icon} size={16} color={item.value > 0 ? "primary" : "inkSubtle"} />
            <Text variant="caption" color="inkMuted">
              {item.label}
            </Text>
          </View>
          <Text variant="number" tabular>
            {item.value}
            <Text variant="caption" color="inkMuted">
              {" gün"}
            </Text>
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", minHeight: HOME_HEIGHTS.tile },
  cell: { flex: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.xs, justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
});
