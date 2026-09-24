/**
 * T7 — "where you are now": body fat and FFMI read together, and the goal that follows from them.
 *
 * Decision rule (practitioner consensus — Helms, Aragon, MacroFactor; docs/research/muscle-gain-science.md §6),
 * men's body fat, women's = men's + 8 points:
 *   ≥ 25 %            → cut
 *   20–25 %           → cut; recomp for a beginner with low FFMI
 *   15–20 %           → low FFMI: recomp (bulk as the alternative); otherwise a short cut, then bulk
 *   < 15 %            → lean bulk; near the natural FFMI limit → recomp (gains would crawl)
 */
import { BODY_FAT_CATEGORY_TR, bodyFatCategory } from "../navy/index";
import type { BodyAssessment, GoalRecommendation } from "../schemas/assessment";
import type { Gender } from "../schemas/common";
import type { GoalDirection, TrainingLevel } from "../schemas/goal";
import type { GoalSettings } from "../schemas/settings";
import { formatTrNumber } from "../goal/milestones";
import { inferTrainingLevel, muscleGainRate } from "../goal/muscle";
import { round } from "../utils/index";
import { FFMI_BAND_TR, ffmi, ffmiBand, ffmiGauge, ffmiRaw, leanMassForFfmi } from "./ffmi";

/** Body-fat thresholds of the decision rule, men; women add `FEMALE_BF_OFFSET`. */
export const GOAL_BF_THRESHOLDS = { cut: 25, cutUnlessNovice: 20, leanBulkBelow: 15 } as const;
export const FEMALE_BF_OFFSET = 8;
/** Suggested cut target ("fit" band top) and the lean-bulk horizon used to size a bulk suggestion. */
export const SUGGESTED_CUT_TARGET: Record<Gender, number> = { male: 15, female: 23 };
export const SUGGESTED_MINI_CUT_TARGET: Record<Gender, number> = { male: 12, female: 20 };
export const SUGGESTED_BULK_WEEKS = 20;
/** A first cut asks for at most this many points; the next goal can take it further. */
const MAX_FIRST_CUT_POINTS = 10;

export interface AssessmentInput {
  sex: Gender;
  weightKg: number;
  heightCm: number;
  bodyFatPct: number;
  /** User-stated level; inferred from FFMI when omitted. */
  trainingLevel?: TrainingLevel | null;
  settings: GoalSettings;
}

const n1 = (v: number) => formatTrNumber(round(v, 1));

const UNIT_DATIVE = ["", "e", "ye", "e", "e", "e", "ya", "ye", "e", "a"];
const TENS_DATIVE = ["", "a", "ye", "a", "a", "ye", "a", "e", "e", "a"];
/** "%15'e", "%12'ye", "%20'ye", "%9'a" — Turkish dative suffix for a whole number read aloud. */
export function pctToTr(n: number): string {
  const v = Math.round(Math.abs(n));
  const unit = v % 10;
  const tens = Math.floor(v / 10) % 10;
  const suffix = unit !== 0 ? UNIT_DATIVE[unit] : tens !== 0 ? TENS_DATIVE[tens] : v === 0 ? "a" : "e";
  return `%${v}'${suffix}`;
}

function cutTarget(sex: Gender, bf: number, floor: number): number {
  return round(Math.max(floor, bf - MAX_FIRST_CUT_POINTS), 0);
}

/** Lean kg a 20-week optimal bulk adds for this person, rounded to 0.5 kg (min 0.5). */
export function suggestedLeanGainKg(input: AssessmentInput, level: TrainingLevel, ffmiValue: number): number {
  const rate = muscleGainRate({ sex: input.sex, weightKg: input.weightKg, ffmi: ffmiValue, level, settings: input.settings });
  return Math.max(0.5, Math.round(rate.leanKgPerWeek * SUGGESTED_BULK_WEEKS * 2) / 2);
}

