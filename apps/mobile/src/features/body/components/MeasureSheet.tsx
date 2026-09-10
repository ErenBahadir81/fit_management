import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { round, type BodyEntryDTO, type BodyEntryInput, type Gender } from "@fitfloow/core";
import { fmtKg, fmtNumber, fmtPct } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { Segmented } from "../../../ui/Segmented";
import { Sheet, type SheetRef } from "../../../ui/Sheet";
import { Stepper } from "../../../ui/Stepper";
import { SuccessCheck } from "../../../ui/SuccessCheck";
import { Text } from "../../../ui/Text";
import { BF_UNCERTAINTY, navyPreview, type MeasureDraft } from "../bodyMath";
import { useCreateBodyEntry } from "../useBody";

export interface MeasureProfile {
  gender: Gender;
  heightCm: number | null;
}
export interface MeasureDefaults {
  weightKg: number;
  neckCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
}

const GENDER_OPTIONS = [
  { value: "male", label: "Erkek" },
  { value: "female", label: "Kadın" },
] as const;

const toText = (v: number) => String(v).replace(".", ",");
const parse = (s: string) => {
  const n = Number(s.replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
};

interface FieldProps {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  unit: string;
}

/** Stepper + numeric input that stay in sync; the input accepts a Turkish comma. */
function MeasureField({ id, label, value, onChange, step, min, max, unit }: FieldProps) {
  const { colors } = useTheme();
  const [text, setText] = useState(() => toText(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(toText(value));
  }, [value]);
  const digits = step < 1 ? 1 : 0;
  const onText = (s: string) => {
    setText(s);
    const n = parse(s);
    if (n !== null) onChange(round(n, digits));
  };
  return (
    <View style={styles.field}>
      <Text variant="label" color="inkMuted">
        {label}
      </Text>
      <View style={styles.fieldRow}>
        <Stepper value={value} onChange={onChange} step={step} min={min} max={max} format={(v) => `${fmtNumber(v, digits)} ${unit}`} label={label} size="sm" testID={id} />
        <View style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <BottomSheetTextInput
            testID={`${id}-input`}
            value={text}
            onChangeText={onText}
            onFocus={() => (editing.current = true)}
            onBlur={() => {
              editing.current = false;
              setText(toText(value));
            }}
            keyboardType="decimal-pad"
            returnKeyType="done"
            selectTextOnFocus
            accessibilityLabel={`${label} değeri`}
            style={[styles.inputText, { color: colors.ink }]}
          />
          <Text variant="caption" color="inkSubtle">
            {unit}
          </Text>
        </View>
      </View>
    </View>
  );
}

export interface MeasureFormProps {
  profile: MeasureProfile;
  defaults: MeasureDefaults;
  onSave: (input: BodyEntryInput) => void;
  saving: boolean;
}

/** Gender/height prefilled, neck/waist/(hip)/weight steppers, live Navy preview, validation copy. */
export function MeasureForm({ profile, defaults, onSave, saving }: MeasureFormProps) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<MeasureDraft>({
    gender: profile.gender,
    heightCm: profile.heightCm ?? 175,
    neckCm: defaults.neckCm ?? (profile.gender === "male" ? 38 : 33),
    waistCm: defaults.waistCm ?? (profile.gender === "male" ? 88 : 76),
    hipCm: defaults.hipCm ?? (profile.gender === "female" ? 96 : null),
    weightKg: defaults.weightKg,
  });
  const set = useCallback(<K extends keyof MeasureDraft>(k: K) => (v: MeasureDraft[K]) => setDraft((d) => ({ ...d, [k]: v })), []);
  const preview = useMemo(() => navyPreview(draft), [draft]);
  const canSave = !preview.error && !saving;

  const save = () => {
    if (!canSave) return;
    onSave({ gender: draft.gender, heightCm: draft.heightCm, neckCm: draft.neckCm, waistCm: draft.waistCm, hipCm: draft.gender === "female" ? draft.hipCm : null, weightKg: draft.weightKg });
  };

  return (
    <View style={styles.form}>
      <Segmented
        options={GENDER_OPTIONS as unknown as { value: Gender; label: string }[]}
        value={draft.gender}
        onChange={(g) => setDraft((d) => ({ ...d, gender: g, hipCm: g === "female" ? (d.hipCm ?? 96) : d.hipCm }))}
        size="sm"
        testID="mf-gender"
      />
      <MeasureField id="mf-height" label="Boy" value={draft.heightCm} onChange={set("heightCm")} step={1} min={100} max={250} unit="cm" />
      <MeasureField id="mf-neck" label="Boyun" value={draft.neckCm} onChange={set("neckCm")} step={0.5} min={20} max={80} unit="cm" />
      <MeasureField id="mf-waist" label="Bel (göbek hizası)" value={draft.waistCm} onChange={set("waistCm")} step={0.5} min={40} max={250} unit="cm" />
      {draft.gender === "female" ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
          <MeasureField id="mf-hip" label="Kalça (en geniş yer)" value={draft.hipCm ?? 96} onChange={set("hipCm")} step={0.5} min={50} max={250} unit="cm" />
        </Animated.View>
      ) : null}
      <MeasureField id="mf-weight" label="Kilo" value={draft.weightKg} onChange={set("weightKg")} step={0.1} min={25} max={400} unit="kg" />

      <Animated.View layout={LinearTransition.springify().damping(20).stiffness(180)} style={[styles.preview, { backgroundColor: preview.error ? colors.dangerSoft : colors.primarySoft }]} testID="mf-preview">
        {preview.error ? (
          <Text variant="bodyStrong" tone="danger" testID="mf-error" accessibilityLiveRegion="polite">
            {preview.error}
          </Text>
        ) : (
          <>
            <View style={styles.previewHead}>
              <View style={styles.previewBf}>
                <Text variant="display" tone="primary" tabular testID="mf-preview-bf">
                  {fmtPct(preview.bodyFatPct, 1)}
                </Text>
                <Text variant="caption" color="inkSubtle" tabular>
                  ±{fmtNumber(BF_UNCERTAINTY, 1)}
                </Text>
              </View>
              {preview.categoryLabel ? <Chip label={preview.categoryLabel} tone="primary" size="sm" /> : null}
            </View>
            <View style={styles.previewRow}>
              <Text variant="body" color="inkMuted" tabular>
                Yağ {fmtKg(preview.fatMassKg)}
              </Text>
              <Text variant="body" color="inkMuted" tabular>
                Yağsız {fmtKg(preview.leanMassKg)}
              </Text>
            </View>
            <Text variant="caption" color="inkSubtle">
              US Navy formülü · mezura ile, sabah, nefes vermişken
            </Text>
          </>
        )}
      </Animated.View>

      <Button label="Kaydet" onPress={save} disabled={!canSave} loading={saving} full testID="mf-save" />
    </View>
  );
}

