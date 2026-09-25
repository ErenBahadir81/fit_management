import React from "react";
import { StyleSheet, View } from "react-native";
import { ACTIVITY_TR, type ActivityLevel, type TrainingExperience } from "@fitfloow/core";
import { spacing } from "../../../theme/tokens";
import { Chip } from "../../../ui/Chip";
import { ChoiceList } from "../components/ChoiceList";
import type { Onboarding } from "../useOnboarding";
import { Question } from "./Question";

const ACTIVITY: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: "sedentary", label: ACTIVITY_TR.sedentary, hint: "Masa başı, gün içinde pek hareket yok." },
  { value: "light", label: ACTIVITY_TR.light, hint: "Biraz yürüyüş, ayakta geçen kısa anlar." },
  { value: "moderate", label: ACTIVITY_TR.moderate, hint: "Hareketli bir iş ya da düzenli spor." },
  { value: "active", label: ACTIVITY_TR.active, hint: "Neredeyse her gün antrenman, ayakta geçen bir gün." },
  { value: "veryActive", label: ACTIVITY_TR.veryActive, hint: "Ağır fiziksel iş ya da günde iki antrenman." },
];

export const EXPERIENCE: { value: TrainingExperience; label: string; hint: string }[] = [
  { value: "none", label: "Hiç yapmadım", hint: "Sıfırdan başlıyoruz; en hızlı gelişim burada." },
  { value: "under1", label: "1 yıldan az", hint: "Temeller oturuyor." },
  { value: "oneToThree", label: "1–3 yıl", hint: "Düzenli çalışıyorsun." },
  { value: "overThree", label: "3 yıldan fazla", hint: "Deneyimlisin; kazanımlar yavaşlar ama sürer." },
];

export const DAY_OPTIONS = [2, 3, 4, 5, 6] as const;

/** Stage 4 — how active the day is, how many days a week for training, and for how long so far. */
export function TrainingStep({ o }: { o: Onboarding }) {
  const t = o.draft.training;
  const setTraining = (next: Partial<typeof t>) => o.patch((d) => ({ ...d, training: { ...d.training, ...next } }));

  return (
    <View style={styles.stack}>
      <Question title="Günün ne kadar hareketli?" why="Günlük kalori ihtiyacın buna göre ölçekleniyor.">
        <ChoiceList options={ACTIVITY} value={t.activityLevel} onChange={(activityLevel) => setTraining({ activityLevel })} label="Hareket düzeyi" columns={2} testID="ob-activity" />
      </Question>

      <Question title="Haftada kaç gün antrenman?" why="İlk programın bu kadar günle kurulacak; sonra dilediğin gibi değiştirirsin.">
        <View style={styles.days} accessibilityRole="radiogroup" accessibilityLabel="Haftalık antrenman günü" testID="ob-days">
          {DAY_OPTIONS.map((n) => (
            <Chip
              key={n}
              label={`${n} gün`}
              selected={t.daysPerWeek === n}
              onPress={() => setTraining({ daysPerWeek: n })}
              accessibilityRole="radio"
              accessibilityState={{ selected: t.daysPerWeek === n, checked: t.daysPerWeek === n }}
              testID={`ob-days-${n}`}
            />
          ))}
        </View>
      </Question>

      <Question title="Ne zamandır antrenman yapıyorsun?" why="Kas kazanma hızını ve programın zorluğunu belirliyor.">
        <ChoiceList options={EXPERIENCE} value={t.experience} onChange={(experience) => setTraining({ experience })} label="Antrenman deneyimi" columns={2} testID="ob-experience" />
      </Question>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xxl },
  days: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
