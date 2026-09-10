import React from "react";
import { StyleSheet, View } from "react-native";
import type { HomeDTO, RecoveryStatus } from "@fitfloow/core";
import { fmtPct } from "../../../lib/format";
import { spacing, type Tone } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { Ring } from "../../../ui/Ring";
import { Text } from "../../../ui/Text";
import { HOME_HEIGHTS } from "../HomeSkeleton";

export const RECOVERY_TR: Record<RecoveryStatus, { label: string; tone: Tone }> = {
  ready: { label: "Hazır", tone: "success" },
  recovering: { label: "Toparlanıyor", tone: "warning" },
  fatigued: { label: "Yorgun", tone: "danger" },
};

export function RecoveryStrip({ recovery, onPress }: { recovery: HomeDTO["recovery"]; onPress: () => void }) {
  const s = RECOVERY_TR[recovery.status];
  return (
    <Card onPress={onPress} style={styles.min} testID="home-recovery" accessibilityLabel={`Toparlanma ${fmtPct(recovery.readiness, 0)}, ${s.label}`}>
      <View style={styles.row}>
        <Ring value={recovery.readiness / 100} size={64} tone={s.tone} gradient={false}>
          <Text variant="label" tabular>
            {Math.round(recovery.readiness)}
          </Text>
        </Ring>
        <View style={styles.texts}>
          <Text variant="label" color="inkMuted">
            Toparlanma
          </Text>
          <Text variant="heading">{s.label}</Text>
          <Text variant="caption" color="inkMuted">
            {recovery.readyCount} kas hazır · {recovery.fatiguedCount} yorgun
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color="inkSubtle" />
      </View>
      <View style={styles.chips}>
        {recovery.top.map((m) => (
          <Chip key={m.key} label={`${m.name} ${fmtPct(m.readiness, 0)}`} dot={m.color} size="sm" tone={RECOVERY_TR[m.status].tone} />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  min: { minHeight: HOME_HEIGHTS.recovery, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  texts: { flex: 1, gap: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
});
