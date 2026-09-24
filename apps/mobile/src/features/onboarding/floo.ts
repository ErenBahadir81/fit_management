/**
 * Floo's side of the session: what he says on each step, how he reacts to each answer, and the
 * order in which his body does things (walk in, gesture, reach toward what he is talking about).
 *
 * Pure, so the whole script is testable and the screen only plays it. Voice per
 * docs/plan/09-mascot.md: warm, short, second person, concrete numbers, never shaming.
 */
import { BODY_FAT_CATEGORY_TR, bodyFatCategory, type BodyAssessment, type GoalPlan } from "@fitfloow/core";
import { fmtInt, fmtNumber, fmtPct } from "../../lib/format";
import { gestureDuration, type Gesture, type Mood } from "../../mascot/model";
import { bodyFatFor, type GoalChoice, type OnboardingDraft, type OnboardingStep } from "./draftShape";
import { MEASUREMENT_RANGE, inRange, measuredCount, measurementFields, type MeasurementField } from "./model";
import { assessmentFor, recommendedChoice } from "./plan";

/** What Floo is looking or reaching at. The screen resolves these to positions. */
export type PointTarget = "ring" | "card" | "slider";

export interface FlooCue {
  mood: Mood;
  gesture: Gesture | null;
  say: string;
  point?: PointTarget | null;
}

const firstName = (d: OnboardingDraft) => d.account.displayName.trim().split(/\s+/)[0] ?? "";
const withName = (d: OnboardingDraft, lead: string, rest: string) => {
  const n = firstName(d);
  return n ? `${lead}, ${n}! ${rest}` : `${lead}! ${rest}`;
};

export function stepCue(step: OnboardingStep, d: OnboardingDraft): FlooCue {
  switch (step) {
    case "welcome":
    case "hello":
      return { mood: "happy", gesture: "wave", say: "Merhaba! Ben Floo, bu yolda seninle olacağım. Sana nasıl sesleneyim?" };
    case "account":
      return { mood: "happy", gesture: "thumbsUp", say: withName(d, "Memnun oldum", "Önce bir hesap açalım; ölçülerin yalnızca sende kalsın.") };
    case "body":
      return { mood: "think", gesture: "think", say: "Seni biraz tanıyayım: cinsiyetin, doğum tarihin ve boyun. Hesapların hepsi buna dayanıyor." };
    case "measure": {
      const hip = d.profile.gender === "female";
      return {
        mood: "energetic",
        gesture: "point",
        point: "ring",
        say: `Mezurayı kap! Kilo, boyun${hip ? ", bel ve kalça" : " ve bel"}; her ölçüde halkan biraz daha dolacak.`,
      };
    }
    case "training":
      return { mood: "energetic", gesture: "flex", say: "Şimdi antrenman: günün ne kadar hareketli, haftada kaç gün ayırabilirsin?" };
    case "assessment": {
      const a = assessmentFor(d);
      return { mood: "proud", gesture: "point", point: "card", say: a?.summaryTr ?? "Ölçülerin gelince durumunu burada okuyacağım." };
    }
    case "goal": {
      const a = assessmentFor(d);
      if (!a) return { mood: "think", gesture: "think", say: "Hedefini birlikte seçelim." };
      return { mood: "proud", gesture: DIRECTION_GESTURE[a.recommendation.direction], point: "slider", say: a.recommendation.reasonTr };
    }
    case "done":
      return { mood: "celebrate", gesture: "cheer", say: withName(d, "Hazırız", "Programın ve beslenme hedefin hazır; her adımda yanındayım.") };
  }
}

const DIRECTION_GESTURE = { cut: "point", bulk: "flex", recomp: "thumbsUp" } as const satisfies Record<GoalChoice["direction"], Gesture>;

const FIELD_TR: Record<MeasurementField, string> = { weightKg: "Kilo", neckCm: "Boyun", waistCm: "Bel", hipCm: "Kalça" };
const unit = (f: MeasurementField) => (f === "weightKg" ? "kg" : "cm");

/**
 * Floo's instant reaction to one measurement landing: the number back, how many are left, and the
 * body fat the moment the last one completes it. Null when the field is empty.
 */
