/**
 * T7 — the adaptive goal. On every data entry the API asks "does the plan still fit?"; when the
 * answer has been "no" for long enough, Floo proposes a concrete change the user accepts with
 * one tap. Nothing here changes a goal: it only builds the proposal, each option previewed with
 * the real engine, and the API re-runs that preview when the user accepts.
 *
 * When a proposal is made (docs/plan/11-muscle-gain-engine.md §Adaptive goal):
 *  - reached: the trend (cut/bulk) or the latest body fat (recomp) is at the target → "complete".
 *  - otherwise only after `adaptive.cooldownDays` since the plan (re)started or the last answer,
 *    so the first weeks (water, glycogen) and a fresh re-plan are never second-guessed.
 *  - cut: trend is ≥ `toleranceKg` ahead of / behind the plan today AND `sustainDays` ago; or the
 *    trend is stalled for two weeks.
 *  - bulk: the observed 4-week gain rate is above `bulkFastRatio` × plan (extra is fat) or below
 *    `bulkSlowRatio` × plan (kg deviations are too small on a bulk to be read reliably).
 *  - recomp: never from weight. The body-fat trend of the tape measurements (`bodyFatTrend`) is
 *    ahead / behind / stalled against the plan — or lean mass is falling — and the same verdict
 *    already held at the previous measurement.
 */
import { MIN_SAFE_BODY_FAT } from "../navy/index";
import type {
  GoalAdjustment,
  GoalAdjustmentAction,
  GoalAdjustmentKind,
  GoalAdjustmentOption,
  GoalAdjustmentProposal,
  GoalDirection,
  GoalPlan,
  GoalPlanSnapshot,
  GoalProgress,
  Recalibration,
  TrainingLevel,
} from "../schemas/goal";
import type { GoalProfile, Mood } from "../schemas/common";
import type { GoalSettings } from "../schemas/settings";
import { daysBetween, shiftKey } from "../time/index";
import { clamp, hash32, round } from "../utils/index";
import { ewmaSlopePerWeek, ewmaTrend, type WeightPoint } from "./ewma";
import { formatTrNumber } from "./milestones";
import { computeGoalPlan, type GoalEngineInput } from "./plan";
import {
  bodyFatTrend,
  smoothedBodyFat,
  directionOf,
  roadmapWeekAt,
  tdeeAtDay,
  trendDeviationAt,
  weightSign,
  type BodyFatTrend,
  type BodyPoint,
  type GoalLike,
} from "./progress";

/** The goal fields the adaptive logic reads (a `GoalDTO` satisfies it). */
export type AdaptiveGoal = GoalLike & {
  id: string;
  direction?: GoalDirection;
  targetLeanGainKg?: number | null;
  trainingLevel?: TrainingLevel | null;
  profile: GoalProfile;
  tdeeOverride: number | null;
  adjustments?: GoalAdjustment[];
};

/** Everything needed to re-plan from the person's current state, minus what the goal decides. */
export type ReplanBase = Omit<
  GoalEngineInput,
  "startDate" | "direction" | "targetBodyFatPct" | "targetLeanGainKg" | "tdeeOverride" | "profile" | "trainingLevel"
>;

export interface AdjustmentInput {
  goal: AdaptiveGoal;
  progress: GoalProgress;
  weighIns: WeightPoint[];
  /** Tape measurements. A recomp is judged on these alone (besides "reached"); without them it proposes nothing. */
  bodyEntries?: BodyPoint[];
  /** Recomp: `bodyFatTrend` of those measurements for `todayKey`, when the caller already has it. */
  bodyFat?: BodyFatTrend | null;
  todayKey: string;
  replanBase: ReplanBase;
  /** Result of `recalibrateTdee` for today, when available: its measured TDEE sizes calorie changes. */
  recalibration?: Recalibration | null;
  settings: GoalSettings;
}

/**
 * What an option changes, applied on top of the goal's current parameters. `targetLeanGainKg` is,
 * like on the goal, the total lean gain counted from the goal's start.
 */
export interface GoalChange {
  tdeeOverride?: number | null;
  targetBodyFatPct?: number;
  targetLeanGainKg?: number;
}

export function planSnapshot(plan: GoalPlan, goal: Pick<AdaptiveGoal, "targetBodyFatPct" | "targetLeanGainKg">): GoalPlanSnapshot {
  return {
    dailyCalorieTarget: plan.initialDailyCalorieTarget,
    estimatedWeeks: plan.estimatedWeeks,
    targetDate: plan.targetDate,
    targetWeightKg: plan.targetWeightKg,
    targetBodyFatPct: goal.targetBodyFatPct,
    targetLeanGainKg: goal.targetLeanGainKg ?? null,
  };
}

