import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ACTIVITY_TR, WEEKDAYS_TR_SHORT, isDateKey, type ActivityLevel, type Gender, type Weekday } from "@fitfloow/core";
import { env } from "../../lib/env";
import { fmtDate } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { radii, spacing, type ThemeMode } from "../../theme/tokens";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Chip } from "../../ui/Chip";
import { Divider } from "../../ui/Divider";
import { Header } from "../../ui/Header";
import { ListRow } from "../../ui/ListRow";
import { Screen } from "../../ui/Screen";
import { Segmented } from "../../ui/Segmented";
import { Sheet, SheetActions, useSheet } from "../../ui/Sheet";
import { Stepper } from "../../ui/Stepper";
import { Text } from "../../ui/Text";
import { TextField } from "../../ui/TextField";
import { Toggle } from "../../ui/Toggle";
import { useSession } from "../auth/session";
import { useUpdateMe } from "./useUpdateMe";

const ACTIVITY_KEYS = Object.keys(ACTIVITY_TR) as ActivityLevel[];
const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "Sistem" },
  { value: "light", label: "Açık" },
  { value: "dark", label: "Koyu" },
];

/** Profile & settings. Every change is optimistic; the only destructive action sits at the bottom. */
export function ProfileScreen() {
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);
  const { colors, mode, setMode } = useTheme();
  const update = useUpdateMe();
  const { ref: birthRef, present: openBirth, dismiss: closeBirth } = useSheet();
  const [birthDraft, setBirthDraft] = useState("");
  const [birthError, setBirthError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;
  const initials = user.displayName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const saveBirth = () => {
    const v = birthDraft.trim();
    if (!isDateKey(v)) return setBirthError("YYYY-AA-GG biçiminde gir (örn. 1996-04-12).");
    setBirthError(null);
    update.mutate({ birthDate: v });
    closeBirth();
  };

  return (
    <Screen>
      <Header title="Profil" subtitle="Hesabın ve tercihlerin" />

      <Card>
        <View style={styles.identity}>
          <LinearGradient colors={[...colors.gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
            <Text variant="heading" color="onPrimary">
              {initials}
            </Text>
          </LinearGradient>
          <View style={styles.identityTexts}>
            <Text variant="heading">{user.displayName}</Text>
            <Text variant="body" color="inkMuted">
              @{user.username}
            </Text>
          </View>
        </View>
      </Card>

      <Section title="Ölçüm günü" hint="Haftalık raporun bu gün başlar; tartı ve mezura ölçümünü bu gün yap.">
        <View style={styles.chips}>
          {WEEKDAYS_TR_SHORT.map((label, i) => (
            <Chip key={label} label={label} selected={user.measurementDay === i} onPress={() => update.mutate({ measurementDay: i as Weekday })} testID={`mday-${i}`} />
          ))}
        </View>
      </Section>

      <Section title="Aktivite seviyesi" hint="Günlük enerji ihtiyacını (TDEE) etkiler.">
        <View style={styles.chips}>
          {ACTIVITY_KEYS.map((k) => (
            <Chip key={k} label={ACTIVITY_TR[k]} selected={user.activityLevel === k} onPress={() => update.mutate({ activityLevel: k })} testID={`activity-${k}`} />
          ))}
        </View>
      </Section>

      <Section title="Vücut">
        <Card padded={false} style={styles.listCard}>
          <ListRow
            label="Boy"
            icon="resize-outline"
            right={<Stepper value={user.heightCm ?? 170} min={120} max={230} step={1} size="sm" format={(v) => `${v} cm`} onChange={(v) => update.mutate({ heightCm: v })} testID="height" />}
          />
          <Divider inset={spacing.lg} />
          <ListRow
            label="Cinsiyet"
            icon="male-female-outline"
            right={
              <Segmented<Gender>
                options={[
                  { value: "male", label: "Erkek" },
                  { value: "female", label: "Kadın" },
                ]}
                value={user.gender}
                onChange={(g) => update.mutate({ gender: g })}
                size="sm"
                style={styles.segSmall}
                testID="gender"
              />
            }
          />
          <Divider inset={spacing.lg} />
          <ListRow
            label="Doğum tarihi"
            icon="calendar-outline"
            value={user.birthDate ? fmtDate(user.birthDate, "long") : "Ekle"}
            onPress={() => {
              setBirthDraft(user.birthDate ?? "");
              setBirthError(null);
              openBirth();
            }}
            testID="birth-row"
          />
        </Card>
      </Section>

      <Section title="Uygulama">
        <Card padded={false} style={styles.listCard}>
          <ListRow label="Floo" hint="Maskot mesajlarını göster" icon="happy-outline" right={<Toggle value={user.mascotEnabled} onChange={(v) => update.mutate({ mascotEnabled: v })} accessibilityLabel="Floo maskotu" testID="mascot-toggle" />} />
          <Divider inset={spacing.lg} />
          <View style={styles.themeRow}>
            <ListRow label="Tema" icon="contrast-outline" />
            <Segmented<ThemeMode> options={THEME_OPTIONS} value={mode} onChange={setMode} size="sm" testID="theme" />
          </View>
        </Card>
      </Section>

      <Button
        label="Çıkış yap"
        variant="danger"
        icon="log-out-outline"
        full
        loading={signingOut}
        onPress={async () => {
          setSigningOut(true);
          await signOut();
        }}
        testID="logout"
      />
      <Text variant="caption" color="inkSubtle" align="center">
        FitFloow v{env.appVersion}
        {env.fakeApi ? " · demo modu" : ""}
      </Text>

      <Sheet ref={birthRef} title="Doğum tarihi">
        <TextField label="Tarih" value={birthDraft} onChangeText={setBirthDraft} placeholder="1996-04-12" keyboardType="numbers-and-punctuation" error={birthError} hint="Yaş, bazal metabolizma hesabında kullanılır." testID="birth-input" />
        <SheetActions>
          <Button label="Vazgeç" variant="ghost" onPress={closeBirth} style={styles.flex} />
          <Button label="Kaydet" onPress={saveBirth} style={styles.flex} />
        </SheetActions>
      </Sheet>
    </Screen>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="title">{title}</Text>
      {hint ? (
        <Text variant="caption" color="inkMuted">
          {hint}
        </Text>
      ) : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  avatar: { width: 56, height: 56, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  identityTexts: { flex: 1, gap: 2 },
  section: { gap: spacing.xs },
  sectionBody: { marginTop: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  listCard: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, borderRadius: radii.card },
  segSmall: { width: 150 },
  themeRow: { gap: spacing.sm, paddingBottom: spacing.md },
  flex: { flex: 1 },
});
