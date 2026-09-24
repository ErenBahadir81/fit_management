import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiClientError } from "@fitfloow/api-client";
import type { BodyAssessment, GoalDTO, GoalDirection, ProgramDTO, UserDTO, Weekday } from "@fitfloow/core";
import { getApi } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { todayKey } from "../../lib/dates";
import { haptic } from "../../lib/haptics";
import { useSession } from "../auth/session";
import { completeOnboarding, register } from "./api";
import { clearDraft, loadDraft, saveDraft } from "./draft";
import { bodyFatFor, emptyDraft, fieldErrors, nextStep, onboardingPayload, prevStep, resumeStep, stageOf, stepReady, type GoalChoice, type OnboardingDraft, type OnboardingStep } from "./model";
import { assessmentFor, plansByPace, recommendedChoice, resolvedGoal, setChoiceTarget, switchDirection, type PlansByPace } from "./plan";

/** The measurement day a new account starts on: today's weekday, so the first week lines up. */
function defaultMeasurementDay(): Weekday {
  const [y, m, d] = todayKey().split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday) ?? 0;
}

function registerMessage(e: unknown): string {
  if (e instanceof ApiClientError) {
    if (e.status === 409) return "Bu kullanıcı adı alınmış. Başka bir tane dene.";
    if (e.status === 429) return "Çok fazla deneme. Biraz bekleyip tekrar dene.";
  }
  return describeError(e, "Hesap oluşturulamadı. Tekrar dene.");
}

/** What `POST /onboarding` set up, for the finish screen. Lives in memory only. */
export interface OnboardingResult {
  user: UserDTO;
  goal: GoalDTO | null;
  program: ProgramDTO | null;
}

export interface Onboarding {
  step: OnboardingStep;
  /** 0 on the welcome door, 1…7 on the progress bar. */
  stage: number;
  draft: OnboardingDraft;
  password: string;
  setPassword: (v: string) => void;
  /** Apply a change to the draft; the whole draft is written to disk on every change. */
  patch: (fn: (d: OnboardingDraft) => OnboardingDraft) => void;
  /** −1 when the last move was backwards, so Floo and the content travel the right way. */
  direction: number;
  errors: ReturnType<typeof fieldErrors>;
  ready: boolean;
  /** Body-fat estimate, the moment it can be computed. */
  bodyFatPct: number | null;
  /** "Where you are now" (core `assessBody`), once the measurements are in. */
  assessment: BodyAssessment | null;
  /** The goal on screen: the user's pick, else Floo's recommendation. */
  choice: GoalChoice | null;
  recommended: GoalChoice | null;
  plans: PlansByPace | null;
  setDirection: (d: GoalDirection) => void;
  setTarget: (v: number) => void;
  /** Back to exactly what Floo suggested. */
  resetToRecommendation: () => void;
  busy: boolean;
  /** A failed register / commit, in one sentence, with the retry still available. */
  error: string | null;
  result: OnboardingResult | null;
  back: (() => void) | null;
  next: () => void;
  /** Commit without a goal ("şimdilik hedefsiz"). */
  skipGoal: () => void;
  finish: () => void;
}

/**
 * The first-run session's state.
 *
 * Everything the user has answered lives in one draft that is written to MMKV on every change, so
 * a crash costs nothing. Two network calls punctuate it: `POST /auth/register` when leaving the
 * account step (which signs them in), and `POST /onboarding` when the goal is accepted (or
 * skipped), which commits profile, first measurement, goal and starter program together.
 */
