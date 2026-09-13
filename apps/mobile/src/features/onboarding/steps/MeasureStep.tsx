import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { BODY_FAT_CATEGORY_TR, bodyComposition, bodyFatCategory } from "@fitfloow/core";
import { fmtKg, fmtPct } from "../../../lib/format";
import { spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { Chip } from "../../../ui/Chip";
import { Text } from "../../../ui/Text";
import { TextField } from "../../../ui/TextField";
import type { Onboarding } from "../useOnboarding";
import type { OnboardingDraft } from "../model";

type Field = keyof OnboardingDraft["measurement"];

const WHY: Record<Field, string> = {
  weightKg: "Planın tamamı bu sayının etrafında kuruluyor.",
  neckCm: "Formül yağ oranını boyun ile bel arasındaki farktan çıkarıyor.",
  waistCm: "Yağ önce burada birikir; değişimi en net burada görürsün.",
  hipCm: "Kadınlarda formül kalçayı da hesaba katıyor.",
};

const LABEL: Record<Field, string> = { weightKg: "Kilo", neckCm: "Boyun", waistCm: "Bel", hipCm: "Kalça" };
const UNIT: Record<Field, string> = { weightKg: "kg", neckCm: "cm", waistCm: "cm", hipCm: "cm" };

/** "82,4" and "82.4" both mean the same thing to a person; empty means "not answered yet". */
function parse(text: string): number | null {
  const t = text.replace(",", ".").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * The three (or four) numbers that make a body-fat estimate possible, each with the one line that
 * explains why it is being asked for. The estimate appears the instant it can be computed, so the
 * measuring feels like it pays off immediately rather than at the end of the flow.
 */
export function MeasureStep({ o }: { o: Onboarding }) {
  const reduce = useReducedMotion();
  const [text, setText] = React.useState<Record<string, string>>(() => {
    const m = o.draft.measurement;
    return {
      weightKg: m.weightKg === null ? "" : String(m.weightKg),
      neckCm: m.neckCm === null ? "" : String(m.neckCm),
      waistCm: m.waistCm === null ? "" : String(m.waistCm),
      hipCm: m.hipCm === null ? "" : String(m.hipCm),
    };
  });
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});

  const fields: Field[] = o.draft.profile.gender === "female" ? ["weightKg", "neckCm", "waistCm", "hipCm"] : ["weightKg", "neckCm", "waistCm"];

  const set = (field: Field, raw: string) => {
    setText((t) => ({ ...t, [field]: raw }));
    o.patch((d) => ({ ...d, measurement: { ...d.measurement, [field]: parse(raw) } }));
  };

  const bf = o.bodyFatPct;
  const weight = o.draft.measurement.weightKg;

  return (
    <View style={styles.stack}>
      {fields.map((f) => (
        <TextField
          key={f}
          label={LABEL[f]}
          value={text[f] ?? ""}
          onChangeText={(v) => set(f, v)}
          onBlur={() => setTouched((t) => ({ ...t, [f]: true }))}
          error={touched[f] ? o.errors[f] : undefined}
          hint={WHY[f]}
          unit={UNIT[f]}
          keyboardType="decimal-pad"
          returnKeyType="done"
          testID={`ob-${f}`}
        />
      ))}

      {bf !== null && weight !== null ? (
        <Animated.View entering={reduce ? FadeIn.duration(150) : FadeIn.duration(220)}>
          <Estimate bodyFatPct={bf} weightKg={weight} gender={o.draft.profile.gender ?? "male"} />
        </Animated.View>
      ) : (
        <Text variant="caption" color="inkSubtle" testID="ob-estimate-waiting">
          Üç ölçü tamamlanınca yağ oranı tahminin burada belirecek.
        </Text>
      )}
    </View>
  );
}

function Estimate({ bodyFatPct, weightKg, gender }: { bodyFatPct: number; weightKg: number; gender: "male" | "female" }) {
  const { fatMassKg, leanMassKg } = bodyComposition(weightKg, bodyFatPct);
  const category = BODY_FAT_CATEGORY_TR[bodyFatCategory(gender, bodyFatPct)];
  return (
    <Card variant="muted" testID="ob-estimate" accessibilityLabel={`Tahmini yağ oranın ${fmtPct(bodyFatPct)}, ${category}. Yağsız kütle ${fmtKg(leanMassKg)}.`}>
      <View style={styles.estimateHead}>
        <Text variant="label" color="inkMuted">
          Tahmini yağ oranın
        </Text>
        <Chip label={category} tone="primary" size="sm" />
      </View>
      <Text variant="hero" tone="primary" tabular testID="ob-estimate-pct">
        {fmtPct(bodyFatPct)}
      </Text>
      <Text variant="body" color="inkMuted" tabular>
        {fmtKg(leanMassKg)} yağsız kütle · {fmtKg(fatMassKg)} yağ
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  estimateHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
});
