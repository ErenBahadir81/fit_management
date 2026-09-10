import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { MuscleVolume } from "@fitfloow/core";
import { fmtNumber } from "../../../lib/format";
import { spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { ProgressBar } from "../../../ui/ProgressBar";
import { Text } from "../../../ui/Text";
import { volumeBars, VOLUME_TR } from "../lib/present";

export const VOLUME_CARD_MIN_HEIGHT = 232;
const COLLAPSED = 5;

/** Weekly sets per muscle against the target — under / in range / over, busiest first. */
export function VolumeCard({ volume }: { volume: readonly MuscleVolume[] }) {
  const [expanded, setExpanded] = useState(false);
  const bars = volumeBars(volume);
  if (bars.length === 0) return null;
  const shown = expanded ? bars : bars.slice(0, COLLAPSED);
  const inRange = bars.filter((b) => b.status === "in").length;

  return (
    <Card style={styles.card} testID="volume-card">
      <View style={styles.head}>
        <View style={styles.headTexts}>
          <Text variant="title">Haftalık hacim</Text>
          <Text variant="caption" color="inkMuted" tabular>
            {inRange}/{bars.length} kas hedef aralığında
          </Text>
        </View>
      </View>
      <View style={styles.rows}>
        {shown.map((b) => (
          <View key={b.key} style={styles.row} testID={`volume-${b.key}`}>
            <View style={styles.rowHead}>
              <Text variant="label" numberOfLines={1} style={styles.name}>
                {b.name}
              </Text>
              <Text variant="caption" color="inkMuted" tabular>
                {fmtNumber(b.done, b.done % 1 === 0 ? 0 : 1)} / {b.max} set
              </Text>
            </View>
            <ProgressBar value={b.value} tone={b.tone} height={6} accessibilityLabel={`${b.name}, ${fmtNumber(b.done, 0)} set, ${VOLUME_TR[b.status]}`} />
          </View>
        ))}
      </View>
      {bars.length > COLLAPSED ? (
        <Chip
          label={expanded ? "Daha az göster" : `+${bars.length - COLLAPSED} kas daha`}
          size="sm"
          icon={expanded ? "chevron-up" : "chevron-down"}
          onPress={() => setExpanded((v) => !v)}
          testID="volume-toggle"
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: VOLUME_CARD_MIN_HEIGHT, gap: spacing.md },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headTexts: { gap: 2, flex: 1 },
  rows: { gap: spacing.md },
  row: { gap: spacing.xs + 2 },
  rowHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  name: { flexShrink: 1 },
});