/** Snapshot of the plan as it stands *today* (the current roadmap week's calories, weeks left). */
function currentSnapshot(goal: AdaptiveGoal, todayKey: string): GoalPlanSnapshot {
  const plan = goal.plan;
  const offset = Math.max(0, daysBetween(plan.startKey || goal.start.dateKey, todayKey));
  const week = roadmapWeekAt(plan.roadmap, offset);
  return {
    ...planSnapshot(plan, goal),
    dailyCalorieTarget: week?.dailyCalorieTarget ?? plan.initialDailyCalorieTarget,
    estimatedWeeks: Math.max(0, plan.roadmap.length - Math.floor(offset / 7)),
  };
}

/**
 * Re-plan the goal from today with `change` applied. The API calls this on accept, so what the
 * user previewed is exactly what gets stored.
 */
export function replanGoal(goal: AdaptiveGoal, change: GoalChange, replanBase: ReplanBase, todayKey: string): GoalPlan {
  const direction = directionOf(goal);
  return computeGoalPlan({
    ...replanBase,
    direction,
    targetBodyFatPct: change.targetBodyFatPct ?? goal.targetBodyFatPct,
    targetLeanGainKg: direction === "bulk" ? remainingLeanGain({ ...goal, targetLeanGainKg: change.targetLeanGainKg ?? goal.targetLeanGainKg }, replanBase) : null,
    trainingLevel: goal.trainingLevel ?? goal.plan.trainingLevel ?? null,
    profile: goal.profile,
    tdeeOverride: change.tdeeOverride === undefined ? goal.tdeeOverride : change.tdeeOverride,
    startDate: todayKey,
  });
}

/** Bulk re-plans aim at the lean mass the goal set out to reach, from wherever the person is now. */
export function remainingLeanGain(goal: AdaptiveGoal, now: Pick<ReplanBase, "weightKg" | "bodyFatPct">): number {
  const targetLean = goal.start.leanMassKg + (goal.targetLeanGainKg ?? goal.plan.leanGainKg ?? 0);
  const leanNow = now.weightKg * (1 - now.bodyFatPct / 100);
  return round(Math.max(0.25, targetLean - leanNow), 2);
}

/**
 * The body to re-plan from. The last tape measurement can be weeks old while weigh-ins are daily,
 * so the weight is the EWMA trend and the lean mass is carried forward from the measurement using
 * the plan's own partitioning (lean kg per kg of weight change over the roadmap). Without a trend
 * the measurement is used as-is.
 */
export function estimateCurrentBody(
  goal: Pick<AdaptiveGoal, "plan">,
  measured: { weightKg: number; bodyFatPct: number },
  trendWeightKg: number | null
): { weightKg: number; bodyFatPct: number } {
  if (trendWeightKg === null || !(trendWeightKg > 0)) return { weightKg: measured.weightKg, bodyFatPct: measured.bodyFatPct };
  const first = goal.plan.roadmap[0];
  const last = goal.plan.roadmap.at(-1);
  let leanPerKg = 0;
  if (first && last && first.startLeanMassKg !== undefined && last.endLeanMassKg !== undefined) {
    const dw = last.endWeightKg - first.startWeightKg;
    if (Math.abs(dw) >= 0.5) leanPerKg = clamp((last.endLeanMassKg - first.startLeanMassKg) / dw, -1, 1);
  }
  const leanMeasured = measured.weightKg * (1 - measured.bodyFatPct / 100);
  const lean = Math.min(trendWeightKg * 0.97, leanMeasured + leanPerKg * (trendWeightKg - measured.weightKg));
  return { weightKg: round(trendWeightKg, 2), bodyFatPct: round(clamp((1 - lean / trendWeightKg) * 100, 2, 70), 2) };
}

/** Deterministic proposal id: stable until the plan changes or the user answers. */
export function adjustmentId(goal: AdaptiveGoal, kind: GoalAdjustmentKind, sinceKey: string): string {
  return `adj_${hash32(`${goal.id}|${kind}|${goal.plan.startKey}|${sinceKey}`).toString(36)}`;
}

/** Latest of: goal start, plan (re)start, last answered proposal. */
export function adjustmentSinceKey(goal: AdaptiveGoal): string {
  let since = goal.start.dateKey;
  if (goal.plan.startKey && goal.plan.startKey > since) since = goal.plan.startKey;
  for (const a of goal.adjustments ?? []) if (a.dateKey > since) since = a.dateKey;
  return since;
}

