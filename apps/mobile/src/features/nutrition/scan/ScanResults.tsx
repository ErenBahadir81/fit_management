import React from "react";
import { StyleSheet, View } from "react-native";
import type { Meal } from "@fitfloow/core";
import { Floo } from "../../../mascot";
import { fmtInt, fmtPct } from "../../../lib/format";
import { spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { EmptyState } from "../../../ui/EmptyState";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Surface } from "../../../ui/Surface";
import { Text } from "../../../ui/Text";
import { previewTotals } from "../model/day";
import { MEAL_LABEL, MEAL_ORDER } from "../model/meals";
import { UNSURE_BELOW, scanTotals, type ScanItem } from "../model/scanMachine";
import { PortionPicker } from "../components/PortionPicker";

export interface ScanResultsProps {
  items: ScanItem[];
  meal: Meal;
  mock: boolean;
  notFood: boolean;
  saving: boolean;
  onGrams: (key: string, grams: number) => void;
  onRemove: (key: string) => void;
  /** "Bunu mu demek istedin?" → alternative `index` of item `key`. */
  onPickAlternative: (key: string, index: number) => void;
  /** "Evet, bu" → keep the guess. */
  onConfirm: (key: string) => void;
  onMeal: (meal: Meal) => void;
  onAddMore: () => void;
  onSave: () => void;
  onRetake: () => void;
}

/** The sheet that slides up after the theatre: what Floo saw, how much of it, into which meal. */
export function ScanResults({ items, meal, mock, notFood, saving, onGrams, onRemove, onPickAlternative, onConfirm, onMeal, onAddMore, onSave, onRetake }: ScanResultsProps) {
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
        {mock ? <Chip testID="scan-mock-chip" label="Demo modu" size="sm" tone="warning" icon="estimate" /> : null}
      </View>

      <View style={styles.cards}>
        {items.map((item) => (
          <DetectionCard key={item.key} item={item} onGrams={onGrams} onRemove={onRemove} onPickAlternative={onPickAlternative} onConfirm={onConfirm} />
        ))}
      </View>

      <Pressable testID="scan-add-more" onPress={onAddMore} haptic="select" style={styles.addMore}>
        <Icon icon="add" size={18} color="primary" />
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

function confidenceTone(c: number): "success" | "warning" | undefined {
  if (c >= 0.7) return "success";
  if (c >= UNSURE_BELOW) return undefined;
  return "warning";
}

interface DetectionCardProps {
  item: ScanItem;
  onGrams: (key: string, grams: number) => void;
  onRemove: (key: string) => void;
  onPickAlternative: (key: string, index: number) => void;
  onConfirm: (key: string) => void;
}

function DetectionCard({ item, onGrams, onRemove, onPickAlternative, onConfirm }: DetectionCardProps) {
  const totals = previewTotals(item.per100g, item.grams);
  return (
    <Surface muted radius="md" style={styles.card} testID={`detection-${item.key}`}>
      <View style={styles.cardHead}>
        <View style={styles.grow}>
          <Text variant="title" numberOfLines={1} testID={`detection-name-${item.key}`}>
            {item.name}
          </Text>
          <Text variant="caption" color="inkMuted" tabular>
            P {fmtInt(totals.protein)} · K {fmtInt(totals.carbs)} · Y {fmtInt(totals.fat)} g
          </Text>
        </View>
        <View style={styles.kcalCol}>
          <Text variant="title" tabular testID={`detection-kcal-${item.key}`}>
            {fmtInt(totals.kcal)} kcal
          </Text>
          {item.confidence != null ? (
            <Text variant="caption" tone={confidenceTone(item.confidence)} tabular testID={`detection-confidence-${item.key}`}>
              {fmtPct(item.confidence * 100, 0)} emin
            </Text>
          ) : null}
        </View>
        <Pressable testID={`detection-remove-${item.key}`} onPress={() => onRemove(item.key)} haptic="select" minTarget={false} accessibilityLabel={`${item.name} kaldır`} style={styles.remove}>
          <Icon icon="close" size={18} color="inkSubtle" />
        </Pressable>
      </View>

      {item.unsure ? (
        <View style={styles.unsure} testID={`detection-unsure-${item.key}`}>
          <Text variant="label" color="inkMuted">
            Bunu mu demek istedin?
          </Text>
          <View style={styles.chips}>
            {item.alternatives.map((a, i) => (
              <Chip key={a.foodId} testID={`detection-alt-${item.key}-${i}`} label={a.name} size="sm" tone="primary" onPress={() => onPickAlternative(item.key, i)} accessibilityLabel={`${a.name} olarak değiştir`} />
            ))}
            <Chip testID={`detection-confirm-${item.key}`} label={`Evet, ${item.name.toLocaleLowerCase("tr-TR")}`} size="sm" icon="check" onPress={() => onConfirm(item.key)} />
          </View>
        </View>
      ) : null}

      <PortionPicker food={item} grams={item.grams} onChange={(g) => onGrams(item.key, g)} label={item.name} testID={`detection-portion-${item.key}`} />
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
  kcalCol: { alignItems: "flex-end" },
  unsure: { gap: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  remove: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  addMore: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  meals: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  saveBtn: { flex: 1, maxWidth: 200 },
});
