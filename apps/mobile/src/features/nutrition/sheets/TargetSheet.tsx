import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { DietTargetDTO } from "@fitfloow/core";
import { fmtInt } from "../../../lib/format";
import { spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Segmented } from "../../../ui/Segmented";
import { Sheet } from "../../../ui/Sheet";
import { Surface } from "../../../ui/Surface";
import { Text } from "../../../ui/Text";
import { TextField } from "../../../ui/TextField";

const DERIVED_TR: Record<NonNullable<DietTargetDTO["derivedFrom"]>, string> = {
  goal: "Aktif hedefinden hesaplanıyor",
  maintenance: "Vücut ölçümünden hesaplanıyor",
  default: "Varsayılan değerler",
};

export interface TargetSheetProps {
  target: DietTargetDTO;
  onSave: (input: { mode: "auto" | "manual"; calories?: number; protein?: number; carbs?: number; fat?: number }) => void;
  onClose: () => void;
  saving?: boolean;
}

const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Auto (from the goal) or manual macros. Auto is the default and needs no input. */
export function TargetSheet({ target, onSave, onClose, saving }: TargetSheetProps) {
  const [mode, setMode] = useState<"auto" | "manual">(target.mode);
  const [calories, setCalories] = useState(String(Math.round(target.calories)));
  const [protein, setProtein] = useState(String(Math.round(target.protein)));
  const [carbs, setCarbs] = useState(String(Math.round(target.carbs)));
  const [fat, setFat] = useState(String(Math.round(target.fat)));

  const parsed = useMemo(() => ({ calories: num(calories), protein: num(protein), carbs: num(carbs), fat: num(fat) }), [calories, carbs, fat, protein]);
  const invalid = mode === "manual" && (parsed.calories == null || parsed.calories < 500 || parsed.calories > 8000 || parsed.protein == null || parsed.carbs == null || parsed.fat == null);

  return (
    <Sheet open onDismiss={onClose}>
      <View style={styles.stack} testID="target-sheet">
        <Text variant="heading">Günlük hedef</Text>
        <Segmented
          testID="target-mode"
          options={[
            { value: "auto", label: "Otomatik" },
            { value: "manual", label: "Elle" },
          ]}
          value={mode}
          onChange={setMode}
        />

        {mode === "auto" ? (
          <Surface muted radius="md" style={styles.auto}>
            <Text variant="body" color="inkMuted">
              {target.derivedFrom ? DERIVED_TR[target.derivedFrom] : "Hedefinden hesaplanıyor"}
            </Text>
            <Text variant="display" tabular testID="target-auto-calories">
              {fmtInt(target.calories)}
              <Text variant="body" color="inkMuted">
                {" "}
                kcal
              </Text>
            </Text>
            <Text variant="caption" color="inkMuted" tabular>
              P {fmtInt(target.protein)} g · K {fmtInt(target.carbs)} g · Y {fmtInt(target.fat)} g
            </Text>
          </Surface>
        ) : (
          <View style={styles.form}>
            <TextField testID="target-calories" label="Kalori" value={calories} onChangeText={setCalories} keyboardType="numeric" unit="kcal" />
            <View style={styles.row}>
              <TextField testID="target-protein" label="Protein" value={protein} onChangeText={setProtein} keyboardType="numeric" unit="g" containerStyle={styles.grow} />
              <TextField testID="target-carbs" label="Karbonhidrat" value={carbs} onChangeText={setCarbs} keyboardType="numeric" unit="g" containerStyle={styles.grow} />
            </View>
            <TextField testID="target-fat" label="Yağ" value={fat} onChangeText={setFat} keyboardType="numeric" unit="g" />
          </View>
        )}

        <Button
          testID="target-save"
          label="Kaydet"
          full
          loading={saving}
          disabled={invalid}
          onPress={() =>
            onSave(
              mode === "auto"
                ? { mode: "auto" }
                : { mode: "manual", calories: parsed.calories ?? undefined, protein: parsed.protein ?? undefined, carbs: parsed.carbs ?? undefined, fat: parsed.fat ?? undefined }
            )
          }
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  auto: { padding: spacing.lg, gap: spacing.xxs },
  form: { gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.md },
  grow: { flex: 1 },
});
