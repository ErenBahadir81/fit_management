import React, { useCallback, useMemo, useReducer, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { programVolume, type ExerciseDTO, type ExerciseTargetDTO, type MuscleDTO, type ProgramDTO } from "@fitfloow/core";
import { Floo } from "../../../mascot";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { Header } from "../../../ui/Header";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Screen } from "../../../ui/Screen";
import { Segmented } from "../../../ui/Segmented";
import { Sheet, useSheet } from "../../../ui/Sheet";
import { Text } from "../../../ui/Text";
import { TextField } from "../../../ui/TextField";
import { useToast } from "../../../ui/Toast";
import {
  canAddDay,
  canRemoveDay,
  dayLabel,
  draftFromProgram,
  draftVolumeDays,
  editorReducer,
  isDirty,
  targetFromExercise,
  toProgramInput,
  validateDraft,
  type EditorAction,
  type EditorDraft,
} from "../lib/editorDraft";
import { needsMore, plannedRows, suggestExercise } from "../lib/volume";
import { useExerciseCatalog, useMuscles, useProgram, useUpdateProgram } from "../queries";
import { VolumeBars } from "../volume/VolumeBars";
import { DayEditor } from "./DayEditor";
import { DayList } from "./DayList";
import { ExercisePicker } from "./ExercisePicker";
import { useVolumeFloo } from "./useVolumeFloo";

type View_ = { kind: "days" } | { kind: "day"; index: number } | { kind: "picker"; index: number };

const MODES = [
  { value: "cycle" as const, label: "Döngü" },
  { value: "weekly" as const, label: "Haftalık" },
];
const NO_EXERCISES: ExerciseDTO[] = [];
const NO_MUSCLES: MuscleDTO[] = [];

/** A program with no days yet starts with one empty strength day, ready to fill. */
function startingDraft(program: ProgramDTO): EditorDraft {
  const draft = draftFromProgram(program);
  if (draft.days.length > 0) return draft;
  return editorReducer({ ...draft, name: draft.name || "Programım" }, { type: "add-day", kind: "strength" });
}

/** Route: `/(modals)/program-editor`. Loads the program, then hands a draft to the editor. */
export function ProgramEditorScreen() {
  const router = useRouter();
  const program = useProgram();
  const close = useCallback(() => router.back(), [router]);
  const view = program.data ?? null;
  if (!view) {
    return (
      <Screen tabBar={false} edges={["top", "bottom"]}>
        <Header title="Program" compact left={{ icon: "close", label: "Kapat", onPress: close, testID: "editor-cancel" }} />
        {program.isError ? (
          <EmptyState illustration={<Floo mood="worried" size="m" />} title="Program yüklenemedi" body="Bağlantını kontrol edip tekrar dene." action={{ label: "Tekrar dene", onPress: () => void program.refetch(), icon: "refresh" }} />
        ) : (
          <EmptyState illustration={<Floo mood="think" size="m" />} title="Hazırlanıyor…" body="Programın yükleniyor." />
        )}
      </Screen>
    );
  }
  // Keyed by program id: a draft never outlives the program it was made from.
  return <ProgramEditor key={view.program.id} program={view.program} onClose={close} />;
}

/**
 * The program editor, full screen. Everything is edited on a local draft (`editorDraft.ts`): the
 * volume bars recompute on every change (core `programVolume` on the draft days, with the current
 * catalog's activation values), Floo speaks up when an edit makes a muscle's volume a problem,
 * and "Kaydet" sends one optimistic `PUT /program`.
 */