export function measureReaction(field: MeasurementField, d: OnboardingDraft): FlooCue | null {
  const value = d.measurement[field];
  if (value === null) return null;
  if (!inRange(field, value)) {
    const r = MEASUREMENT_RANGE[field];
    return {
      mood: "worried",
      gesture: "shrug",
      say: `${FIELD_TR[field]} ${fmtNumber(value, value % 1 === 0 ? 0 : 1)} ${unit(field)} bana biraz tuhaf geldi. ${r.min}-${r.max} ${unit(field)} arasında bir değer bekliyorum.`,
    };
  }
  const bf = bodyFatFor(d);
  const left = measurementFields(d.profile.gender).length - measuredCount(d);
  if (bf !== null && left === 0 && d.profile.gender) {
    const category = BODY_FAT_CATEGORY_TR[bodyFatCategory(d.profile.gender, bf)].toLocaleLowerCase("tr");
    return { mood: "proud", gesture: "point", point: "ring", say: `Tamamdır! Yağ oranın yaklaşık ${fmtPct(bf)}, yani ${category} aralıkta.` };
  }
  const shown = `${fmtNumber(value, value % 1 === 0 ? 0 : 1)} ${unit(field)}`;
  const tail = left > 0 ? ` ${left} ölçü kaldı.` : "";
  return { mood: "happy", gesture: "thumbsUp", say: `${FIELD_TR[field]} ${shown}, not ettim.${tail}` };
}

const rateTr = (plan: GoalPlan) => `haftada ~${fmtNumber(plan.initialRateKgPerWeek, 2)} kg`;

/** Floo's answer when the user moves the goal: the recommendation's reason, or the new plan in numbers. */
export function goalCue(choice: GoalChoice, a: BodyAssessment, plan: GoalPlan | null): FlooCue {
  const rec = recommendedChoice(a);
  if (choice.direction === rec.direction) {
    const same = choice.targetBodyFatPct === rec.targetBodyFatPct && choice.targetLeanGainKg === rec.targetLeanGainKg;
    if (same || !plan) return { mood: "proud", gesture: DIRECTION_GESTURE[choice.direction], point: "slider", say: a.recommendation.reasonTr };
  }
  if (!plan) return { mood: "think", gesture: "think", say: "Bu hedefi hesaplayamadım; biraz oynatıp tekrar deneyelim mi?" };
  const weeks = `${plan.estimatedWeeks} haftada`;
  const what =
    choice.direction === "bulk"
      ? `+${fmtNumber(choice.targetLeanGainKg ?? 0, 1)} kg kas`
      : choice.direction === "recomp"
        ? `${fmtPct(choice.targetBodyFatPct ?? 0, 1)} yağ oranı, kas da kazanarak`
        : `${fmtPct(choice.targetBodyFatPct ?? 0, 1)} yağ oranı`;
  const kcal = `günde ${fmtInt(plan.initialDailyCalorieTarget)} kcal`;
  return { mood: "happy", gesture: DIRECTION_GESTURE[choice.direction], point: "slider", say: `Olur! ${weeks} ${what}: ${rateTr(plan)}, ${kcal}.` };
}

/* --------------------------------------------------------------- timing */

/** One step's walk: long enough for two strides of the in-place cycle, short enough not to block. */
export const WALK_MS = 560;
/** How far Floo drifts forward mid-stride, px: the world slides past, he walks on the spot. */
export const WALK_PX = 28;
/** Walking into the scene from off-stage (the first question). */
export const ENTER_MS = 900;
export const ENTER_PX = 160;
/** How long a reach toward the ring / card / slider is held before the arm comes back. */
export const POINT_HOLD_MS = 1400;
/** Beat between arriving and gesturing, so the two read as separate actions. */
export const SETTLE_MS = 60;

export type TimelineKind = "walkStart" | "walkEnd" | "gesture" | "point" | "unpoint";
export interface TimelineEvent {
  at: number;
  kind: TimelineKind;
}

/**
 * When each part of a cue happens, in ms from its start. The single place that sequences Floo's
 * body: walk → gesture (its own length, `gestureDuration`) → reach → let go. Under reduced motion
 * none of it happens; the mood cross-fade the model does on its own is the whole reaction.
 */
export type Walk = -1 | 0 | 1 | "enter";

export function cueTimeline(cue: { walk: Walk; gesture: Gesture | null; point: PointTarget | null | undefined }, reduce: boolean): TimelineEvent[] {
  if (reduce) return [];
  const out: TimelineEvent[] = [];
  let t = 0;
  if (cue.walk !== 0) {
    const ms = cue.walk === "enter" ? ENTER_MS : WALK_MS;
    out.push({ at: 0, kind: "walkStart" }, { at: ms, kind: "walkEnd" });
    t = ms + SETTLE_MS;
  }
  if (cue.gesture) {
    out.push({ at: t, kind: "gesture" });
    t += gestureDuration(cue.gesture);
  }
  if (cue.point) {
    out.push({ at: t, kind: "point" }, { at: t + POINT_HOLD_MS, kind: "unpoint" });
  }
  return out;
}
