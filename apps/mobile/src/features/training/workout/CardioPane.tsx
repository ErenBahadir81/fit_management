import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { fmtNumber } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Stepper } from "../../../ui/Stepper";
import { Text } from "../../../ui/Text";
import { cardioTotals, pace, type CardioSlot, type LoggerCardio } from "../lib/logger";

export interface CardioPaneProps {
  slot: CardioSlot;
  cardio: LoggerCardio;
  width: number;
  onSegment: (id: string, patch: { km?: number; min?: number }) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

/** Run / swim: segment list with km + minutes, live pace against the target. */
export function CardioPane({ slot, cardio, width, onSegment, onAdd, onRemove }: CardioPaneProps) {
  const { colors } = useTheme();
  const totals = cardioTotals(cardio);
  const p = pace(cardio);
  const targetPace = cardio.targetKm > 0 && cardio.targetMin > 0 ? cardio.targetMin / cardio.targetKm : null;
  const faster = p !== null && targetPace !== null && p <= targetPace;

  return (
    <View style={[styles.pane, { width }]} testID={`cardio-pane-${slot}`}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Text variant="display">{slot === "run" ? "Koşu" : "Yüzme"}</Text>
          <View style={styles.chips}>
            <Chip label={`Hedef ${fmtNumber(cardio.targetKm, 1)} km`} size="sm" icon="navigate-outline" />
            <Chip label={`${cardio.targetMin} dk`} size="sm" icon="time-outline" />
            {targetPace !== null ? <Chip label={`${fmtNumber(targetPace, 2)} dk/km`} size="sm" icon="speedometer-outline" /> : null}
          </View>
        </View>

        <View style={styles.totals}>
          <Metric label="Mesafe" value={`${fmtNumber(totals.km, 2)} km`} />
          <Metric label="Süre" value={`${fmtNumber(totals.min, 0)} dk`} />
          <Metric label="Tempo" value={p === null ? "—" : `${fmtNumber(p, 2)}`} tone={p === null ? undefined : faster ? "success" : "warning"} />
        </View>

        <View style={styles.segments}>
          {cardio.segments.map((segment, i) => (
            <View key={segment.id} style={[styles.segment, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`segment-${i}`}>
              <View style={styles.segmentHead}>
                <Text variant="label" color="inkMuted">
                  {i + 1}. bölüm
                </Text>
                {cardio.segments.length > 1 ? (
                  <Pressable onPress={() => onRemove(segment.id)} minTarget={false} testID={`segment-remove-${i}`} accessibilityLabel={`${i + 1}. bölümü sil`} style={styles.remove}>
                    <Icon name="close" size={18} color="danger" />
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.field}>
                <Text variant="caption" color="inkMuted">
                  km
                </Text>
                <Stepper value={segment.km} onChange={(v) => onSegment(segment.id, { km: v })} min={0} max={200} step={0.1} label="Mesafe" testID={`segment-km-${i}`} />
              </View>
              <View style={styles.field}>
                <Text variant="caption" color="inkMuted">
                  dakika
                </Text>
                <Stepper value={segment.min} onChange={(v) => onSegment(segment.id, { min: v })} min={0} max={600} step={1} label="Süre" testID={`segment-min-${i}`} />
              </View>
            </View>
          ))}
        </View>

        <Button label="Bölüm ekle" variant="ghost" size="sm" icon="add" onPress={onAdd} testID="segment-add" />
      </ScrollView>
    </View>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" }) {
  return (
    <View style={styles.metric}>
      <Text variant="caption" color="inkMuted">
        {label}
      </Text>
      <Text variant="heading" tabular tone={tone}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  scroll: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.xxl, gap: spacing.lg },
  head: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  totals: { flexDirection: "row", gap: spacing.xl },
  metric: { gap: 2 },
  segments: { gap: spacing.md },
  segment: { gap: spacing.md, padding: spacing.lg, borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth },
  segmentHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  field: { gap: spacing.xs },
  remove: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});
