import React from "react";
import { StyleSheet, View } from "react-native";
import type { MuscleReadiness } from "@fitfloow/core";
import { Sparkline } from "../../../charts/Sparkline";
import { fmtDate, fmtNumber } from "../../../lib/format";
import { relativeDayLabel } from "../../../lib/dates";
import { spacing } from "../../../theme/tokens";
import { Chip } from "../../../ui/Chip";
import { Divider } from "../../../ui/Divider";
import { ProgressBar } from "../../../ui/ProgressBar";
import { Ring } from "../../../ui/Ring";
import { Sheet, type SheetRef } from "../../../ui/Sheet";
import { Text } from "../../../ui/Text";
import { hoursToFullLabel, recoveryCurve, recoveryPosition, RECOVERY_TR, VOLUME_TR } from "../lib/present";

export interface MuscleDetailSheetProps {
  sheetRef: React.RefObject<SheetRef | null>;
  muscle: MuscleReadiness | null;
}

/** One muscle in detail: readiness ring, the 0→70→100 curve, weekly sets vs target, last trained. */
export function MuscleDetailSheet({ sheetRef, muscle }: MuscleDetailSheetProps) {
  if (!muscle) {
    return (
      <Sheet ref={sheetRef}>
        <View testID="muscle-sheet-empty" />
      </Sheet>
    );
  }

  const s = RECOVERY_TR[muscle.status];
  const curve = recoveryCurve(muscle);
  const position = recoveryPosition(muscle);
  const weeklyMax = muscle.weeklyTarget.max || 1;
  const volumeStatus = muscle.weeklySets === 0 ? "none" : muscle.weeklySets < (muscle.weeklyTarget.min ?? 0) ? "under" : muscle.weeklySets > muscle.weeklyTarget.max ? "over" : "in";
  const volumeTone = volumeStatus === "in" ? "success" : volumeStatus === "over" ? "warning" : volumeStatus === "under" ? "primary" : "neutral";

  return (
    <Sheet ref={sheetRef} title={muscle.name}>
      <View style={styles.body} testID="muscle-sheet">
        <View style={styles.head}>
          <Ring value={muscle.readiness / 100} size={72} color={muscle.color} gradient={false}>
            <Text variant="title" tabular>
              {Math.round(muscle.readiness)}
            </Text>
          </Ring>
          <View style={styles.headTexts}>
            <Text variant="heading" tone={s.tone}>
              {s.label}
            </Text>
            <Text variant="body" color="inkMuted" tabular>
              {hoursToFullLabel(muscle)}
            </Text>
            <View style={styles.chips}>
              <Chip label={`Tam toparlanma ${muscle.fullRecoveryHours} sa`} size="sm" dot={muscle.color} />
              {muscle.residualSets > 0 ? <Chip label={`Kalan yük ${fmtNumber(muscle.residualSets, 1)}`} size="sm" tone="warning" /> : null}
            </View>
          </View>
        </View>

        <Divider />

        <View style={styles.block}>
          <Text variant="label">Toparlanma eğrisi</Text>
          <View style={styles.curveRow}>
            <Sparkline values={curve} width={220} height={44} color={muscle.color} testID="recovery-curve" />
            <Text variant="caption" color="inkMuted" tabular>
              %{Math.round(position * 100)}
            </Text>
          </View>
          <Text variant="caption" color="inkMuted">
            İlk yarıda hızlı, sonra yavaş: {muscle.fullRecoveryHours} saatte tam.
          </Text>
        </View>

        <View style={styles.block}>
          <Text variant="label">Bu haftaki set</Text>
          <ProgressBar
            value={Math.min(1, muscle.weeklySets / weeklyMax)}
            tone={volumeTone}
            height={10}
            label={`${VOLUME_TR[volumeStatus]}`}
            valueLabel={`${fmtNumber(muscle.weeklySets, muscle.weeklySets % 1 === 0 ? 0 : 1)} / ${muscle.weeklyTarget.max}`}
          />
          {muscle.weeklyTarget.min !== undefined ? (
            <Text variant="caption" color="inkMuted" tabular>
              Hedef aralık {muscle.weeklyTarget.min}–{muscle.weeklyTarget.max} set
            </Text>
          ) : null}
        </View>

        <View style={styles.block}>
          <Text variant="label">Son çalışma</Text>
          <Text variant="body" color="inkMuted" tabular>
            {muscle.lastTrainedAt ? `${relativeDayLabel(muscle.lastTrainedAt.slice(0, 10))} · ${fmtDate(muscle.lastTrainedAt.slice(0, 10))}` : "Son 72 saatte çalışılmadı"}
            {muscle.hoursSince !== null ? ` · ${fmtNumber(muscle.hoursSince, 0)} sa önce` : ""}
          </Text>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  headTexts: { flex: 1, gap: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  block: { gap: spacing.sm },
  curveRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