function SavedState({ entry, onClose }: { entry: BodyEntryDTO; onClose: () => void }) {
  return (
    <View style={styles.saved}>
      <SuccessCheck />
      <Text variant="heading" align="center">
        Ölçüm kaydedildi
      </Text>
      <Text variant="body" color="inkMuted" align="center" tabular>
        {fmtPct(entry.bodyFatPct)} yağ · {fmtKg(entry.leanMassKg)} yağsız kütle
      </Text>
      <Button label="Tamam" variant="secondary" onPress={onClose} testID="mf-done" />
    </View>
  );
}

export interface MeasureSheetProps {
  profile: MeasureProfile;
  defaults: MeasureDefaults;
}

/** "Ölçüm ekle" bottom sheet. Content mounts on present (cheap to keep in the tree). */
export const MeasureSheet = forwardRef<SheetRef, MeasureSheetProps>(function MeasureSheet({ profile, defaults }, ref) {
  const inner = useRef<SheetRef>(null);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<BodyEntryDTO | null>(null);
  const create = useCreateBodyEntry();
  useImperativeHandle(
    ref,
    () => ({
      present: () => {
        setSaved(null);
        setOpen(true);
        inner.current?.present();
      },
      dismiss: () => inner.current?.dismiss(),
    }),
    []
  );
  const onDismiss = () => {
    setOpen(false);
    setSaved(null);
    create.reset();
  };
  return (
    <Sheet ref={inner} title={open && !saved ? "Ölçüm ekle" : undefined} onDismiss={onDismiss}>
      {open ? saved ? <SavedState entry={saved} onClose={() => inner.current?.dismiss()} /> : <MeasureForm profile={profile} defaults={defaults} saving={create.isPending} onSave={(input) => create.mutate(input, { onSuccess: (e) => setSaved(e) })} /> : null}
    </Sheet>
  );
});

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  field: { gap: spacing.xs },
  fieldRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  input: { flexDirection: "row", alignItems: "center", gap: spacing.xs, height: 40, borderRadius: radii.sm, borderWidth: 1, paddingHorizontal: spacing.md, minWidth: 96 },
  inputText: { flex: 1, fontSize: 15, fontVariant: ["tabular-nums"], paddingVertical: 0, textAlign: "right" },
  preview: { borderRadius: radii.md, padding: spacing.lg, gap: spacing.xs, minHeight: 64, justifyContent: "center" },
  previewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  previewBf: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs },
  previewRow: { flexDirection: "row", gap: spacing.lg },
  saved: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg },
});
