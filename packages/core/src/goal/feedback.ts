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
import { bodyFatTrend, computeGoalProgress, directionOf, trendDeviationAt, type BodyFatTrend, type BodyPoint } from "./progress";
import type { DayIntake } from "./recalibrate";

const kg = (v: number) => formatTrNumber(round(Math.abs(v), 1));
/** Body-fat points, formatted like kg (one decimal, Turkish comma). */
const pts = kg;
/** A recomp reading older than this gets an invitation to measure again (a weekly tape habit is enough). */
const MEASURE_NUDGE_DAYS = 7;

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
  /** Recomp: the tape-measurement trend (`bodyFatTrend`). Without it a recomp reads as "not enough data yet". */
  bodyFat?: BodyFatTrend | null;
}

/**
 * Lean mass to gain, counted from the goal start. A bulk states it; otherwise the current plan's
 * end lean mass is used, since `plan.leanGainKg` only counts from the latest re-plan.
 */
function leanGoalKg(goal: AdaptiveGoal): number {
  const direction = directionOf(goal);
  if (direction === "cut") return 0;
  if (direction === "bulk" && goal.targetLeanGainKg != null) return goal.targetLeanGainKg;
  if (goal.plan.targetLeanMassKg !== undefined) return goal.plan.targetLeanMassKg - goal.start.leanMassKg;
  return goal.plan.leanGainKg ?? 0;
}

function bars(input: FeedbackInput): GoalFeedback["bars"] {
  const { goal, progress, latestBody, todayKey } = input;
  const direction = directionOf(goal);
  const plan = goal.plan;
  const planDays = Math.max(1, plan.estimatedWeeks * 7);
  const time = clamp(daysBetween(plan.startKey || goal.start.dateKey, todayKey) / planDays, 0, 1) * 100;

  let lean: number | null = null;
  const leanTarget = leanGoalKg(goal);
  if (latestBody && leanTarget > 0.01) {
    const leanNow = latestBody.weightKg * (1 - latestBody.bodyFatPct / 100);
    lean = clamp((leanNow - goal.start.leanMassKg) / leanTarget, 0, 1) * 100;
  }
  let fat: number | null = null;
  const bfSpan = goal.start.bodyFatPct - goal.targetBodyFatPct;
  if (direction !== "bulk" && latestBody && bfSpan > 0.01) {
    // A recomp's goal *is* its body fat: same (smoothed) figure as the goal bar, never a second one.
    fat = direction === "recomp" ? progress.percentComplete : clamp((goal.start.bodyFatPct - latestBody.bodyFatPct) / bfSpan, 0, 1) * 100;
  }
  return {
    goal: round(progress.percentComplete, 0),
    time: round(time, 0),
    lean: lean === null ? null : round(lean, 0),
    fat: fat === null ? null : round(fat, 0),
  };
}

