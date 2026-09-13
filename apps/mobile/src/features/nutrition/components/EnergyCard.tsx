import React from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { EnergyDTO } from "@fitfloow/core";
import { fmtInt } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Divider } from "../../../ui/Divider";
import { Skeleton, SkeletonGroup } from "../../../ui/Skeleton";
import { Text } from "../../../ui/Text";
import { fetchEnergy } from "../../onboarding/api";
import { energyRows, explainEnergy } from "../energyCopy";

export const ENERGY_KEY = ["me", "energy"] as const;
export const ENERGY_CARD_HEIGHT = 268;

/** `GET /me/energy`. Changes only when the goal or a measurement does, so it can sit stale a while. */
export function useEnergy() {
  return useQuery<EnergyDTO>({ queryKey: ENERGY_KEY, queryFn: fetchEnergy, staleTime: 10 * 60_000 });
}

export interface EnergyCardProps {
  onSetGoal: () => void;
  onAddMeasurement: () => void;
  testID?: string;
}

/**
 * "Yaklaşık kalori ihtiyacın."
 *
 * The ring above this card says how much is left today; this says where that number came from —
 * what the body burns at rest, what it burns with the day's movement, and what the plan subtracts.
 * Without it the daily target is a number handed down from nowhere.
 */
export function EnergyCard({ onSetGoal, onAddMeasurement, testID = "energy-card" }: EnergyCardProps) {
  const q = useEnergy();

  if (q.isPending && !q.data) return <EnergySkeleton testID={`${testID}-skeleton`} />;
  if (!q.data) {
    return (
      <Card variant="muted" style={styles.card} testID={`${testID}-error`}>
        <Text variant="title">Kalori ihtiyacın getirilemedi</Text>
        <Text variant="body" color="inkMuted">
          Bağlantını kontrol edip tekrar dene. Günlük hedefin bundan etkilenmiyor.
        </Text>
        <Button label="Tekrar dene" variant="secondary" icon="refresh" onPress={() => void q.refetch()} testID={`${testID}-retry`} />
      </Card>
    );
  }

  const e = q.data;
  const why = explainEnergy(e);
  const rows = energyRows(e);

  return (
    <Card style={styles.card} testID={testID} accessibilityLabel={`Günlük kalori hedefin ${fmtInt(e.targetCalories)} kcal. ${why.body}`}>
      <View style={styles.head}>
        <Text variant="label" color="inkMuted">
          Kalori ihtiyacın
        </Text>
        <Chip label={why.source} tone={why.action ? "neutral" : "primary"} size="sm" testID={`${testID}-source`} />
      </View>

      <View style={styles.heroRow}>
        <Text variant="hero" tabular testID={`${testID}-target`}>
          {fmtInt(e.targetCalories)}
        </Text>
        <Text variant="title" color="inkMuted">
          kcal
        </Text>
      </View>
      <Text variant="caption" color="inkMuted">
        günlük hedefin
      </Text>

      <Divider />

      <View style={styles.rows}>
        {rows.map((r) => (
          <View key={r.key} style={styles.row} testID={`${testID}-${r.key}`}>
            <View style={styles.rowTexts}>
              <Text variant="body">{r.label}</Text>
              <Text variant="caption" color="inkSubtle">
                {r.hint}
              </Text>
            </View>
            <Text variant="bodyStrong" tone={r.tone === "neutral" ? undefined : r.tone} tabular>
              {r.sign}
              {fmtInt(r.value)} kcal
            </Text>
          </View>
        ))}
      </View>

      <Text variant="caption" color="inkMuted" style={styles.why}>
        {why.body}
      </Text>

      {why.action ? (
        <Button
          label={why.action === "goal" ? "Hedef belirle" : "Ölçüm ekle"}
          variant="secondary"
          icon={why.action === "goal" ? "goal" : "measure"}
          onPress={why.action === "goal" ? onSetGoal : onAddMeasurement}
          testID={`${testID}-action`}
        />
      ) : null}
    </Card>
  );
}

function EnergySkeleton({ testID }: { testID: string }) {
  const { colors } = useTheme();
  return (
    <SkeletonGroup testID={testID} style={[styles.card, styles.skeleton, { backgroundColor: colors.surface }]}>
      <Skeleton width={120} height={12} />
      <Skeleton width={180} height={40} radius={10} style={styles.skeletonHero} />
      <Skeleton height={1} />
      <Skeleton height={22} style={styles.skeletonRow} />
      <Skeleton height={22} />
      <Skeleton height={22} />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: ENERGY_CARD_HEIGHT, gap: spacing.sm },
  skeleton: { borderRadius: radii.card, padding: spacing.cardPad, overflow: "hidden" },
  skeletonHero: { marginVertical: spacing.md },
  skeletonRow: { marginTop: spacing.md },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  rows: { gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  rowTexts: { flex: 1, gap: 1 },
  why: { marginTop: spacing.xs },
});
