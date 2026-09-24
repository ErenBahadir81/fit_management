/**
 * T7 — instant feedback. Every weigh-in or measurement gets one line from Floo ("Plandan 0,6 kg
 * öndesin! 8 yerine 7 haftada bitebilir.") and the numbers for the progress bars, computed from
 * the same progress the roadmap shows. `evaluateGoal` bundles progress + feedback + adjustment so
 * the API (and a client running the engine locally) makes one call after each entry.
 */
import type { GoalAdjustmentProposal, GoalFeedback, GoalProgress, Recalibration } from "../schemas/goal";
import type { Mood } from "../schemas/common";
import type { GoalSettings } from "../schemas/settings";
import { daysBetween } from "../time/index";
import { clamp, round } from "../utils/index";
import type { WeightPoint } from "./ewma";
import { formatTrNumber } from "./milestones";
import { estimateCurrentBody, proposeGoalAdjustment, type AdaptiveGoal, type ReplanBase } from "./adjust";
import { computeGoalProgress, directionOf, trendDeviationAt, type BodyPoint } from "./progress";
import type { DayIntake } from "./recalibrate";

const kg = (v: number) => formatTrNumber(round(Math.abs(v), 1));

export interface FeedbackInput {
  goal: AdaptiveGoal;
  progress: GoalProgress;
  /** Trend minus expected trend today (kg, positive = heavier); null without weigh-ins. */
  deviationKg: number | null;
  /** Latest body entry up to today, for the lean and fat bars. */
  latestBody: BodyPoint | null;
  todayKey: string;
  /** A pending proposal changes the tone: the feedback then points at it. */
  adjustment?: GoalAdjustmentProposal | null;
}

function bars(input: FeedbackInput): GoalFeedback["bars"] {
  const { goal, progress, latestBody, todayKey } = input;
  const direction = directionOf(goal);
  const plan = goal.plan;
  const planDays = Math.max(1, plan.estimatedWeeks * 7);
  const time = clamp(daysBetween(plan.startKey || goal.start.dateKey, todayKey) / planDays, 0, 1) * 100;

  let lean: number | null = null;
  const leanTarget = direction === "cut" ? 0 : (goal.targetLeanGainKg ?? plan.leanGainKg ?? 0);
  if (latestBody && leanTarget > 0.01) {
    const leanNow = latestBody.weightKg * (1 - latestBody.bodyFatPct / 100);
    lean = clamp((leanNow - goal.start.leanMassKg) / leanTarget, 0, 1) * 100;
  }
  let fat: number | null = null;
  const bfSpan = goal.start.bodyFatPct - goal.targetBodyFatPct;
  if (direction !== "bulk" && latestBody && bfSpan > 0.01) {
    fat = clamp((goal.start.bodyFatPct - latestBody.bodyFatPct) / bfSpan, 0, 1) * 100;
  }
  return {
    goal: round(progress.percentComplete, 0),
    time: round(time, 0),
    lean: lean === null ? null : round(lean, 0),
    fat: fat === null ? null : round(fat, 0),
  };
}

export function goalFeedback(input: FeedbackInput): GoalFeedback {
  const { goal, progress, deviationKg, adjustment } = input;
  const direction = directionOf(goal);
  const b = bars(input);
  const weeksSaved =
    progress.weeksRemainingProjected === null ? null : progress.weeksRemainingPlan - progress.weeksRemainingProjected;
  const base = { deviationKg: deviationKg === null ? null : round(deviationKg, 2), weeksSaved, bars: b };
  const say = (status: GoalFeedback["status"], tone: GoalFeedback["tone"], mood: Mood, trigger: string, textTr: string): GoalFeedback => ({
    ...base,
    status,
    tone,
    mood,
    trigger,
    textTr,
  });

  if (adjustment?.kind === "reached") return say("reached", "positive", "proud", "goal.completed", adjustment.messageTr);
  if (progress.actualWeightKg === null) {
    return say("noData", "neutral", "curious", "goal.feedback.noData", "İlk tartını gir, gidişatını birlikte çizelim.");
  }
  const d = deviationKg === null ? "" : kg(deviationKg);
  const pct = `%${formatTrNumber(b.goal)}`;
  const pending = adjustment ? " Sana bir öneri hazırladım." : "";

  switch (progress.onTrack) {
    case "ahead": {
      if (direction === "bulk") {
        return say("ahead", "attention", "think", "goal.feedback.ahead", `Beklenenden ${d} kg hızlı alıyorsun; fazlası yağ olabilir.${pending}`);
      }
      const faster =
        weeksSaved !== null && weeksSaved > 0 && progress.weeksRemainingProjected !== null
          ? ` Bu tempoyla ${progress.weeksRemainingPlan} yerine ${progress.weeksRemainingProjected} haftada bitebilir.`
          : "";
      return say("ahead", "positive", "cheer", "goal.feedback.ahead", `Plandan ${d} kg öndesin!${faster}${pending}`);
    }
    case "behind":
      return direction === "bulk"
        ? say("behind", "attention", "curious", "goal.feedback.behind", `Kilo artışı planın ${d} kg gerisinde; öğünleri biraz büyütelim.${pending}`)
        : say("behind", "attention", "think", "goal.feedback.behind", `Plandan ${d} kg gerideyiz; birkaç gün daha veriyle birlikte düzeltiriz.${pending}`);
    case "stalled":
      return say(
        "stalled",
        "attention",
        "worried",
        "goal.feedback.stalled",
        `İki haftadır trend yerinde sayıyor; biraz sabır, gerekirse kaloriyi ayarlarız.${pending}`
      );
    default:
      return say("onTrack", "positive", "happy", "goal.feedback.onTrack", `Tam planındasın, ${pct} tamamlandı.${pending}`);
  }
}

export interface EvaluateGoalInput {
  goal: AdaptiveGoal;
  weighIns: WeightPoint[];
  bodyEntries: BodyPoint[];
  dayIntake: DayIntake[];
  todayKey: string;
  settings: GoalSettings;
  /** Current state for re-planning previews; without it no adjustment is proposed. */
  replanBase?: ReplanBase | null;
  recalibration?: Recalibration | null;
}

export interface GoalEvaluation {
  progress: GoalProgress;
  feedback: GoalFeedback;
  adjustment: GoalAdjustmentProposal | null;
  /**
   * The state the adjustment options were previewed from (trend weight, lean mass carried
   * forward — see `estimateCurrentBody`). Accepting must re-plan from exactly this. null without
   * a `replanBase`.
   */
  replanBase: ReplanBase | null;
}

/** Progress, Floo's line and any pending adjustment — the one call to make after every entry. */
export function evaluateGoal(input: EvaluateGoalInput): GoalEvaluation {
  const { goal, weighIns, bodyEntries, dayIntake, todayKey, settings } = input;
  const progress = computeGoalProgress(goal, weighIns, bodyEntries, dayIntake, todayKey, settings);
  const replanBase = input.replanBase ? { ...input.replanBase, ...estimateCurrentBody(goal, input.replanBase, progress.actualWeightKg) } : null;
  const adjustment = replanBase
    ? proposeGoalAdjustment({ goal, progress, weighIns, todayKey, replanBase, recalibration: input.recalibration, settings })
    : null;
  const deviationKg = trendDeviationAt(goal, weighIns, todayKey, settings);
  const latestBody =
    bodyEntries
      .filter((b) => b.dateKey <= todayKey)
      .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1))
      .at(-1) ?? null;
  return { progress, adjustment, replanBase, feedback: goalFeedback({ goal, progress, deviationKg, latestBody, todayKey, adjustment }) };
}
