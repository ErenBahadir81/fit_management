import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiClientError } from "@fitfloow/api-client";
import { DEFAULT_GOAL_SETTINGS, bodyComposition, macrosFor, type Weekday } from "@fitfloow/core";
import { getApi } from "../../lib/api";
import { describeError } from "../../lib/errors";
import { todayKey } from "../../lib/dates";
import { haptic } from "../../lib/haptics";
import { useSession } from "../auth/session";
import { gainCalories, maintenanceEnergy } from "../goals/goalIntent";
import { completeOnboarding, register } from "./api";
import { clearDraft, loadDraft, saveDraft } from "./draft";
import { bodyFatFor, emptyDraft, fieldErrors, nextStep, onboardingPayload, prevStep, resumeStep, stepReady, type OnboardingDraft, type OnboardingStep } from "./model";

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

export interface Onboarding {
  step: OnboardingStep;
  draft: OnboardingDraft;
  password: string;
  setPassword: (v: string) => void;
  /** Merge a partial into the draft; the whole draft is written to disk on every change. */
  patch: (fn: (d: OnboardingDraft) => OnboardingDraft) => void;
  /** −1 when the last move was backwards, so the step transition can travel the right way. */
  direction: number;
  errors: ReturnType<typeof fieldErrors>;
  ready: boolean;
  /** Body-fat estimate, the moment it can be computed. */
  bodyFatPct: number | null;
  busy: boolean;
  /** A failed register / commit, in one sentence, with the retry still available. */
  error: string | null;
  back: (() => void) | null;
  next: () => void;
  finish: () => void;
}

/**
 * The first-run flow's state.
 *
 * Everything the user has answered lives in one draft that is written to MMKV on every change, so
 * a crash costs nothing. Two network calls punctuate it: `POST /auth/register` when leaving the
 * account step (which signs them in), and `POST /onboarding` when leaving the goal step, which
 * commits profile, first measurement and goal together.
 */
export function useOnboarding(onDone: () => void): Onboarding {
  const qc = useQueryClient();
  const signedIn = useSession((s) => s.status === "signedIn");
  const signIn = useSession((s) => s.signIn);
  const setUser = useSession((s) => s.setUser);

  const [draft, setDraft] = useState<OnboardingDraft>(() => {
    const restored = loadDraft() ?? emptyDraft();
    return { ...restored, step: resumeStep(restored, useSession.getState().status === "signedIn") };
  });
  const [password, setPassword] = useState("");
  const [direction, setDirection] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const measurementDay = useRef(defaultMeasurementDay()).current;

  const commit = useCallback((updater: (d: OnboardingDraft) => OnboardingDraft) => {
    setDraft((prev) => {
      const next = updater(prev);
      saveDraft(next);
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
      setDirection(dir);
      setError(null);
      commit((d) => ({ ...d, step }));
    },
    [commit]
  );

  const errors = useMemo(() => fieldErrors(draft.step, draft, password), [draft, password]);
  const ready = useMemo(() => stepReady(draft.step, draft, password), [draft, password]);
  const bodyFatPct = useMemo(() => bodyFatFor(draft), [draft]);

  /** Fat loss is a goal; the other two intents only move the daily calorie target. */
  const applyIntentTarget = useCallback(async () => {
    if (draft.goal.intent === "lose" || !draft.profile.gender || !draft.profile.heightCm) return;
    const { weightKg } = draft.measurement;
    if (weightKg === null || bodyFatPct === null) return;
    if (draft.goal.intent === "maintain") {
      // `auto` with no active goal already derives maintenance server-side.
      await getApi().nutrition.setTarget({ mode: "auto" });
      return;
    }
    const energy = maintenanceEnergy({
      sex: draft.profile.gender,
      weightKg,
      bodyFatPct,
      heightCm: draft.profile.heightCm,
      birthDate: draft.profile.birthDate,
      activityLevel: draft.profile.activityLevel ?? "moderate",
      todayKey: todayKey(),
    });
    const calories = gainCalories(energy.maintenance);
    const { leanMassKg } = bodyComposition(weightKg, bodyFatPct);
    const macros = macrosFor({ sex: draft.profile.gender, weightKg, leanMassKg, bodyFatPct, dailyCalories: calories, settings: DEFAULT_GOAL_SETTINGS });
    await getApi().nutrition.setTarget({ mode: "manual", calories: macros.calories, protein: macros.protein, carbs: macros.carbs, fat: macros.fat });
  }, [bodyFatPct, draft]);

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
          goTo("about", 1);
        })
        .catch((e: unknown) => {
          void haptic.error();
          setError(registerMessage(e));
        })
        .finally(() => setBusy(false));
      return;
    }

    if (step === "goal") {
      setBusy(true);
      setError(null);
      completeOnboarding(onboardingPayload(draft, measurementDay))
        .then(async ({ user }) => {
          setUser(user);
          try {
            await applyIntentTarget();
          } catch {
            // A calorie target we could not write is not worth blocking the finish line for; the
            // diet tab lets them set it in two taps and the plan is already saved.
          }
          await qc.invalidateQueries();
          goTo("done", 1);
        })
        .catch((e: unknown) => {
          void haptic.error();
          setError(describeError(e, "Planın kaydedilemedi. Tekrar dene."));
        })
        .finally(() => setBusy(false));
      return;
    }

    goTo(nextStep(step), 1);
  }, [applyIntentTarget, busy, draft, goTo, measurementDay, password, qc, ready, setUser, signIn]);

  const back = useMemo(() => {
    const prev = prevStep(draft.step);
    if (!prev || draft.step === "done") return null;
    // Once the account exists there is nothing to go back to before "about".
    if (signedIn && (prev === "welcome" || prev === "account")) return null;
    return () => goTo(prev, -1);
  }, [draft.step, goTo, signedIn]);

  const finish = useCallback(() => {
    clearDraft();
    onDone();
  }, [onDone]);

  return { step: draft.step, draft, password, setPassword, patch, direction, errors, ready, bodyFatPct, busy, error, back, next, finish };
}