const kg = (v: number) => formatTrNumber(round(Math.abs(v), 1));
/** Body-fat points, formatted like kg (one decimal, Turkish comma). */
const pts = kg;
const cap = (s: string) => s.charAt(0).toLocaleUpperCase("tr") + s.slice(1);

interface Situation {
  kind: GoalAdjustmentKind;
  deviationKg: number;
  /** Recomp: the body-fat trend the verdict came from. */
  bodyFat?: BodyFatTrend;
  /** Recomp: lean mass is falling below the plan (held at the previous measurement too). */
  leanLoss?: boolean;
}

const behindLike = (s: BodyFatTrend["status"]) => s === "behind" || s === "stalled";

/**
 * Recomp target reached: the latest reading is at the target and so is the smoothed body fat
 * (`smoothedBodyFat`: ≥ 3 weeks of readings, not reset by a re-plan) — one low tape reading
 * (±1.5 points) is not the finish line. A plan with nothing to do (target not below the start) is
 * reached on the reading alone.
 */
function recompReached(input: AdjustmentInput): boolean {
  const { goal, progress, todayKey, settings } = input;
  if (progress.actualBodyFatPct === null || progress.actualBodyFatPct > goal.targetBodyFatPct) return false;
  if (goal.plan.roadmap.length === 0) return true;
  const smoothed = input.bodyFat ? input.bodyFat.smoothedPct : smoothedBodyFat(goal, input.bodyEntries ?? [], todayKey, settings);
  return smoothed !== null && smoothed <= goal.targetBodyFatPct;
}

/**
 * Recomp: the body-fat verdict, only when it already held at the previous measurement — a single
 * slipped tape reading must not decide (the cut's "today and a week ago" rule, per measurement) —
 * and only on a reading taken after the last answer, so a dismissed proposal is never re-made from
 * the same evidence.
 */
function recompSituation(input: AdjustmentInput, deviationKg: number, sinceKey: string): Situation | null {
  const { goal, todayKey, settings } = input;
  const entries = input.bodyEntries ?? [];
  const now = input.bodyFat ?? bodyFatTrend(goal, entries, todayKey, settings);
  if (!now.enough || now.previousKey === null || now.latestKey === null || now.latestKey <= sinceKey) return null;
  const prev = bodyFatTrend(goal, entries, now.previousKey, settings);
  if (!prev.enough) return null;
  const leanLoss = now.leanLoss && prev.leanLoss;
  let kind: GoalAdjustmentKind | null = null;
  if (now.status === "ahead" && prev.status === "ahead") kind = "ahead";
  else if (behindLike(now.status) && behindLike(prev.status)) kind = now.status === "stalled" ? "stalled" : "behind";
  // Fat on plan (or ahead) while lean mass falls: the deficit is too big for the muscle.
  else if (leanLoss && (now.status === "onTrack" || now.status === "ahead")) kind = "ahead";
  return kind ? { kind, deviationKg, bodyFat: now, leanLoss } : null;
}

function situation(input: AdjustmentInput, direction: GoalDirection, sinceKey: string): Situation | null {
  const { goal, progress, weighIns, todayKey, settings } = input;
  const a = settings.adaptive;
  const sign = weightSign(direction);
  const dev = trendDeviationAt(goal, weighIns, todayKey, settings);
  const deviationKg = dev === null ? 0 : round(dev, 2);

  /* reached — never held back by the cool-down */
  if (direction === "recomp") {
    if (recompReached(input)) return { kind: "reached", deviationKg };
  } else if (progress.actualWeightKg !== null && progress.kgToGo <= 0.1 && goal.plan.roadmap.length > 0) {
    return { kind: "reached", deviationKg };
  }

  if (daysBetween(sinceKey, todayKey) < a.cooldownDays) return null;
  // Weight is flat on a recomp by design: only body fat and lean mass count, never the scale.
  if (direction === "recomp") return recompSituation(input, deviationKg, sinceKey);
  if (dev === null) return null;

  if (direction === "bulk") {
    const trend = ewmaTrend(
      weighIns.filter((p) => p.dateKey <= todayKey),
      settings.ewma
    );
    const slope = ewmaSlopePerWeek(trend, todayKey, 28);
    const offset = Math.max(0, daysBetween(goal.plan.startKey || goal.start.dateKey, todayKey));
    const planned = roadmapWeekAt(goal.plan.roadmap, offset)?.rateKgPerWeek ?? goal.plan.initialRateKgPerWeek;
    if (slope === null || planned <= 0) return null;
    if (slope > a.bulkFastRatio * planned) return { kind: "ahead", deviationKg };
    if (slope <= 0.02) return { kind: "stalled", deviationKg };
    if (slope < a.bulkSlowRatio * planned) return { kind: "behind", deviationKg };
    return null;
  }

  if (progress.onTrack === "stalled") return { kind: "stalled", deviationKg };
  const past = trendDeviationAt(goal, weighIns, shiftKey(todayKey, -a.sustainDays), settings);
  if (past === null) return null;
  const aheadNow = sign * dev;
  const aheadPast = sign * past;
  if (aheadNow >= a.toleranceKg && aheadPast >= a.toleranceKg) return { kind: "ahead", deviationKg };
  if (aheadNow <= -a.toleranceKg && aheadPast <= -a.toleranceKg) return { kind: "behind", deviationKg };
  return null;
}

