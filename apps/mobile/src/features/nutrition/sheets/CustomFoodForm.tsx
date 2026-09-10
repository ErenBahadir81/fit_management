import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { Per100g } from "@fitfloow/core";
import { spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { TextField } from "../../../ui/TextField";

interface Draft {
  name: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
}

const EMPTY: Draft = { name: "", kcal: "", protein: "", carbs: "", fat: "" };

/** tr-TR keyboards produce commas; accept both and reject anything else. */
function toNumber(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function validateDraft(d: Draft): { per100g: Per100g; name: string } | { error: string } {
  const name = d.name.trim();
  if (name.length < 2) return { error: "Bir isim yaz" };
  const kcal = d.kcal.trim() === "" ? null : toNumber(d.kcal); // an empty box is not "0 kcal"
  const protein = toNumber(d.protein || "0");
  const carbs = toNumber(d.carbs || "0");
  const fat = toNumber(d.fat || "0");
  if (kcal == null || kcal > 900) return { error: "100 g için kalori 0–900 arası olmalı" };
  if (protein == null || protein > 100 || carbs == null || carbs > 100 || fat == null || fat > 100) return { error: "Makrolar 0–100 g arası olmalı" };
  return { name, per100g: { kcal, protein, carbs, fat } };
}

/** "Elle gir": name + per-100 g values. Continues to the grams step. */
export function CustomFoodForm({ onContinue, onBack }: { onContinue: (name: string, per100g: Per100g) => void; onBack?: () => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [touched, setTouched] = useState(false);
  const result = useMemo(() => validateDraft(draft), [draft]);
  const error = "error" in result ? result.error : null;

  const set = (k: keyof Draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <View style={styles.stack} testID="custom-food-form">
      <View style={styles.head}>
        {onBack ? (
          <Pressable testID="custom-food-back" onPress={onBack} haptic="select" minTarget={false} accessibilityLabel="Geri" style={styles.back}>
            <Icon name="chevron-back" size={20} color="inkMuted" />
          </Pressable>
        ) : null}
        <View style={styles.grow}>
          <Text variant="title">Elle gir</Text>
          <Text variant="caption" color="inkMuted">
            100 gram için değerleri yaz
          </Text>
        </View>
      </View>

      <TextField testID="custom-name" label="Yemek adı" value={draft.name} onChangeText={set("name")} autoCapitalize="sentences" placeholder="Ev yapımı mercimek köftesi" />
      <View style={styles.row}>
        <TextField testID="custom-kcal" label="Kalori" value={draft.kcal} onChangeText={set("kcal")} keyboardType="numeric" unit="kcal" containerStyle={styles.grow} />
        <TextField testID="custom-protein" label="Protein" value={draft.protein} onChangeText={set("protein")} keyboardType="numeric" unit="g" containerStyle={styles.grow} />
      </View>
      <View style={styles.row}>
        <TextField testID="custom-carbs" label="Karbonhidrat" value={draft.carbs} onChangeText={set("carbs")} keyboardType="numeric" unit="g" containerStyle={styles.grow} />
        <TextField testID="custom-fat" label="Yağ" value={draft.fat} onChangeText={set("fat")} keyboardType="numeric" unit="g" containerStyle={styles.grow} />
      </View>

      {touched && error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Button
        testID="custom-food-continue"
        label="Devam"
        full
        onPress={() => {
          setTouched(true);
          if ("per100g" in result) onContinue(result.name, result.per100g);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", gap: spacing.md },
  grow: { flex: 1 },
});
