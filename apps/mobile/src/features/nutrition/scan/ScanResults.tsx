import React from "react";
import { StyleSheet, View } from "react-native";
import type { Meal } from "@fitfloow/core";
import { Floo } from "../../../mascot/Floo";
import { fmtInt, fmtPct } from "../../../lib/format";
import { spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { EmptyState } from "../../../ui/EmptyState";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Stepper } from "../../../ui/Stepper";
import { Surface } from "../../../ui/Surface";
import { Text } from "../../../ui/Text";
import { previewTotals } from "../model/day";
import { MEAL_LABEL, MEAL_ORDER } from "../model/meals";
import { scanTotals, type ScanItem } from "../model/scanMachine";
import { GRAMS_MAX, GRAMS_MIN, GRAMS_STEP } from "../sheets/FoodDetail";

export interface ScanResultsProps {
  items: ScanItem[];
  meal: Meal;
  mock: boolean;
  notFood: boolean;
  saving: boolean;
  onGrams: (key: string, grams: number) => void;
  onRemove: (key: string) => void;
  onMeal: (meal: Meal) => void;
  onAddMore: () => void;
  onSave: () => void;
  onRetake: () => void;
}

/** The sheet that slides up after the theatre: what Floo saw, how much of it, into which meal. */
export function ScanResults({ items, meal, mock, notFood, saving, onGrams, onRemove, onMeal, onAddMore, onSave, onRetake }: ScanResultsProps) {
  const totals = scanTotals(items);

  if (notFood && items.length === 0) {
    return (
      <View style={styles.stack} testID="scan-not-food">
        <EmptyState
          illustration={<Floo mood="think" size="m" />}
          title="Burada yemek göremedim"
          body="Tabağı biraz daha yakından çekebilir ya da yemeği aramadan ekleyebilirsin."
          action={{ label: "Yemek ara", onPress: onAddMore, icon: "search" }}
        />
        <Button testID="scan-retake" label="Tekrar çek" variant="secondary" icon="camera" onPress={onRetake} full />
      </View>
    );
  }

  return (
    <View style={styles.stack} testID="scan-results">
      <View style={styles.head}>
        <View style={styles.grow}>
          <Text variant="heading">Tabakta ne var?</Text>
          <Text variant="caption" color="inkMuted">
            Miktarları düzelt, gerisini bana bırak.
          </Text>
        </View>
        {mock ? <Chip testID="scan-mock-chip" label="Demo modu" size="sm" tone="warning" icon="flask-outline" /> : null}
      </View>

      <View style={styles.cards}>
        {items.map((item) => (
          <DetectionCard key={item.key} item={item} onGrams={onGrams} onRemove={onRemove} />
        ))}
      </View>

      <Pressable testID="scan-add-more" onPress={onAddMore} haptic="select" style={styles.addMore}>
        <Icon name="add-circle-outline" size={18} color="primary" />
        <Text variant="label" color="primary">
          Başka bir yemek ekle
        </Text>
      </Pressable>

      <View style={styles.meals}>
        {MEAL_ORDER.map((m) => (
          <Chip key={m} testID={`scan-meal-${m}`} label={MEAL_LABEL[m]} size="sm" selected={m === meal} onPress={() => onMeal(m)} />
        ))}
      </View>

      <View style={styles.footer}>
        <View>
          <Text variant="caption" color="inkMuted">
            Toplam
          </Text>
          <Text variant="heading" tabular testID="scan-total-kcal">
            {fmtInt(totals.kcal)} kcal
          </Text>
          <Text variant="caption" color="inkMuted" tabular>
            P {fmtInt(totals.protein)} · K {fmtInt(totals.carbs)} · Y {fmtInt(totals.fat)}
          </Text>
        </View>
        <Button testID="scan-save" label="Öğüne ekle" onPress={onSave} loading={saving} disabled={items.length === 0} style={styles.saveBtn} />
      </View>
    </View>
  );
}

function confidenceTone(c: number): "success" | "warning" | "neutral" {
  if (c >= 0.7) return "success";
  if (c >= 0.45) return "warning";
  return "neutral";
}

function DetectionCard({ item, onGrams, onRemove }: { item: ScanItem; onGrams: (key: string, grams: number) => void; onRemove: (key: string) => void }) {
  const totals = previewTotals(item.per100g, item.grams);
  return (
    <Surface muted radius="md" style={styles.card} testID={`detection-${item.key}`}>
      <View style={styles.cardHead}>
        <View style={styles.grow}>
          <Text variant="title" numberOfLines={1}>
            {item.name}
          </Text>
          <Text variant="caption" color="inkMuted" tabular>
            P {fmtInt(totals.protein)} g · K {fmtInt(totals.carbs)} g · Y {fmtInt(totals.fat)} g
          </Text>
        </View>
        {item.confidence != null ? <Chip label={fmtPct(item.confidence * 100, 0)} size="sm" tone={confidenceTone(item.confidence)} /> : null}
        <Pressable testID={`detection-remove-${item.key}`} onPress={() => onRemove(item.key)} haptic="select" minTarget={false} accessibilityLabel={`${item.name} kaldır`} style={styles.remove}>
          <Icon name="close" size={18} color="inkSubtle" />
        </Pressable>
      </View>
      <View style={styles.cardBody}>
        <Stepper
          testID={`detection-grams-${item.key}`}
          value={item.grams}
          onChange={(g) => onGrams(item.key, g)}
          step={GRAMS_STEP}
          min={GRAMS_MIN}
          max={GRAMS_MAX}
          size="sm"
          format={(v) => `${fmtInt(v)} g`}
          label={`${item.name} miktarı`}
        />
        <Text variant="title" tabular testID={`detection-kcal-${item.key}`}>
          {fmtInt(totals.kcal)} kcal
        </Text>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  grow: { flex: 1 },
  cards: { gap: spacing.md },
  card: { padding: spacing.md, gap: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardBody: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  remove: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  addMore: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  meals: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  saveBtn: { flex: 1, maxWidth: 200 },
});