/** The maintenance the plan assumes this week, ± a step; a measured TDEE wins when it points the same way. */
function tdeeStep(input: AdjustmentInput, dir: 1 | -1): { tdee: number; measured: boolean } {
  const { goal, todayKey, recalibration, settings } = input;
  const offset = Math.max(0, daysBetween(goal.plan.startKey || goal.start.dateKey, todayKey));
  const current = tdeeAtDay(goal, offset);
  const measured = recalibration?.applied ? recalibration.tdeeUsed : null;
  if (measured !== null && dir * (measured - current) >= 50) return { tdee: round(measured, 0), measured: true };
  return { tdee: round(current + dir * settings.adaptive.kcalStep, 0), measured: false };
}

interface Copy {
  mood: Mood;
  trigger: string;
  titleTr: string;
  messageTr: string;
}

function option(
  input: AdjustmentInput,
  action: GoalAdjustmentAction,
  labelTr: string,
  recommended: boolean,
  change: GoalChange
): GoalAdjustmentOption {
  if (action === "complete") return { action, labelTr, recommended, after: null, change: {} };
  const plan = replanGoal(input.goal, change, input.replanBase, input.todayKey);
  const after = planSnapshot(plan, {
    targetBodyFatPct: plan.direction === "bulk" ? (plan.roadmap.at(-1)?.endBfPct ?? input.goal.targetBodyFatPct) : (change.targetBodyFatPct ?? input.goal.targetBodyFatPct),
    targetLeanGainKg: plan.direction === "bulk" ? (change.targetLeanGainKg ?? input.goal.targetLeanGainKg ?? null) : null,
  });
  return { action, labelTr, recommended, after, change };
}

/** "150" and whether the option raises calories, from the before/after snapshots. */
function kcalDiff(before: GoalPlanSnapshot, o: GoalAdjustmentOption): { n: string; up: boolean } {
  const diff = (o.after?.dailyCalorieTarget ?? before.dailyCalorieTarget) - before.dailyCalorieTarget;
  return { n: formatTrNumber(Math.abs(Math.round(diff))), up: diff >= 0 };
}

/** Button label: "Günde 150 kcal ekle" / "Günde 150 kcal azalt". */
function kcalLabel(before: GoalPlanSnapshot, o: GoalAdjustmentOption): string {
  const { n, up } = kcalDiff(before, o);
  return `Günde ${n} kcal ${up ? "ekle" : "azalt"}`;
}

/** Sentence part: "günde 150 kcal ekleyelim" / "günde 150 kcal azaltalım". */
function kcalLet(before: GoalPlanSnapshot, o: GoalAdjustmentOption): string {
  const { n, up } = kcalDiff(before, o);
  return `günde ${n} kcal ${up ? "ekleyelim" : "azaltalım"}`;
}

/**
 * The proposal to show now, or null. Deterministic for the same inputs; dismissed or accepted
 * proposals are not repeated (the cool-down restarts from the answer).
 */
