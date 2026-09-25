import React from "react";
import { StyleSheet, View } from "react-native";
import { ageFromBirthDate, type Gender } from "@fitfloow/core";
import { todayKey } from "../../../lib/dates";
import { spacing } from "../../../theme/tokens";
import { DatePicker } from "../../../ui/DatePicker";
import { Stepper } from "../../../ui/Stepper";
import { ChoiceList } from "../components/ChoiceList";
import { DEFAULT_HEIGHT_CM } from "../model";
import type { Onboarding } from "../useOnboarding";
import { Question } from "./Question";

const SEXES = [
  { value: "female", label: "Kadın" },
  { value: "male", label: "Erkek" },
] as const satisfies readonly { value: Gender; label: string }[];

const THIS_YEAR = new Date().getUTCFullYear();

/** Stage 2 — sex, birth date, height: the three facts every calculation downstream needs. */
export function BodyStep({ o }: { o: Onboarding }) {
  const p = o.draft.profile;
  const age = p.birthDate ? ageFromBirthDate(p.birthDate, todayKey()) : null;
  const setProfile = (next: Partial<typeof p>) => o.patch((d) => ({ ...d, profile: { ...d.profile, ...next } }));

  return (
    <View style={styles.stack}>
      <Question title="Cinsiyet" why="Yağ oranı formülü kadın ve erkekte farklı çalışıyor.">
        <ChoiceList options={SEXES} value={p.gender} onChange={(gender) => setProfile({ gender })} label="Cinsiyet" columns={2} testID="ob-gender" />
      </Question>

      <Question title="Doğum tarihi" why={age === null ? "Yaş, günlük kalori hesabını belirgin biçimde değiştiriyor." : `${age} yaşındasın.`} error={p.birthDate ? o.errors.birthDate : undefined}>
        <DatePicker value={p.birthDate} onChange={(birthDate) => setProfile({ birthDate })} label="Doğum tarihi" minYear={THIS_YEAR - 100} maxYear={THIS_YEAR - 13} testID="ob-birth" />
      </Question>

      <Question title="Boy" why="Hem yağ oranı hem kas kütlesi hesabına giriyor." error={o.errors.heightCm}>
        <View style={styles.start}>
          <Stepper value={p.heightCm ?? DEFAULT_HEIGHT_CM} min={100} max={250} step={1} format={(v) => `${v} cm`} onChange={(heightCm) => setProfile({ heightCm })} testID="ob-height" />
        </View>
      </Question>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xxl },
  start: { alignSelf: "flex-start" },
});
