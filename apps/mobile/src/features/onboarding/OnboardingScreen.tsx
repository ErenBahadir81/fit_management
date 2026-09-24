import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, SlideInLeft, SlideInRight, useReducedMotion } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { spacing } from "../../theme/tokens";
import { Button } from "../../ui/Button";
import { Screen } from "../../ui/Screen";
import { Text } from "../../ui/Text";
import { BodyFatRing } from "./components/BodyFatRing";
import { FlooStage } from "./components/FlooStage";
import { SessionProgress } from "./components/SessionProgress";
import { goalCue, measureReaction, stepCue, type PointTarget } from "./floo";
import { measuredCount, measurementFields, type MeasurementField, type OnboardingStep } from "./model";
import { useFlooDirector, type DirectedCue } from "./useFlooDirector";
import { useOnboarding, type Onboarding } from "./useOnboarding";
import { AccountStep } from "./steps/AccountStep";
import { AssessmentStep } from "./steps/AssessmentStep";
import { BodyStep } from "./steps/BodyStep";
import { DoneStep } from "./steps/DoneStep";
import { GoalStep } from "./steps/GoalStep";
import { HelloStep } from "./steps/HelloStep";
import { MeasureStep } from "./steps/MeasureStep";
import { TrainingStep } from "./steps/TrainingStep";
import { WelcomeStep } from "./steps/WelcomeStep";

/** The words on the button that leaves each step. */
const CTA: Record<Exclude<OnboardingStep, "welcome">, string> = {
  hello: "Devam",
  account: "Hesabı oluştur",
  body: "Devam",
  measure: "Devam",
  training: "Devam",
  assessment: "Hedefime bakalım",
  goal: "Bu planla başla",
  done: "Ana sayfaya geç",
};

/** How long after the last slider / direction change Floo answers (one line per decision, not per tick). */
const GOAL_REACT_MS = 250;

/**
 * The first-run session.
 *
 * One route, one draft, one step machine; Floo asks each question, walks on to the next one and
 * reacts to each answer. Back always works, every answer is on disk the moment it is given, and a
 * crash resumes exactly where it left off. The whole thing commits in a single `POST /onboarding`
 * when the goal is accepted.
 */
export function OnboardingScreen() {
  const router = useRouter();
  const onDone = useCallback(() => router.replace("/(tabs)"), [router]);
  const o = useOnboarding(onDone);

  if (o.step === "welcome") {
    return <WelcomeStep onCreate={o.next} onSignIn={() => router.replace("/(auth)/login")} />;
  }
  return <Session o={o} />;
}