export function proposeGoalAdjustment(input: AdjustmentInput): GoalAdjustmentProposal | null {
  const { goal, todayKey } = input;
  const direction = directionOf(goal);
  const sinceKey = adjustmentSinceKey(goal);
  const sit = situation(input, direction, sinceKey);
  if (!sit) return null;
  // Tape noise can flip a slow recomp between "behind" and "stalled" from one reading to the next;
  // it is the same situation, so it keeps one id (an open proposal stays answerable, a dismissal holds).
  const id = adjustmentId(goal, direction === "recomp" && sit.kind === "stalled" ? "behind" : sit.kind, sinceKey);
  if ((goal.adjustments ?? []).some((a) => a.id === id)) return null;

  const before = currentSnapshot(goal, todayKey);
  const d = kg(sit.deviationKg);
  const options: GoalAdjustmentOption[] = [];
  let copy: Copy;

  const lowerStep = tdeeStep(input, -1);
  const lower = (recommended = true) => option(input, "lowerCalories", "", recommended, { tdeeOverride: lowerStep.tdee });
  /** At the calorie floor a lower TDEE cannot lower the target: such an option would change nothing. */
  const atCalorieFloor = (o: GoalAdjustmentOption) => Math.abs((o.after?.dailyCalorieTarget ?? before.dailyCalorieTarget) - before.dailyCalorieTarget) < 25;
  const raise = () => option(input, "raiseCalories", "", true, { tdeeOverride: tdeeStep(input, 1).tdee });
  const replan = (label: string, recommended = false) => option(input, "replan", label, recommended, {});

  if (sit.kind === "reached") {
    options.push({ action: "complete", labelTr: "Hedefi tamamla", recommended: true, after: null, change: {} });
    if (direction === "cut" && goal.targetBodyFatPct - 1 >= MIN_SAFE_BODY_FAT[input.replanBase.sex] + 1) {
      options.push(option(input, "tighten", `%${formatTrNumber(round(goal.targetBodyFatPct - 1, 1))} ile devam et`, false, { targetBodyFatPct: round(goal.targetBodyFatPct - 1, 1) }));
    } else if (direction === "bulk") {
      const total = (goal.targetLeanGainKg ?? goal.plan.leanGainKg ?? 0) + 1;
      options.push(option(input, "tighten", "+1 kg kasla devam et", false, { targetLeanGainKg: round(total, 2) }));
    }
    copy = { mood: "proud", trigger: "goal.completed", titleTr: "Hedefine ulaştın!", messageTr: "Başardın! Hedefi tamamlayıp yeni bir hedef seçebilir ya da biraz daha devam edebiliriz." };
  } else if (direction === "bulk") {
    if (sit.kind === "ahead") {
      const o = lower();
      o.labelTr = kcalLabel(before, o);
      options.push(o);
      copy = { mood: "think", trigger: "goal.adjust.ahead", titleTr: "Biraz hızlı alıyorsun", messageTr: `Kilo plandan belirgin hızlı artıyor; fazlası büyük ihtimalle yağ. Kaloriyi ${kcalLet(before, o)} mı?` };
    } else {
      const o = raise();
      o.labelTr = kcalLabel(before, o);
      options.push(o);
      copy =
        sit.kind === "stalled"
          ? { mood: "worried", trigger: "goal.adjust.stalled", titleTr: "Kilo yerinde sayıyor", messageTr: `Son haftalarda kilo artmıyor; kas için yakıt lazım. ${cap(kcalLet(before, o))} mi?` }
          : { mood: "curious", trigger: "goal.adjust.behind", titleTr: "Artış planın gerisinde", messageTr: `Kilo artışı planın yarısından az. ${cap(kcalLet(before, o))}, kas kazanımı hızlansın.` };
    }
    options.push(replan("Kaloriyi koru, tarihi güncelle"));
  } else {
    /** Recommended re-plan from today (an earlier date when ahead) plus a one-point tighter target when safe. */
    const earlier = () => {
      const o = replan("Tarihi öne çek", true);
      options.push(o);
      const tightened = round(goal.targetBodyFatPct - 1, 1);
      if (tightened >= MIN_SAFE_BODY_FAT[input.replanBase.sex] + 1) {
        options.push(option(input, "tighten", `Hedefi %${formatTrNumber(tightened)} yap`, false, { targetBodyFatPct: tightened }));
      }
      const saved = before.estimatedWeeks - (o.after?.estimatedWeeks ?? before.estimatedWeeks);
      return saved > 0
        ? ` Bu tempoyla ${before.estimatedWeeks} yerine ${o.after?.estimatedWeeks} haftada bitebilir; tarihi öne çekelim mi?`
        : " Planı bugünden yeniden çizelim mi?";
    };
    /** Recommended calorie cut and a later date; at the calorie floor only the later date. Returns the sentence. */
    const cutOrLater = (lateLabel: string, later: string) => {
      const o = lower();
      o.labelTr = kcalLabel(before, o);
      // At the calorie floor offer only the later date.
      const atFloor = atCalorieFloor(o);
      if (atFloor) options.push(replan(lateLabel, true));
      else options.push(o, replan(lateLabel));
      const measured = lowerStep.measured ? "Ölçülen harcaman plandakinden düşük çıktı. " : "";
      return (why: string) => (atFloor ? `${why} Kalori zaten güvenli tabanda; ${later}.` : `${measured}${why} ${cap(kcalLet(before, o))} ya da ${later}.`);
    };
    const slowCopy = (titleTr: string, messageTr: string): Copy => ({
      mood: sit.kind === "stalled" ? "worried" : "think",
      trigger: sit.kind === "stalled" ? "goal.adjust.stalled" : "goal.adjust.behind",
      titleTr,
      messageTr,
    });

    if (direction === "recomp") {
      const bf = sit.bodyFat!; // always set by recompSituation
      const p = pts(bf.deviationPts ?? 0);
      const l = kg(bf.deviationLeanKg ?? 0);
      if (sit.kind === "ahead" && sit.leanLoss) {
        // Fat on or ahead of plan, lean mass falling: the deficit is too big for the muscle.
        const o = raise();
        o.labelTr = kcalLabel(before, o);
        options.push(o, replan("Aynen devam, tarihi güncelle"));
        const fat = bf.status === "ahead" ? "Yağ oranın hızlı düşüyor" : "Yağ oranın planda";
        copy = {
          mood: "think",
          trigger: "goal.adjust.ahead",
          titleTr: "Kasını koruyalım",
          messageTr: `${fat} ama yağsız kütlen planın ${l} kg altında. Kası korumak için ${kcalLet(before, o)} mi?`,
        };
      } else if (sit.kind === "ahead") {
        copy = { mood: "cheer", trigger: "goal.adjust.ahead", titleTr: "Plandan öndesin!", messageTr: `Yağ oranında plandan ${p} puan öndesin!${earlier()}` };
      } else {
        const why = sit.kind === "stalled" ? "Son haftalarda yağ oranın düşmüyor" : `Yağ oranında planın ${p} puan gerisindesin`;
        if (sit.leanLoss) {
          // Behind on fat while losing lean: fewer calories would cost more muscle, so keep them.
          options.push(replan("Kaloriyi koru, planı güncelle", true));
          copy = slowCopy(
            "Kasını koruyalım",
            `${why}, yağsız kütlen de planın ${l} kg altında. Kaloriyi kısmak kası daha çok zorlar; proteini ve antrenman yükünü koruyup planı bugünden güncelleyelim.`
          );
        } else if (!bf.paceSlow) {
          // Past the plan's end without a pace shown to be slow: the plan ran out of time (or started
          // from a reading that was off). A fresh plan sets a new pace; fewer calories only as the alternative.
          options.push(replan("Kaloriyi koru, planı güncelle", true));
          const o = lower(false);
          if (!atCalorieFloor(o)) {
            o.labelTr = kcalLabel(before, o);
            options.push(o);
          }
          copy = slowCopy(
            "Plan süresi doldu",
            `Planın süresi doldu, hedefe ${pts(input.progress.bfToGo)} puan kaldı. Planı bugünden güncelleyip yeni bir tempo çizelim mi?`
          );
        } else {
          const say = cutOrLater("Kaloriyi koru, tarihi güncelle", "planı bugünden güncelleyelim");
          copy = slowCopy(sit.kind === "stalled" ? "Yağ oranı yerinde sayıyor" : "Biraz geride kaldık", say(`${why}.`));
        }
      }
    } else if (sit.kind === "ahead") {
      copy = { mood: "cheer", trigger: "goal.adjust.ahead", titleTr: "Plandan öndesin!", messageTr: `Beklenenden ${d} kg öndesin!${earlier()}` };
    } else {
      const say = cutOrLater("Kaloriyi koru, tarihi ötele", "tarihi öteleyelim");
      copy = slowCopy(
        sit.kind === "stalled" ? "Trend yerinde sayıyor" : "Biraz geride kaldık",
        say(sit.kind === "stalled" ? "İki haftadır kilo düşmüyor." : `Trend planın ${d} kg gerisinde.`)
      );
    }
  }

  return {
    id,
    kind: sit.kind,
    direction,
    deviationKg: sit.deviationKg,
    deviationBfPts: sit.bodyFat?.deviationPts ?? null,
    deviationLeanKg: sit.bodyFat?.deviationLeanKg ?? null,
    ...copy,
    before,
    options,
  };
}