export function recommendGoal(input: AssessmentInput): GoalRecommendation {
  const { sex, bodyFatPct: bf, settings } = input;
  const lean = input.weightKg * (1 - bf / 100);
  const f = ffmi(lean, input.heightCm);
  const band = ffmiBand(sex, f);
  const level = input.trainingLevel ?? inferTrainingLevel(sex, f, settings);
  const off = sex === "female" ? FEMALE_BF_OFFSET : 0;
  const lowFfmi = band === "low" || (band === "average" && level === "beginner");
  const fStr = n1(f);
  const bfStr = n1(bf);

  const rec = (
    direction: GoalDirection,
    reasonTr: string,
    alternatives: GoalDirection[],
    target: { bf?: number; lean?: number }
  ): GoalRecommendation => ({
    direction,
    targetBodyFatPct: target.bf ?? null,
    targetLeanGainKg: target.lean ?? null,
    reasonTr,
    alternatives,
  });

  if (bf >= GOAL_BF_THRESHOLDS.cut + off) {
    const t = cutTarget(sex, bf, SUGGESTED_CUT_TARGET[sex]);
    return rec("cut", `Yağ oranın %${bfStr} ile yüksek: önce yağ vermek en büyük kazanç. Kasını koruyarak ${pctToTr(t)} inelim.`, ["recomp"], { bf: t });
  }
  if (bf >= GOAL_BF_THRESHOLDS.cutUnlessNovice + off) {
    const t = cutTarget(sex, bf, SUGGESTED_CUT_TARGET[sex]);
    if (lowFfmi && level === "beginner") {
      return rec(
        "recomp",
        `FFMI ${fStr} ile kas kütlen düşük ve yeni başlıyorsun: yağ verirken aynı anda kas da kazanabilirsin. Küçük bir açıkla ${pctToTr(t)} ilerleyelim.`,
        ["cut"],
        { bf: t }
      );
    }
    return rec("cut", `Yağ %${bfStr}, FFMI ${fStr}: yağ vermek öncelikli. ${pctToTr(t)} inince kas kazanmaya geçmek çok daha verimli olur.`, ["recomp"], { bf: t });
  }
  if (bf >= GOAL_BF_THRESHOLDS.leanBulkBelow + off) {
    if (lowFfmi) {
      const t = round(Math.max(SUGGESTED_MINI_CUT_TARGET[sex], bf - 4), 0);
      return rec(
        "recomp",
        `FFMI ${fStr}: kas kütlen düşük, önce kas kazanmak kritik. Yağ oranın makul; küçük açıkla rekomp seni en hızlı ilerletir.`,
        ["bulk", "cut"],
        { bf: t }
      );
    }
    const t = SUGGESTED_MINI_CUT_TARGET[sex];
    return rec("cut", `Kas temelin iyi (FFMI ${fStr}). Kısa bir yağ yakımıyla ${pctToTr(t)} inip sonra kas kazanmaya geçmek en temiz yol.`, ["bulk", "recomp"], { bf: t });
  }
  if (band === "nearLimit") {
    const t = round(Math.max(SUGGESTED_MINI_CUT_TARGET[sex] - 3, bf - 2), 0);
    return rec(
      "recomp",
      `FFMI ${fStr} ile doğal sınıra yakınsın: kas kazanımı çok yavaş olur. Yağ oranında ince ayar (rekomp) daha verimli.`,
      ["bulk"],
      { bf: Math.min(t, round(bf - 1, 0)) }
    );
  }
  const gain = suggestedLeanGainKg(input, level, f);
  return rec(
    "bulk",
    `Yağ oranın %${bfStr} ve FFMI ${fStr}: kas kazanmak için ideal noktadasın. ~${SUGGESTED_BULK_WEEKS} haftada +${n1(gain)} kg kas hedefleyelim.`,
    ["recomp"],
    { lean: gain }
  );
}

export function assessBody(input: AssessmentInput): BodyAssessment {
  const { sex, weightKg, heightCm, bodyFatPct, settings } = input;
  const fatMassKg = (weightKg * bodyFatPct) / 100;
  const leanMassKg = weightKg - fatMassKg;
  const f = ffmi(leanMassKg, heightCm);
  const band = ffmiBand(sex, f);
  const ceiling = settings.muscle.ffmiCeiling[sex];
  const bfBand = bodyFatCategory(sex, bodyFatPct);
  const level = input.trainingLevel ?? inferTrainingLevel(sex, f, settings);
  const recommendation = recommendGoal({ ...input, trainingLevel: level });
  const verdict: Record<GoalDirection, string> = { cut: "yağ vermek öncelikli", bulk: "kas kazanmak öncelikli", recomp: "rekomp (aynı anda yağ ver, kas kazan)" };
  return {
    sex,
    weightKg: round(weightKg, 2),
    heightCm,
    bodyFatPct: round(bodyFatPct, 1),
    leanMassKg: round(leanMassKg, 2),
    fatMassKg: round(fatMassKg, 2),
    ffmiRaw: round(ffmiRaw(leanMassKg, heightCm), 1),
    ffmi: round(f, 1),
    ffmiBand: band,
    ffmiBandTr: FFMI_BAND_TR[band],
    ffmiGauge: ffmiGauge(sex, f, ceiling),
    ffmiCeiling: ceiling,
    leanToCeilingKg: round(Math.max(0, leanMassForFfmi(ceiling, heightCm) - leanMassKg), 1),
    bodyFatBand: bfBand,
    bodyFatBandTr: BODY_FAT_CATEGORY_TR[bfBand],
    trainingLevel: level,
    trainingLevelInferred: !input.trainingLevel,
    summaryTr: `Yağ %${n1(bodyFatPct)}, FFMI ${n1(f)} (${FFMI_BAND_TR[band].toLocaleLowerCase("tr")}): ${verdict[recommendation.direction]}.`,
    recommendation,
  };
}