function Session({ o }: { o: Onboarding }) {
  const reduce = useReducedMotion();
  const flooRef = useRef<View>(null);
  const targets = useRef<Partial<Record<PointTarget, View | null>>>({});
  const latest = useRef(o);
  useLayoutEffect(() => {
    latest.current = o;
  });

  // Floo walks in from off-stage on the first question he asks, then walks on with each step.
  const [cue, setCue] = useState<DirectedCue>(() => ({ ...stepCue(o.step, o.draft), key: 1, walk: "enter" }));
  const play = useCallback((next: Omit<DirectedCue, "key">) => setCue((prev) => ({ ...next, key: prev.key + 1 })), []);
  const director = useFlooDirector(cue, reduce, flooRef, targets);

  // A new step is a new cue (Floo walks on in the direction of travel); a new failure is a shrug,
  // the sentence itself sitting by the button. Both adjust state while rendering, React's pattern
  // for "state that follows a prop", so there is no extra paint with the old line.
  const [shownStep, setShownStep] = useState(o.step);
  const [shownError, setShownError] = useState(o.error);
  if (shownStep !== o.step) {
    setShownStep(o.step);
    play({ ...stepCue(o.step, o.draft), walk: o.direction >= 0 ? 1 : -1 });
  } else if (shownError !== o.error) {
    setShownError(o.error);
    if (o.error) play({ mood: "worried", gesture: "shrug", say: "Hmm, bu olmadı. Aşağıda nedenini yazdım; bir daha deneyelim.", walk: 0 });
  }

  const onMeasured = useCallback(
    (field: MeasurementField) => {
      const r = measureReaction(field, latest.current.draft);
      if (r) play({ ...r, walk: 0 });
    },
    [play]
  );

  const goalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (goalTimer.current && clearTimeout(goalTimer.current)), []);
  const onGoalSettled = useCallback(() => {
    if (goalTimer.current) clearTimeout(goalTimer.current);
    goalTimer.current = setTimeout(() => {
      const cur = latest.current;
      if (!cur.assessment || !cur.choice) return;
      play({ ...goalCue(cur.choice, cur.assessment, cur.plans?.[cur.draft.goal.profile] ?? null), walk: 0 });
    }, GOAL_REACT_MS);
  }, [play]);

  const entering = reduce ? FadeIn.duration(150) : (o.direction >= 0 ? SlideInRight : SlideInLeft).springify().damping(22).stiffness(190);
  const done = o.step === "done";
  const gender = o.draft.profile.gender;
  const side =
    o.step === "measure" ? (
      <BodyFatRing
        ref={(v) => {
          targets.current.ring = v;
        }}
        filled={measuredCount(o.draft)}
        total={measurementFields(gender).length}
        bodyFatPct={o.bodyFatPct}
        gender={gender}
      />
    ) : null;

  return (
    <Screen keyboard tabBar={false} edges={["top", "bottom"]} contentStyle={styles.content} testID="onboarding">
      <SessionProgress stage={o.stage} onBack={o.back} />
      <FlooStage ref={flooRef} mood={cue.mood} say={cue.say} director={director} side={side} />

      <Animated.View key={o.step} entering={entering} style={styles.body} testID={`onboarding-step-${o.step}`}>
        <StepBody
          o={o}
          onMeasured={onMeasured}
          onGoalSettled={onGoalSettled}
          targetRef={(t) => (v: View | null) => {
            targets.current[t] = v;
          }}
        />
      </Animated.View>

      <View style={styles.footer}>
        {o.error ? (
          <Text variant="label" tone="danger" accessibilityLiveRegion="assertive" testID="onboarding-error">
            {o.error}
          </Text>
        ) : null}
        <Button
          label={CTA[o.step as Exclude<OnboardingStep, "welcome">]}
          onPress={done ? o.finish : o.next}
          disabled={!done && !o.ready}
          loading={o.busy}
          full
          size="lg"
          iconRight="next"
          testID={done ? "done-start" : "onboarding-next"}
        />
      </View>
    </Screen>
  );
}

function StepBody({
  o,
  onMeasured,
  onGoalSettled,
  targetRef,
}: {
  o: Onboarding;
  onMeasured: (f: MeasurementField) => void;
  onGoalSettled: () => void;
  targetRef: (t: PointTarget) => (v: View | null) => void;
}) {
  switch (o.step) {
    case "hello":
      return <HelloStep o={o} />;
    case "account":
      return <AccountStep o={o} />;
    case "body":
      return <BodyStep o={o} />;
    case "measure":
      return <MeasureStep o={o} onMeasured={onMeasured} />;
    case "training":
      return <TrainingStep o={o} />;
    case "assessment":
      return <AssessmentStep ref={targetRef("card")} assessment={o.assessment} />;
    case "goal":
      return <GoalStep ref={targetRef("slider")} o={o} onSettled={onGoalSettled} />;
    case "done":
      return <DoneStep draft={o.draft} bodyFatPct={o.bodyFatPct} result={o.result} />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: spacing.lg, paddingBottom: spacing.xl },
  body: { gap: spacing.lg },
  footer: { marginTop: "auto", gap: spacing.sm, paddingTop: spacing.sm },
});
