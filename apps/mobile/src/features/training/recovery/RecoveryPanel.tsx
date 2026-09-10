import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { MuscleReadiness } from "@fitfloow/core";
import { fmtNumber } from "../../../lib/format";
import { Floo } from "../../../mascot/Floo";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { EmptyState } from "../../../ui/EmptyState";
import { Entry } from "../../../ui/Entry";
import { Pressable } from "../../../ui/Pressable";
import { Reveal } from "../../../ui/Reveal";
import { Ring } from "../../../ui/Ring";
import { Screen } from "../../../ui/Screen";
import { Text } from "../../../ui/Text";
import { useSheet } from "../../../ui/Sheet";
import { hoursToFullLabel, RECOVERY_TR } from "../lib/present";
import { useRecovery } from "../queries";
import { MuscleDetailSheet } from "./MuscleDetailSheet";
import { MUSCLE_CARD_HEIGHT, RecoverySkeleton } from "./RecoverySkeleton";

/** Recovery: overall ring + a card per muscle, tap for the detail sheet. Pull to refresh. */
export function RecoveryPanel({ header }: { header?: React.ReactNode }) {
  const recovery = useRecovery();
  const sheet = useSheet();
  const [selected, setSelected] = useState<MuscleReadiness | null>(null);

  const open = useCallback(
    (muscle: MuscleReadiness) => {
      setSelected(muscle);
      sheet.present();
    },
    [sheet]
  );

  const view = recovery.data ?? null;
  const sorted = useMemo(() => (view ? [...view.muscles].sort((a, b) => a.readiness - b.readiness) : []), [view]);

  if (recovery.isError && !view) {
    return (
      <Screen>
        {header}
        <EmptyState
          illustration={<Floo mood="worried" size="m" />}
          title="Toparlanma yüklenemedi"
          body="Bağlantını kontrol edip tekrar dene."
          action={{ label: "Tekrar dene", onPress: () => void recovery.refetch(), icon: "refresh" }}
        />
      </Screen>
    );
  }

  return (
    <Screen refreshing={recovery.isRefetching && !recovery.isPending} onRefresh={() => void recovery.refetch()}>
      {header}
      <Reveal ready={Boolean(view)} skeleton={<RecoverySkeleton />}>
        {view ? (
          <View style={styles.stack}>
            <Entry index={0}>
              <OverallCard overall={view.overall} />
            </Entry>
            <Entry index={1}>
              <View style={styles.grid} testID="muscle-grid">
                {sorted.map((m) => (
                  <MuscleCard key={m.key} muscle={m} onPress={open} />
                ))}
              </View>
            </Entry>
          </View>
        ) : null}
      </Reveal>
      <MuscleDetailSheet sheetRef={sheet.ref} muscle={selected} />
    </Screen>
  );
}

function OverallCard({ overall }: { overall: { readiness: number; status: MuscleReadiness["status"]; readyCount: number; fatiguedCount: number } }) {
  const s = RECOVERY_TR[overall.status];
  return (
    <Card style={styles.overall} testID="recovery-overall">
      <Ring value={overall.readiness / 100} size={96} tone={s.tone} gradient={overall.status === "ready"}>
        <Text variant="heading" tabular>
          {Math.round(overall.readiness)}
        </Text>
        <Text variant="caption" color="inkMuted">
          /100
        </Text>
      </Ring>
      <View style={styles.overallTexts}>
        <Text variant="label" color="inkMuted">
          Genel toparlanma
        </Text>
        <Text variant="heading">{s.label}</Text>
        <View style={styles.chips}>
          <Chip label={`${overall.readyCount} hazır`} size="sm" tone="success" />
          {overall.fatiguedCount > 0 ? <Chip label={`${overall.fatiguedCount} yorgun`} size="sm" tone="danger" /> : null}
        </View>
      </View>
    </Card>
  );
}

function MuscleCard({ muscle, onPress }: { muscle: MuscleReadiness; onPress: (m: MuscleReadiness) => void }) {
  const { colors } = useTheme();
  const s = RECOVERY_TR[muscle.status];
  return (
    <Pressable
      onPress={() => onPress(muscle)}
      testID={`muscle-${muscle.key}`}
      accessibilityLabel={`${muscle.name}, %${Math.round(muscle.readiness)} hazır, ${s.label}, ${hoursToFullLabel(muscle)}`}
      scaleTo={0.98}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Ring value={muscle.readiness / 100} size={52} stroke={5} color={muscle.color} gradient={false}>
        <Text variant="label" tabular>
          {Math.round(muscle.readiness)}
        </Text>
      </Ring>
      <Text variant="label" numberOfLines={1} style={styles.cardName}>
        {muscle.name}
      </Text>
      <Text variant="caption" tone={s.tone} numberOfLines={1} tabular>
        {muscle.status === "ready" ? s.label : hoursToFullLabel(muscle)}
      </Text>
      <Text variant="caption" color="inkSubtle" tabular numberOfLines={1}>
        {fmtNumber(muscle.weeklySets, muscle.weeklySets % 1 === 0 ? 0 : 1)}/{muscle.weeklyTarget.max} set
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  overall: { flexDirection: "row", alignItems: "center", gap: spacing.lg, minHeight: 152 },
  overallTexts: { flex: 1, gap: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: {
    width: "47.5%",
    flexGrow: 1,
    height: MUSCLE_CARD_HEIGHT,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: spacing.sm,
  },
  cardName: { marginTop: spacing.xs },
});