export function useOnboarding(onDone: () => void): Onboarding {
  const qc = useQueryClient();
  const signedIn = useSession((s) => s.status === "signedIn");
  const signIn = useSession((s) => s.signIn);
  const setUser = useSession((s) => s.setUser);

  // The step a restored draft had reached, kept for after the account exists again.
  const [restored] = useState<OnboardingDraft>(() => loadDraft() ?? emptyDraft());
  const [draft, setDraft] = useState<OnboardingDraft>(() => ({ ...restored, step: resumeStep(restored, useSession.getState().status === "signedIn") }));
  const [password, setPassword] = useState("");
  const [direction, setNavDirection] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [measurementDay] = useState(defaultMeasurementDay);
  const [today] = useState(todayKey);

  const commit = useCallback((updater: (d: OnboardingDraft) => OnboardingDraft) => {
    setDraft((prev) => {
      const next = updater(prev);
      // Once committed, the server holds every answer: nothing is left to resume.
      if (next.step === "done") clearDraft();
      else saveDraft(next);
      return next;
    });
  }, []);

  const patch = useCallback(
    (fn: (d: OnboardingDraft) => OnboardingDraft) => {
      setError(null);
      commit(fn);
    },
    [commit]
  );

  const goTo = useCallback(
    (step: OnboardingStep, dir: number) => {
      setNavDirection(dir);
      setError(null);
      commit((d) => ({ ...d, step }));
    },
    [commit]
  );

  const errors = useMemo(() => fieldErrors(draft.step, draft, password), [draft, password]);
  const ready = useMemo(() => stepReady(draft.step, draft, password), [draft, password]);
  const bodyFatPct = useMemo(() => bodyFatFor(draft), [draft]);
  // Keyed on the parts the assessment reads (patches keep untouched parts' identity), so typing a
  // name or a password does not re-run the engine.
  const { profile, measurement, training, goal } = draft;
  const assessment = useMemo(() => assessmentFor({ ...emptyDraft(), profile, measurement, training }), [profile, measurement, training]);
  const recommended = useMemo(() => (assessment ? recommendedChoice(assessment) : null), [assessment]);
  const choice = useMemo(() => (assessment ? resolvedGoal({ ...emptyDraft(), profile, measurement, training, goal }) : null), [assessment, profile, measurement, training, goal]);
  // Three engine runs; only the goal step shows them.
  const onGoal = draft.step === "goal";
  const plans = useMemo(
    () => (onGoal && choice ? plansByPace({ ...emptyDraft(), profile, measurement, training, goal }, choice, today) : null),
    [onGoal, choice, profile, measurement, training, goal, today]
  );

  const putChoice = useCallback(
    (c: GoalChoice) => patch((d) => ({ ...d, goal: { ...d.goal, direction: c.direction, targetBodyFatPct: c.targetBodyFatPct, targetLeanGainKg: c.targetLeanGainKg, skipped: false } })),
    [patch]
  );
  const setGoalDirection = useCallback(
    (dir: GoalDirection) => {
      if (!assessment || !choice) return;
      putChoice(switchDirection(choice, dir, assessment));
    },
    [assessment, choice, putChoice]
  );
  const setTarget = useCallback(
    (v: number) => {
      if (!assessment || !choice) return;
      putChoice(setChoiceTarget(choice, v, assessment));
    },
    [assessment, choice, putChoice]
  );
  const resetToRecommendation = useCallback(() => {
    if (recommended) putChoice(recommended);
  }, [putChoice, recommended]);

  const commitSession = useCallback(
    (d: OnboardingDraft) => {
      setBusy(true);
      setError(null);
      completeOnboarding(onboardingPayload(d, measurementDay))
        .then(async ({ user, goal, program }) => {
          // The session learns the account is set up only on "Ana sayfaya geç": the route guard
          // would otherwise swap the finish screen for the tabs before anyone saw it.
          if (!goal) {
            // No goal: make sure the diet tab follows maintenance. Not worth blocking the finish for.
            await getApi()
              .nutrition.setTarget({ mode: "auto" })
              .catch(() => undefined);
          }
          setResult({ user, goal, program: program ?? null });
          void haptic.success();
          await qc.invalidateQueries();
          goTo("done", 1);
        })
        .catch((e: unknown) => {
          void haptic.error();
          setError(describeError(e, "Planın kaydedilemedi. Tekrar dene."));
        })
        .finally(() => setBusy(false));
    },
    [goTo, measurementDay, qc]
  );

  const next = useCallback(() => {
    if (busy || !ready) return;
    const step = draft.step;

    if (step === "account") {
      setBusy(true);
      setError(null);
      register({ username: draft.account.username.trim().toLowerCase(), password, displayName: draft.account.displayName.trim() })
        .then((res) => {
          setPassword(""); // done with it — it never needs to exist again
          signIn(res.user);
          void haptic.success();
          // Normally "body"; a draft that already got further (the account was lost, say, to a
          // reload in demo mode) picks up at its first unanswered question instead.
          goTo(resumeStep({ ...draft, step: restored.step }, true), 1);
        })
        .catch((e: unknown) => {
          void haptic.error();
          setError(registerMessage(e));
        })
        .finally(() => setBusy(false));
      return;
    }

    if (step === "goal") {
      commitSession(draft.goal.skipped ? draft : { ...draft, goal: { ...draft.goal, skipped: false } });
      return;
    }

    goTo(nextStep(step), 1);
  }, [busy, commitSession, draft, goTo, password, ready, restored.step, signIn]);

  const skipGoal = useCallback(() => {
    if (busy || draft.step !== "goal") return;
    const skipped = { ...draft, goal: { ...draft.goal, skipped: true } };
    commit(() => skipped);
    commitSession(skipped);
  }, [busy, commit, commitSession, draft]);

  const back = useMemo(() => {
    const prev = prevStep(draft.step);
    if (!prev || draft.step === "done" || busy) return null;
    // Once the account exists there is nothing to go back to before "body".
    if (signedIn && (prev === "welcome" || prev === "hello" || prev === "account")) return null;
    return () => goTo(prev, -1);
  }, [busy, draft.step, goTo, signedIn]);

  const finish = useCallback(() => {
    clearDraft();
    if (result) setUser(result.user);
    onDone();
  }, [onDone, result, setUser]);

  return {
    step: draft.step,
    stage: stageOf(draft.step),
    draft,
    password,
    setPassword,
    patch,
    direction,
    errors,
    ready,
    bodyFatPct,
    assessment,
    choice,
    recommended,
    plans,
    setDirection: setGoalDirection,
    setTarget,
    resetToRecommendation,
    busy,
    error,
    result,
    back,
    next,
    skipGoal,
    finish,
  };
}
