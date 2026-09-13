import React from "react";
import { StyleSheet, View } from "react-native";
import type { HomeDTO } from "@fitfloow/core";
import { spacing } from "../../../theme/tokens";
import { StatTile } from "../../../ui/StatTile";
import { HOME_HEIGHTS } from "../HomeSkeleton";

export function StreaksRow({ streaks }: { streaks: HomeDTO["streaks"] }) {
  return (
    <View style={styles.row} accessibilityLabel="Seriler">
      <StatTile label="Antrenman" value={String(streaks.workout)} hint="gün" icon="streak" tone={streaks.workout > 0 ? "primary" : undefined} style={styles.tile} />
      <StatTile label="Kayıt" value={String(streaks.logging)} hint="gün" icon="meal" style={styles.tile} />
      <StatTile label="Tartı" value={String(streaks.weighIn)} hint="gün" icon="weighIn" style={styles.tile} />
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", gap: spacing.md }, tile: { minHeight: HOME_HEIGHTS.tile } });
