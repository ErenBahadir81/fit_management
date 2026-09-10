import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { Meal, MealEntryDTO } from "@fitfloow/core";
import { spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Sheet } from "../../../ui/Sheet";
import { FoodDetail } from "./FoodDetail";

export interface GramsSheetProps {
  entry: MealEntryDTO;
  onSave: (patch: { grams: number; meal: Meal }) => void;
  onDelete: () => void;
  onClose: () => void;
  saving?: boolean;
}

/** Tap an entry → fix the grams (±10 g, hold to run) or move it to another meal. */
export function GramsSheet({ entry, onSave, onDelete, onClose, saving }: GramsSheetProps) {
  const [meal, setMeal] = useState<Meal>(entry.meal);

  return (
    <Sheet open onDismiss={onClose}>
      <View style={styles.stack}>
        <FoodDetail
          testID="grams-sheet"
          name={entry.name}
          per100g={entry.per100g}
          initialGrams={entry.grams}
          meal={meal}
          onMealChange={setMeal}
          onAdd={(grams) => onSave({ grams, meal })}
          submitLabel="Kaydet"
          adding={saving}
        />
        <Button
          testID="grams-sheet-delete"
          label="Sil"
          variant="danger"
          icon="trash-outline"
          onPress={onDelete}
          full
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({ stack: { gap: spacing.md } });
