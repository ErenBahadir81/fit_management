import React, { useEffect, useRef } from "react";
import { StyleSheet, View, type TextInput } from "react-native";
import { spacing } from "../../../theme/tokens";
import { Text } from "../../../ui/Text";
import { TextField } from "../../../ui/TextField";
import { measurementFields, type MeasurementField } from "../model";
import type { Onboarding } from "../useOnboarding";

const WHY: Record<MeasurementField, string> = {
  weightKg: "Sabah, tuvaletten sonra, aç karnına.",
  neckCm: "Mezura gırtlağın hemen altından, yere paralel.",
  waistCm: "Göbek hizasından, nefesini tutmadan.",
  hipCm: "Kalçanın en geniş yerinden.",
};

const LABEL: Record<MeasurementField, string> = { weightKg: "Kilo", neckCm: "Boyun", waistCm: "Bel", hipCm: "Kalça" };
const UNIT: Record<MeasurementField, string> = { weightKg: "kg", neckCm: "cm", waistCm: "cm", hipCm: "cm" };

/** How long a value has to sit still before Floo reacts to it (so "9" on the way to "92" is not news). */
export const MEASURE_SETTLE_MS = 700;

/** "82,4" and "82.4" mean the same thing to a person; empty means "not answered yet". */
export function parseMeasurement(text: string): number | null {
  const t = text.replace(",", ".").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Stage 3 — the three (or four) numbers behind the body-fat estimate, each with how to take it.
 * Every value that settles is handed to Floo (`onMeasured`), who answers at once; the ring next
 * to him fills with each one.
 */
export function MeasureStep({ o, onMeasured }: { o: Onboarding; onMeasured: (field: MeasurementField) => void }) {
  const [text, setText] = React.useState<Record<string, string>>(() => {
    const m = o.draft.measurement;
    const s = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));
    return { weightKg: s(m.weightKg), neckCm: s(m.neckCm), waistCm: s(m.waistCm), hipCm: s(m.hipCm) };
  });
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const refs = useRef<Partial<Record<MeasurementField, TextInput | null>>>({});
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (settle.current && clearTimeout(settle.current)), []);

  const fields = measurementFields(o.draft.profile.gender);

  const react = (field: MeasurementField, delay: number) => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => onMeasured(field), delay);
  };

  const set = (field: MeasurementField, raw: string) => {
    setText((t) => ({ ...t, [field]: raw }));
    o.patch((d) => ({ ...d, measurement: { ...d.measurement, [field]: parseMeasurement(raw) } }));
    react(field, MEASURE_SETTLE_MS);
  };

  return (
    <View style={styles.stack}>
      {fields.map((f, i) => {
        const last = i === fields.length - 1;
        return (
          <TextField
            key={f}
            ref={(r) => {
              refs.current[f] = r;
            }}
            label={LABEL[f]}
            value={text[f] ?? ""}
            onChangeText={(v) => set(f, v)}
            onBlur={() => {
              setTouched((t) => ({ ...t, [f]: true }));
              if (text[f]) react(f, 0);
            }}
            error={touched[f] ? o.errors[f] : undefined}
            hint={WHY[f]}
            unit={UNIT[f]}
            keyboardType="decimal-pad"
            returnKeyType={last ? "done" : "next"}
            autoFocus={i === 0 && !text[f]}
            onSubmitEditing={() => (last ? o.next() : refs.current[fields[i + 1]]?.focus())}
            testID={`ob-${f}`}
          />
        );
      })}
      {o.bodyFatPct === null ? (
        <Text variant="caption" color="inkSubtle" testID="ob-estimate-waiting">
          {`${fields.length === 4 ? "Dört" : "Üç"} ölçü tamamlanınca yağ oranın Floo'nun yanındaki halkada belirecek.`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
});
