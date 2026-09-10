import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { ExerciseDTO } from "@fitfloow/core";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Sheet, type SheetRef } from "../../../ui/Sheet";
import { Text } from "../../../ui/Text";
import { TextField } from "../../../ui/TextField";
import { useExerciseCatalog } from "../queries";

export interface AddExerciseSheetProps {
  sheetRef: React.RefObject<SheetRef | null>;
  onPick: (exercise: ExerciseDTO) => void;
}

/** Ad-hoc exercise during a session: search the catalog, tap to append it as an extra. */
export function AddExerciseSheet({ sheetRef, onPick }: AddExerciseSheetProps) {
  const [q, setQ] = useState("");
  const { colors } = useTheme();
  const catalog = useExerciseCatalog(q);
  const results = (catalog.data ?? []).slice(0, 20);

  return (
    <Sheet ref={sheetRef} title="Hareket ekle">
      <View style={styles.body} testID="add-exercise-sheet">
        <TextField label="Ara" value={q} onChangeText={setQ} icon="search" autoCorrect={false} testID="add-exercise-search" />
        {results.length === 0 && !catalog.isPending ? (
          <Text variant="body" color="inkMuted">
            Sonuç yok. Başka bir isim dene.
          </Text>
        ) : null}
        <View style={styles.list}>
          {results.map((exercise) => (
            <Pressable
              key={exercise.id}
              onPress={() => onPick(exercise)}
              haptic="select"
              testID={`add-exercise-${exercise.id}`}
              accessibilityLabel={exercise.name}
              style={[styles.row, { backgroundColor: colors.surfaceMuted }]}
            >
              <View style={styles.texts}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {exercise.name}
                </Text>
                <Text variant="caption" color="inkMuted" tabular numberOfLines={1}>
                  {exercise.defaultSets}×{exercise.defaultReps}
                  {exercise.metric === "time" ? " sn" : ""}
                </Text>
              </View>
              <Icon name="add-circle-outline" size={20} color="primary" />
            </Pressable>
          ))}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  list: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.lg, borderRadius: radii.md },
  texts: { flex: 1, gap: 2 },
});
