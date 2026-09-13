import React from "react";
import { StyleSheet, View } from "react-native";
import { ACTIVITY_TR, type ActivityLevel, type Gender } from "@fitfloow/core";
import { ageFromBirthDate } from "@fitfloow/core";
import { todayKey } from "../../../lib/dates";
import { spacing } from "../../../theme/tokens";
import { Chip } from "../../../ui/Chip";
import { DatePicker } from "../../../ui/DatePicker";
import { Segmented } from "../../../ui/Segmented";
import { Stepper } from "../../../ui/Stepper";
import { Text } from "../../../ui/Text";
import { DEFAULT_HEIGHT_CM } from "../model";
import type { Onboarding } from "../useOnboarding";

const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Erkek" },
  { value: "female", label: "Kadın" },
];

const ACTIVITY: { value: ActivityLevel; body: string }[] = [
  { value: "sedentary", body: "Masa başı, gün içinde pek hareket yok." },
  { value: "light", body: "Haftada bir iki antrenman, ayakta biraz vakit." },
  { value: "moderate", body: "Haftada üç dört antrenman ya da hareketli bir iş." },
  { value: "active", body: "Neredeyse her gün antrenman, ayakta geçen bir gün." },
  { value: "veryActive", body: "Ağır fiziksel iş ya da günde iki antrenman." },
];

const THIS_YEAR = new Date().getUTCFullYear();

/**
 * The four facts every calculation downstream needs. Each block says what it is *for*, so nothing
 * feels like an interrogation, and the birth date is a real wheel picker rather than a text field
 * asking someone to spell out a date format.
 */
export function AboutStep({ o }: { o: Onboarding }) {
  const p = o.draft.profile;
  const age = p.birthDate ? ageFromBirthDate(p.birthDate, todayKey()) : null;
  const activity = ACTIVITY.find((a) => a.value === p.activityLevel);

  return (
    <View style={styles.stack}>
      <Block title="Cinsiyet" why="Yağ oranı formülü kadın ve erkekte farklı çalışıyor." error={o.errors.gender}>
        <Segmented<Gender>
          options={GENDERS}
          value={p.gender ?? ("" as Gender)}
          onChange={(gender) => o.patch((d) => ({ ...d, profile: { ...d.profile, gender } }))}
          testID="ob-gender"
        />
      </Block>

      <Block title="Boy" why="Hem yağ oranı hem bazal metabolizma hesabına giriyor." error={o.errors.heightCm}>
        <View style={styles.centered}>
          <Stepper
            value={p.heightCm ?? DEFAULT_HEIGHT_CM}
            min={100}
            max={250}
            step={1}
            format={(v) => `${v} cm`}
            onChange={(heightCm) => o.patch((d) => ({ ...d, profile: { ...d.profile, heightCm } }))}
            testID="ob-height"
          />
        </View>
      </Block>

      <Block title="Doğum tarihi" why={age === null ? "Yaş, bazal metabolizma hesabını belirgin biçimde değiştiriyor." : `${age} yaşındasın.`} error={o.errors.birthDate}>
        <DatePicker
          value={p.birthDate}
          onChange={(birthDate) => o.patch((d) => ({ ...d, profile: { ...d.profile, birthDate } }))}
          label="Doğum tarihi"
          minYear={THIS_YEAR - 100}
          maxYear={THIS_YEAR - 13}
          testID="ob-birth"
        />
      </Block>

      <Block title="Hareket düzeyin" why="Günlük kalori ihtiyacın buna göre çarpanla ölçekleniyor." error={o.errors.activityLevel}>
        <View style={styles.chips}>
          {ACTIVITY.map((a) => (
            <Chip
              key={a.value}
              label={ACTIVITY_TR[a.value]}
              selected={p.activityLevel === a.value}
              onPress={() => o.patch((d) => ({ ...d, profile: { ...d.profile, activityLevel: a.value } }))}
              testID={`ob-activity-${a.value}`}
            />
          ))}
        </View>
        <Text variant="body" color="inkMuted" accessibilityLiveRegion="polite" style={styles.activityBody}>
          {activity?.body ?? "Birini seç; açıklaması burada görünecek."}
        </Text>
      </Block>
    </View>
  );
}

function Block({ title, why, error, children }: { title: string; why: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <Text variant="title">{title}</Text>
      <Text variant="caption" color="inkMuted">
        {why}
      </Text>
      <View style={styles.blockBody}>{children}</View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xxl },
  block: { gap: spacing.xxs },
  blockBody: { marginTop: spacing.sm },
  centered: { alignSelf: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  activityBody: { marginTop: spacing.sm, minHeight: 44 },
});
