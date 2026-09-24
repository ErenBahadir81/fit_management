import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { exerciseNameKey, type ExerciseDTO, type ExerciseMetric, type MuscleDTO, type MuscleLoad } from "@fitfloow/core";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Segmented } from "../../../ui/Segmented";
import { Text } from "../../../ui/Text";
import { TextField } from "../../../ui/TextField";
import { adHocTarget } from "../lib/editorDraft";
import { useExerciseCatalog } from "../queries";
import type { ExerciseTargetDTO } from "@fitfloow/core";

export interface ExercisePickerProps {
  muscles: readonly MuscleDTO[];
  onPick: (target: ExerciseDTO) => void;
  onAdHoc: (target: ExerciseTargetDTO) => void;
  onBack: () => void;
}

/** "Birincil kaslar" line under a catalog row: the two muscles it works hardest. */
function mainMuscles(exercise: ExerciseDTO, names: ReadonlyMap<string, string>): string {
  return [...exercise.muscles]
    .sort((a, b) => b.load - a.load)
    .slice(0, 2)
    .map((m) => names.get(m.key) ?? m.key)
    .join(" · ");
}

/**
 * Search the catalog; anything the catalog does not have can be added as the user's own
 * exercise, with the muscles it works picked by hand (the API needs them to count volume).
 */
export function ExercisePicker({ muscles, onPick, onAdHoc, onBack }: ExercisePickerProps) {
  const [q, setQ] = useState("");
  const [adHoc, setAdHoc] = useState(false);
  const { colors } = useTheme();
  const catalog = useExerciseCatalog(q);
  const results = useMemo(() => catalog.data ?? [], [catalog.data]);
  const names = useMemo(() => new Map(muscles.map((m) => [m.key, m.short || m.name])), [muscles]);
  const typed = q.trim();
  const exact = results.some((e) => exerciseNameKey(e.name) === exerciseNameKey(typed));

  if (adHoc) return <AdHocForm initialName={typed} muscles={muscles} onAdd={onAdHoc} onBack={() => setAdHoc(false)} />;

  return (
    <View style={styles.stack} testID="editor-picker">
      <View style={styles.row}>
        <Chip label="Geri" icon="back" onPress={onBack} testID="picker-back" />
      </View>
      <TextField label="Hareket ara" value={q} onChangeText={setQ} icon="search" autoCorrect={false} autoCapitalize="none" testID="picker-search" />
      {typed && !exact ? (
        <Pressable onPress={() => setAdHoc(true)} haptic="select" testID="picker-adhoc" accessibilityLabel={`${typed} adında kendi hareketini ekle`} style={[styles.item, { backgroundColor: colors.primarySoft }]}>
          <Icon icon="add" size={20} color="primary" />
          <View style={styles.texts}>
            <Text variant="bodyStrong" color="primary" numberOfLines={1}>
              «{typed}» ekle
            </Text>
            <Text variant="caption" color="inkMuted">
              Katalogda yoksa kendi hareketin olarak ekle
            </Text>
          </View>
        </Pressable>
      ) : null}
      {results.length === 0 && !catalog.isPending ? (
        <Text variant="body" color="inkMuted">
          Katalogda sonuç yok.
        </Text>
      ) : null}
      {results.map((exercise) => (
        <Pressable
          key={exercise.id}
          onPress={() => onPick(exercise)}
          haptic="select"
          testID={`picker-item-${exercise.id}`}
          accessibilityLabel={`${exercise.name}, ${mainMuscles(exercise, names)}`}
          style={[styles.item, { backgroundColor: colors.surfaceMuted }]}
        >
          <View style={styles.texts}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {exercise.name}
            </Text>
            <Text variant="caption" color="inkMuted" numberOfLines={1}>
              {mainMuscles(exercise, names) || "Kas bilgisi yok"} · {exercise.defaultSets}×{exercise.defaultReps}
              {exercise.metric === "time" ? " sn" : ""}
            </Text>
          </View>
          <Icon icon="add" size={20} color="primary" />
        </Pressable>
      ))}
      {!typed ? (
        <Button label="Kendi hareketini ekle" variant="ghost" icon="create-outline" onPress={() => setAdHoc(true)} testID="picker-adhoc-open" />
      ) : null}
    </View>
  );
}

const LOAD_STEPS = [0, 1, 0.5] as const;
const LOAD_TR: Record<number, string> = { 1: "ana", 0.5: "yardımcı" };

function AdHocForm({ initialName, muscles, onAdd, onBack }: { initialName: string; muscles: readonly MuscleDTO[]; onAdd: (t: ExerciseTargetDTO) => void; onBack: () => void }) {
  const [name, setName] = useState(initialName);
  const [metric, setMetric] = useState<ExerciseMetric>("reps");
  const [loads, setLoads] = useState<Record<string, number>>({});
  const picked: MuscleLoad[] = Object.entries(loads)
    .filter(([, load]) => load > 0)
    .map(([key, load]) => ({ key, load }));
  const cycle = (key: string) =>
    setLoads((prev) => {
      const at = LOAD_STEPS.indexOf((prev[key] ?? 0) as (typeof LOAD_STEPS)[number]);
      return { ...prev, [key]: LOAD_STEPS[(at + 1) % LOAD_STEPS.length] };
    });
  const ready = name.trim().length > 0 && picked.length > 0;
  return (
    <View style={styles.stack} testID="adhoc-form">
      <View style={styles.row}>
        <Chip label="Geri" icon="back" onPress={onBack} testID="adhoc-back" />
      </View>
      <TextField label="Hareket adı" value={name} onChangeText={setName} maxLength={60} testID="adhoc-name" />
      <Segmented
        options={[
          { value: "reps" as const, label: "Tekrar" },
          { value: "time" as const, label: "Süre" },
        ]}
        value={metric === "time" ? "time" : "reps"}
        onChange={setMetric}
        testID="adhoc-metric"
      />
      <View style={styles.gapXs}>
        <Text variant="label">Çalıştırdığı kaslar</Text>
        <Text variant="caption" color="inkMuted">
          Bir dokunuş ana kas, iki dokunuş yardımcı kas (yarım set sayılır).
        </Text>
      </View>
      <View style={styles.chips}>
        {muscles
          .filter((m) => m.active !== false)
          .map((m) => {
            const load = loads[m.key] ?? 0;
            return (
              <Chip
                key={m.key}
                label={load > 0 ? `${m.name} · ${LOAD_TR[load]}` : m.name}
                selected={load === 1}
                tone={load === 0.5 ? "primary" : "neutral"}
                onPress={() => cycle(m.key)}
                testID={`adhoc-muscle-${m.key}`}
              />
            );
          })}
      </View>
      <Button label="Hareketi ekle" icon="add" variant="secondary" disabled={!ready} onPress={() => onAdd(adHocTarget(name, picked, metric))} testID="adhoc-add" />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  row: { flexDirection: "row" },
  texts: { flex: 1, gap: 2 },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.lg, borderRadius: radii.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  gapXs: { gap: spacing.xs },
});