export function goalFeedback(input: FeedbackInput): GoalFeedback {
  const { goal, progress, deviationKg, adjustment, todayKey } = input;
  const direction = directionOf(goal);
  const b = bars(input);
  const bodyFat = direction === "recomp" ? (input.bodyFat ?? null) : null;
  const weeksSaved =
    progress.weeksRemainingProjected === null ? null : progress.weeksRemainingPlan - progress.weeksRemainingProjected;
  const base = {
    deviationKg: deviationKg === null ? null : round(deviationKg, 2),
    deviationBfPts: bodyFat?.enough ? bodyFat.deviationPts : null,
    weeksSaved,
    bars: b,
  };
  const say = (status: GoalFeedback["status"], tone: GoalFeedback["tone"], mood: Mood, trigger: string, textTr: string): GoalFeedback => ({
    ...base,
    status,
    tone,
    mood,
    trigger,
    textTr,
  });

  if (adjustment?.kind === "reached") return say("reached", "positive", "proud", "goal.completed", adjustment.messageTr);
  // A recomp is read from tape measurements, which carry their own weight: those count as data too.
  const hasTape = direction === "recomp" && (input.latestBody !== null || (bodyFat?.count ?? 0) > 0);
  if (progress.actualWeightKg === null && !hasTape) {
    return say("noData", "neutral", "curious", "goal.feedback.noData", "İlk tartını gir, gidişatını birlikte çizelim.");
  }
  const d = deviationKg === null ? "" : kg(deviationKg);
  const pct = `%${formatTrNumber(b.goal)}`;
  const pending = adjustment ? " Sana bir öneri hazırladım." : "";
  const faster =
    weeksSaved !== null && weeksSaved > 0 && progress.weeksRemainingProjected !== null
      ? ` Bu tempoyla ${progress.weeksRemainingPlan} yerine ${progress.weeksRemainingProjected} haftada bitebilir.`
      : "";

  if (direction === "recomp") {
    // The scale is flat by design: speak in body fat, and until the readings are enough, ask for them.
    if (!bodyFat?.enough) {
      const stale = bodyFat?.latestKey == null || daysBetween(bodyFat.latestKey, todayKey) >= MEASURE_NUDGE_DAYS;
      return say(
        progress.onTrack,
        "neutral",
        "curious",
        "goal.feedback.measure",
        stale
          ? "Rekompta kilo pek değişmez; ilerlemeyi yağ oranın gösterir. Yeni bir mezura ölçümü ekle, gidişatı birlikte izleyelim."
          : "Ölçümün kaydedildi. Rekompta gidişatı okumak için birkaç hafta düzenli ölçüm lazım; haftada bir yeterli."
      );
    }
    const p = pts(bodyFat.deviationPts ?? 0);
    const l = kg(bodyFat.deviationLeanKg ?? 0);
    // Lean-mass advice only without a pending proposal: that one confirms lean loss at the previous
    // reading too and gives the advice itself, so the two never contradict each other.
    const leanLoss = bodyFat.leanLoss && !adjustment;
    switch (progress.onTrack) {
      case "ahead":
        return leanLoss
          ? say("ahead", "attention", "think", "goal.feedback.ahead", `Yağ oranın hızlı düşüyor ama yağsız kütlen planın ${l} kg altında.${pending}`)
          : say("ahead", "positive", "cheer", "goal.feedback.ahead", `Yağ oranında plandan ${p} puan öndesin!${faster}${pending}`);
      case "behind":
      case "stalled": {
        if (!bodyFat.paceSlow) {
          // Past the plan's end without a pace shown to be slow: a fresh plan, not fewer calories.
          return say(progress.onTrack, "attention", "think", `goal.feedback.${progress.onTrack}`, `Planın süresi doldu, hedefe ${pts(progress.bfToGo)} puan kaldı; planı güncelleyip yeni bir tempo çizebiliriz.${pending}`);
        }
        const stalled = progress.onTrack === "stalled";
        const what = stalled ? "Son haftalarda yağ oranın yerinde sayıyor" : `Yağ oranında planın ${p} puan gerisindesin`;
        // Losing lean mass as well: fewer calories would cost more muscle (the proposal keeps them).
        // With a proposal pending, the line states the verdict and points at it; the remedy is the proposal's.
        const next = leanLoss
          ? `, yağsız kütlen de planın ${l} kg altında; kaloriyi kısmadan protein ve antrenmana odaklanalım.`
          : adjustment
            ? "."
            : stalled
              ? "; gerekirse kaloriyi ayarlarız."
              : "; ölçümlerle birlikte izliyoruz.";
        return say(progress.onTrack, "attention", stalled ? "worried" : "think", `goal.feedback.${progress.onTrack}`, `${what}${next}${pending}`);
      }
      default:
        if (leanLoss) {
          return say("onTrack", "attention", "think", "goal.feedback.onTrack", `Yağ oranın planda ama yağsız kütlen planın ${l} kg altında; proteini ve antrenmanı aksatma.${pending}`);
        }
        // Past the plan's end the plan sits at the target, so "on plan" would read wrong while body fat is still above it.
        return bodyFat.planEnded && progress.bfToGo > 0
          ? say("onTrack", "neutral", "curious", "goal.feedback.onTrack", `Planın süresi doldu, hedefe ${pts(progress.bfToGo)} puan kaldı; ölçmeye devam, gidişatı birlikte izleyelim.${pending}`)
          : say("onTrack", "positive", "happy", "goal.feedback.onTrack", `Yağ oranın planda, ${pct} tamamlandı.${pending}`);
    }
  }

  switch (progress.onTrack) {
    case "ahead": {
      if (direction === "bulk") {
        return say("ahead", "attention", "think", "goal.feedback.ahead", `Beklenenden ${d} kg hızlı alıyorsun; fazlası yağ olabilir.${pending}`);
      }
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
  // Computed once, so progress, the proposal and Floo's line read the very same verdict.
  const bodyFat = directionOf(goal) === "recomp" ? bodyFatTrend(goal, bodyEntries, todayKey, settings) : null;
  const progress = computeGoalProgress(goal, weighIns, bodyEntries, dayIntake, todayKey, settings, bodyFat);
  let replanBase: ReplanBase | null = null;
  if (input.replanBase) {
    // A recomp with enough readings re-plans from the fitted body fat, not from one noisy tape reading.
    const measured =
      bodyFat?.enough && bodyFat.bodyFatPct !== null && bodyFat.latestWeightKg !== null
        ? { weightKg: bodyFat.latestWeightKg, bodyFatPct: bodyFat.bodyFatPct }
        : input.replanBase;
    replanBase = { ...input.replanBase, ...estimateCurrentBody(goal, measured, progress.actualWeightKg) };
  }
  const adjustment = replanBase
    ? proposeGoalAdjustment({ goal, progress, weighIns, bodyEntries, bodyFat, todayKey, replanBase, recalibration: input.recalibration, settings })
    : null;
  const deviationKg = trendDeviationAt(goal, weighIns, todayKey, settings);
  const latestBody =
    bodyEntries
      .filter((b) => b.dateKey <= todayKey)
      .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1))
      .at(-1) ?? null;
  return { progress, adjustment, replanBase, feedback: goalFeedback({ goal, progress, deviationKg, latestBody, todayKey, adjustment, bodyFat }) };
}
