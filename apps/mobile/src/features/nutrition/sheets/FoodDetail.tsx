import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { FoodDTO, Meal, Per100g } from "@fitfloow/core";
import { fmtInt } from "../../../lib/format";
import { spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Stepper } from "../../../ui/Stepper";
import { Surface } from "../../../ui/Surface";
import { Text } from "../../../ui/Text";
import { previewTotals } from "../model/day";
import { MEAL_LABEL, MEAL_ORDER } from "../model/meals";

export const GRAMS_STEP = 10;
export const GRAMS_MIN = 5;
export const GRAMS_MAX = 2000;

export interface FoodDetailProps {
  name: string;
  per100g: Per100g;
  /** Quick-add chips ("1 dilim 30 g"); the default 100 g chip is always added. */
  servings?: FoodDTO["servings"];
  initialGrams: number;
  meal: Meal;
  onMealChange: (meal: Meal) => void;
  onAdd: (grams: number) => void;
  onBack?: () => void;
  adding?: boolean;
  /** "Ekle" by default; the edit sheet says "Kaydet". */
  submitLabel?: string;
  brand?: string | null;
  testID?: string;
}

/**
 * The add/edit panel: serving chips, a ±10 g stepper (hold to accelerate) and live kcal/macros,
 * plus the meal picker. Shared by search, recents, barcode, manual entry and grams editing.
 */
export function FoodDetail({
  name,
  per100g,
  servings,
  initialGrams,
  meal,
  onMealChange,
  onAdd,
  onBack,
  adding,
  submitLabel = "Ekle",
  brand,
  testID = "food-detail",
}: FoodDetailProps) {
  const [grams, setGrams] = useState(Math.round(initialGrams) || 100);
  const totals = useMemo(() => previewTotals(per100g, grams), [grams, per100g]);
  const chips = useMemo(() => {
    const list = [...(servings ?? [])];
    if (!list.some((s) => s.grams === 100)) list.push({ label: "100 g", grams: 100 });
    return list.slice(0, 4);
  }, [servings]);

  return (
    <View testID={testID} style={styles.stack}>
      <View style={styles.head}>
        {onBack ? (
          <Pressable testID={`${testID}-back`} onPress={onBack} haptic="select" minTarget={false} accessibilityLabel="Geri" style={styles.back}>
            <Icon name="chevron-back" size={20} color="inkMuted" />
          </Pressable>
        ) : null}
        <View style={styles.grow}>
          <Text variant="title" numberOfLines={2}>
            {name}
          </Text>
          <Text variant="caption" color="inkMuted" tabular>
            {brand ? `${brand} · ` : ""}100 g: {fmtInt(per100g.kcal)} kcal · P {fmtInt(per100g.protein)} · K {fmtInt(per100g.carbs)} · Y {fmtInt(per100g.fat)}
          </Text>
        </View>
      </View>

      <View style={styles.chips}>
        {chips.map((s) => (
          <Chip
            key={`${s.label}-${s.grams}`}
            testID={`${testID}-serving-${s.grams}`}
            label={`${s.label} · ${fmtInt(s.grams)} g`}
            size="sm"
            selected={grams === s.grams}
            onPress={() => setGrams(s.grams)}
          />
        ))}
      </View>

      <Surface muted radius="md" style={styles.amount}>
        <Stepper testID={`${testID}-grams`} value={grams} onChange={setGrams} step={GRAMS_STEP} min={GRAMS_MIN} max={GRAMS_MAX} format={(v) => `${fmtInt(v)} g`} label="Miktar" />
        <View style={styles.totals}>
          <Text variant="heading" tabular testID={`${testID}-kcal`}>
            {fmtInt(totals.kcal)}
          </Text>
          <Text variant="caption" color="inkMuted">
            kcal
          </Text>
        </View>
      </Surface>

      <View style={styles.macroRow}>
        <MacroPill label="Protein" value={totals.protein} />
        <MacroPill label="Karb." value={totals.carbs} />
        <MacroPill label="Yağ" value={totals.fat} />
      </View>

      <View style={styles.chips}>
        {MEAL_ORDER.map((m) => (
          <Chip key={m} testID={`${testID}-meal-${m}`} label={MEAL_LABEL[m]} size="sm" selected={m === meal} onPress={() => onMealChange(m)} />
        ))}
      </View>

      <Button testID={`${testID}-submit`} label={submitLabel} onPress={() => onAdd(grams)} loading={adding} full />
    </View>
  );
}

function MacroPill({ label, value }: { label: string; value: number }) {
  return (
    <Surface muted radius="control" style={styles.pill}>
      <Text variant="caption" color="inkMuted">
        {label}
      </Text>
      <Text variant="bodyStrong" tabular>
        {fmtInt(value)} g
      </Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, gap: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  amount: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, gap: spacing.md },
  totals: { alignItems: "flex-end" },
  macroRow: { flexDirection: "row", gap: spacing.sm },
  pill: { flex: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: 2 },
});
