import React, { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, SlideInLeft, SlideInRight, useReducedMotion } from "react-native-reanimated";
import { useRouter } from "expo-router";
import type { Mood } from "@fitfloow/core";
import { Floo } from "../../mascot/Floo";
import { spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { Pressable } from "../../ui/Pressable";
import { ProgressBar } from "../../ui/ProgressBar";
import { Screen } from "../../ui/Screen";
import { Text } from "../../ui/Text";
import { STEP_ORDER, type OnboardingStep } from "./model";
import { useOnboarding, type Onboarding } from "./useOnboarding";
import { AboutStep } from "./steps/AboutStep";
import { AccountStep } from "./steps/AccountStep";
import { DoneStep } from "./steps/DoneStep";
import { GoalStep } from "./steps/GoalStep";
import { MeasureStep } from "./steps/MeasureStep";
import { WelcomeStep } from "./steps/WelcomeStep";

/** Floo's read on each step, and the words on the button that leaves it. */
const STEP_CHROME: Record<OnboardingStep, { mood: Mood; title: string; body: string; cta: string }> = {
  welcome: { mood: "happy", title: "FitFloow", body: "", cta: "" },
  account: { mood: "happy", title: "Önce bir hesap", body: "Verilerin sadece senin hesabında durur.", cta: "Hesabı oluştur" },
  about: { mood: "think", title: "Seni tanıyalım", body: "Yağ oranı ve günlük kalori hesabı bu dört şeye dayanıyor.", cta: "Ölçüme geç" },
  measure: { mood: "think", title: "İlk ölçümün", body: "Mezura ile üç ölçü; yağ oranını buradan çıkarıyorum.", cta: "Hedefe geç" },
  goal: { mood: "flex", title: "Hedefin", body: "Ne yapmak istediğini seç, gerisini ben hesaplayayım.", cta: "Planı kaydet" },
  done: { mood: "cheer", title: "Hazırız", body: "", cta: "" },
};

/** The visible steps of the rail (welcome and done are not questions). */
const RAIL_STEPS: readonly OnboardingStep[] = STEP_ORDER.filter((s) => s !== "welcome" && s !== "done");

/**
 * The first-run flow.
 *
 * One route, one draft, one step machine: back always works, every answer is on disk the moment it
 * is given, and a crash resumes exactly where it left off. The whole thing commits in a single
 * `POST /onboarding` at the end.
 */
export function OnboardingScreen() {
  const router = useRouter();
  const onDone = useCallback(() => router.replace("/(tabs)"), [router]);
  const o = useOnboarding(onDone);
  const chrome = STEP_CHROME[o.step];
  const reduce = useReducedMotion();
  const entering = reduce ? FadeIn.duration(150) : (o.direction >= 0 ? SlideInRight : SlideInLeft).springify().damping(20).stiffness(180);

  if (o.step === "welcome") {
    return <WelcomeStep onCreate={o.next} onSignIn={() => router.replace("/(auth)/login")} />;
  }
  if (o.step === "done") {
    return <DoneStep draft={o.draft} bodyFatPct={o.bodyFatPct} onFinish={o.finish} />;
  }

  return (
    <Screen keyboard tabBar={false} edges={["top", "bottom"]} contentStyle={styles.content} testID="onboarding">
      <Rail step={o.step} onBack={o.back} />
      <View style={styles.headRow}>
        <Floo mood={chrome.mood} size="s" animate={!reduce} testID="onboarding-floo" />
        <View style={styles.headTexts}>
          <Text variant="display" numberOfLines={2}>
            {chrome.title}
          </Text>
          <Text variant="body" color="inkMuted">
            {chrome.body}
          </Text>
        </View>
      </View>

      <Animated.View key={o.step} entering={entering} style={styles.body}>
        <StepBody o={o} />
      </Animated.View>

      {o.error ? (
        <Text variant="label" tone="danger" accessibilityLiveRegion="assertive" testID="onboarding-error">
          {o.error}
        </Text>
      ) : null}

      <Button label={chrome.cta} onPress={o.next} disabled={!o.ready} loading={o.busy} full size="lg" iconRight="next" testID="onboarding-next" />
    </Screen>
  );
}

function StepBody({ o }: { o: Onboarding }) {
  switch (o.step) {
    case "account":
      return <AccountStep o={o} />;
    case "about":
      return <AboutStep o={o} />;
    case "measure":
      return <MeasureStep o={o} />;
    default:
      return <GoalStep o={o} />;
  }
}

/** Progress + back. Both always visible, so nobody feels trapped in a form. */
function Rail({ step, onBack }: { step: OnboardingStep; onBack: (() => void) | null }) {
  const { colors } = useTheme();
  const index = RAIL_STEPS.indexOf(step) + 1;
  return (
    <View style={styles.rail}>
      <Pressable
        onPress={onBack ?? undefined}
        disabled={!onBack}
        accessibilityLabel="Geri"
        accessibilityRole="button"
        testID="onboarding-back"
        style={[styles.backBtn, { backgroundColor: colors.surfaceMuted, opacity: onBack ? 1 : 0 }]}
      >
        <Icon icon="back" size={20} color="ink" />
      </Pressable>
      <ProgressBar value={index / RAIL_STEPS.length} height={6} style={styles.bar} accessibilityLabel={`Adım ${index} / ${RAIL_STEPS.length}`} testID="onboarding-progress" />
      <Text variant="label" color="inkMuted" tabular testID="onboarding-step-count">
        {index}/{RAIL_STEPS.length}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl },
  rail: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: spacing.touch },
  backBtn: { width: spacing.touch, height: spacing.touch, borderRadius: spacing.touch / 2, alignItems: "center", justifyContent: "center" },
  bar: { flex: 1 },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  headTexts: { flex: 1, gap: spacing.xxs },
  body: { gap: spacing.lg },
});