export function ProgramEditor({ program, onClose }: { program: ProgramDTO; onClose: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const save = useUpdateProgram();
  const muscles = useMuscles();
  const catalog = useExerciseCatalog("");
  const [initial] = useState(() => startingDraft(program));
  const [draft, dispatch] = useReducer(editorReducer, initial);
  const [at, setAt] = useState<View_>({ kind: "days" });
  const { ref: dayPickRef, present: presentDayPick, dismiss: dismissDayPick } = useSheet();
  const [suggesting, setSuggesting] = useState<ExerciseDTO | null>(null);

  const creating = program.days.length === 0;
  const muscleList = muscles.data ?? NO_MUSCLES;
  const catalogList = catalog.data ?? NO_EXERCISES;
  const ready = Boolean(muscles.data && catalog.data);

  /* --------------------------- live volume + Floo --------------------------- */
  const volume = useMemo(() => programVolume(draftVolumeDays(draft), muscleList, { mode: draft.mode, catalog: catalogList }), [catalogList, draft, muscleList]);
  const rows = useMemo(() => plannedRows(volume.muscles), [volume.muscles]);
  const inProgram = useMemo(() => draft.days.flatMap((d) => d.exercises.map((e) => e.name)), [draft.days]);
  const suggestions = useMemo(() => {
    const out: Record<string, ExerciseDTO> = {};
    for (const r of rows) {
      if (!needsMore(r.sets)) continue;
      const ex = suggestExercise(catalogList, r.key, inProgram);
      if (ex) out[r.key] = ex;
    }
    return out;
  }, [catalogList, inProgram, rows]);
  const suggestionNames = useMemo(() => Object.fromEntries(Object.entries(suggestions).map(([k, e]) => [k, e.name])), [suggestions]);

  const strengthDays = useMemo(() => draft.days.map((d, i) => ({ d, i })).filter(({ d }) => d.kind === "strength"), [draft.days]);
  const addSuggestion = useCallback(
    (key: string) => {
      const ex = suggestions[key];
      if (!ex) return;
      // Inside a strength day the suggestion lands there; from the overview, the user picks the day.
      if (at.kind === "day" && draft.days[at.index]?.kind === "strength") {
        dispatch({ type: "add-exercise", index: at.index, exercise: targetFromExercise(ex) });
        toast.show({ message: `${ex.name} eklendi`, kind: "success" });
        return;
      }
      if (strengthDays.length === 1) {
        dispatch({ type: "add-exercise", index: strengthDays[0].i, exercise: targetFromExercise(ex) });
        toast.show({ message: `${ex.name} «${strengthDays[0].d.title}» gününe eklendi`, kind: "success" });
        return;
      }
      setSuggesting(ex);
      presentDayPick();
    },
    [at, draft.days, presentDayPick, strengthDays, suggestions, toast]
  );
  useVolumeFloo(ready ? volume.advice : null, (key) => (suggestions[key] ? { label: `${suggestions[key].name} ekle`, onPress: () => addSuggestion(key) } : null));

  /* --------------------------------- saving --------------------------------- */
  const issues = validateDraft(draft);
  const dirty = creating || isDirty(draft, initial);
  const commit = useCallback(() => {
    save.mutate(toProgramInput(draft), {
      onSuccess: () => {
        toast.show({ message: "Program kaydedildi", kind: "success" });
        onClose();
      },
    });
  }, [draft, onClose, save, toast]);

  const act = useCallback((a: EditorAction) => dispatch(a), []);
  const openDay = useCallback((index: number) => setAt({ kind: "day", index }), []);
  const moveDay = useCallback((from: number, to: number) => dispatch({ type: "move-day", from, to }), []);
  const removeDay = useCallback((index: number) => dispatch({ type: "remove-day", index }), []);

  const day = at.kind !== "days" ? draft.days[at.index] : undefined;
  const title = at.kind === "days" ? (creating ? "Program oluştur" : "Programı düzenle") : at.kind === "day" ? day?.title || dayLabel(draft.mode, at.index) : "Hareket ekle";

  const pickExercise = (index: number) => (exercise: ExerciseDTO) => {
    dispatch({ type: "add-exercise", index, exercise: targetFromExercise(exercise) });
    setAt({ kind: "day", index });
  };
  const addAdHoc = (index: number) => (target: ExerciseTargetDTO) => {
    dispatch({ type: "add-exercise", index, exercise: target });
    setAt({ kind: "day", index });
  };

  /** Bars for the muscles this day works — weekly totals, so the effect of each set is visible. */
  const dayVolume = (index: number) => {
    const d = draft.days[index];
    const keys = new Set(d?.exercises.flatMap((e) => (catalogList.find((c) => c.name === e.name)?.muscles ?? e.muscles).filter((m) => m.load > 0).map((m) => m.key)) ?? []);
    const dayRows = rows.filter((r) => keys.has(r.key));
    if (dayRows.length === 0) return null;
    return (
      <Card style={styles.volume} testID="editor-day-volume">
        <Text variant="title">Bu günün çalıştırdığı kaslar</Text>
        <Text variant="caption" color="inkMuted">
          Haftalık toplam; her set değişikliği anında yansır.
        </Text>
        <VolumeBars rows={dayRows} collapsible={false} testID="editor-day-bars" />
      </Card>
    );
  };

  return (
    <Screen tabBar={false} keyboard edges={["top", "bottom"]} contentStyle={styles.content}>
      <Header title={title} compact left={{ icon: "close", label: "Vazgeç", onPress: onClose, testID: "editor-cancel" }} />

      {at.kind === "days" ? (
        <View style={styles.stack} testID="editor-overview">
          <TextField label="Program adı" value={draft.name} onChangeText={(name) => dispatch({ type: "rename-program", name })} maxLength={60} testID="editor-name" />
          <View style={styles.gapSm}>
            <Segmented options={MODES} value={draft.mode} onChange={(mode) => dispatch({ type: "set-mode", mode })} testID="editor-mode" />
            <Text variant="caption" color="inkMuted">
              {draft.mode === "weekly" ? "Her gün bir hafta gününe bağlı: Pazartesi → Pazar." : "Günler takvimden bağımsız döner. Sıradaki gün, en son yaptığın günün ardından gelir."}
            </Text>
          </View>

          <Card style={styles.volume} testID="editor-volume">
            <Text variant="title">Haftalık hacim</Text>
            <Text variant="caption" color="inkMuted" tabular>
              {draft.mode === "cycle" && draft.days.length !== 7 ? `${draft.days.length} günlük döngü haftaya çevrildi (× 7 / ${draft.days.length}).` : "Kas başına haftalık etkin set."}
            </Text>
            {ready ? <VolumeBars rows={rows} suggestions={suggestionNames} onSuggest={addSuggestion} testID="editor-bars" /> : <Text variant="body" color="inkMuted">Kas verisi yükleniyor…</Text>}
          </Card>

          <View style={styles.daysHead}>
            <Text variant="title">Günler</Text>
            <Text variant="caption" color="inkMuted" tabular>
              {draft.days.length} gün
            </Text>
          </View>
          <DayList days={draft.days} mode={draft.mode} canRemove={canRemoveDay(draft) || (draft.mode === "weekly" && draft.days.length > 7)} onOpen={openDay} onMove={moveDay} onRemove={removeDay} />
          {canAddDay(draft) ? (
            <View style={styles.addRow}>
              <Button label="Gün ekle" variant="secondary" icon="add" onPress={() => dispatch({ type: "add-day", kind: "strength" })} style={styles.grow} testID="editor-add-day" />
              <Button label="Dinlenme ekle" variant="ghost" icon="rest" onPress={() => dispatch({ type: "add-day", kind: "rest" })} style={styles.grow} testID="editor-add-rest" />
            </View>
          ) : null}
        </View>
      ) : at.kind === "day" && day ? (
        <DayEditor
          day={day}
          index={at.index}
          label={dayLabel(draft.mode, at.index)}
          dispatch={act}
          onAdd={() => setAt({ kind: "picker", index: at.index })}
          onBack={() => setAt({ kind: "days" })}
          volume={dayVolume(at.index)}
        />
      ) : at.kind === "picker" ? (
        <ExercisePicker muscles={muscleList} onPick={pickExercise(at.index)} onAdHoc={addAdHoc(at.index)} onBack={() => setAt({ kind: "day", index: at.index })} />
      ) : null}

      {issues.length > 0 ? (
        <View style={[styles.issues, { backgroundColor: colors.warningSoft }]} testID="editor-issues" accessibilityLiveRegion="polite">
          {issues.map((issue) => (
            <View key={issue.message} style={styles.issue}>
              <Icon icon="warning" size={16} color="warning" />
              <Text variant="caption" color="ink" style={styles.grow}>
                {issue.message}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <Button
        label={creating ? "Programı oluştur" : "Kaydet"}
        variant="primary"
        size="lg"
        icon="check"
        full
        loading={save.isPending}
        disabled={!dirty || issues.length > 0}
        onPress={commit}
        testID="editor-save"
      />

      <Sheet ref={dayPickRef} title="Hangi güne eklensin?" onDismiss={() => setSuggesting(null)}>
        <View style={styles.gapSm} testID="suggest-day-sheet">
          {suggesting ? (
            <Text variant="body" color="inkMuted">
              {suggesting.name} · {suggesting.defaultSets}×{suggesting.defaultReps}
            </Text>
          ) : null}
          {strengthDays.map(({ d, i }) => (
            <Pressable
              key={d.key}
              onPress={() => {
                if (suggesting) dispatch({ type: "add-exercise", index: i, exercise: targetFromExercise(suggesting) });
                dismissDayPick();
              }}
              haptic="select"
              testID={`suggest-day-${i}`}
              accessibilityLabel={`${dayLabel(draft.mode, i)}, ${d.title}`}
              style={[styles.pickRow, { backgroundColor: colors.surfaceMuted }]}
            >
              <View style={styles.grow}>
                <Text variant="caption" color="inkMuted">
                  {dayLabel(draft.mode, i)}
                </Text>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {d.title}
                </Text>
              </View>
              <Icon icon="add" size={20} color="primary" />
            </Pressable>
          ))}
          {strengthDays.length === 0 ? (
            <Text variant="body" color="inkMuted">
              Programda güç günü yok. Önce bir gün ekle.
            </Text>
          ) : null}
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxxl },
  stack: { gap: spacing.lg },
  gapSm: { gap: spacing.sm },
  volume: { gap: spacing.sm },
  daysHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  addRow: { flexDirection: "row", gap: spacing.md },
  grow: { flex: 1 },
  issues: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.md },
  issue: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pickRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.lg, borderRadius: radii.md },
});
