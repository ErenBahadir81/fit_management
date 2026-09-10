import { z } from "zod";
import { zActivityLevel, zGender, zWeekday } from "./common";

export const zRateBand = z.object({
  sex: zGender,
  bfMin: z.number().min(0).max(100),
  bfMax: z.number().min(0).max(100),
  conservativePctBwPerWeek: z.number().min(0).max(3),
  optimalPctBwPerWeek: z.number().min(0).max(3),
  aggressivePctBwPerWeek: z.number().min(0).max(3),
  maxKgPerWeek: z.number().min(0).max(3),
  note: z.string().default(""),
  sourceUrl: z.string().default(""),
});
export type RateBand = z.infer<typeof zRateBand>;

export const zGoalSettings = z.object({
  /** kcal per kg of (mixed) weight lost — Wishnofsky 1958 / Hall 2008 (3500 kcal/lb). */
  kcalPerKgFat: z.number().min(6000).max(9500).default(7700),
  /** Alpert 2005: max energy transfer from fat store, kcal per kg fat mass per day (290 kJ). */
  alpertKcalPerKgFatPerDay: z.number().min(30).max(120).default(69.3),
  /** Applied to the Alpert cap (derived from lean semi-starved men → conservative). */
  alpertSafetyFactor: z.number().min(0.3).max(1).default(0.75),
  /** Weekly deficit may not exceed this fraction of TDEE (MacroFactor / Lyle "large deficit"). */
  maxRelativeDeficitPct: z.number().min(0.1).max(0.5).default(0.3),
  /** Absolute floors per sex; effective floor = max(sexFloor, bmr × minBmrFactor, tdee × minTdeeFactor). */
  calorieFloor: z.object({ male: z.number().min(800).default(1500), female: z.number().min(800).default(1200) }),
  minBmrFactor: z.number().min(0.5).max(1.5).default(1),
  minTdeeFactor: z.number().min(0.4).max(1).default(0.7),
  /** Fraction of lost weight assumed to be fat, by leanness band (Forbes / McDonald). */
  fatFractionOfLoss: z.object({
    high: z.number().min(0.5).max(1).default(1.0),
    mid: z.number().min(0.5).max(1).default(0.9),
    low: z.number().min(0.5).max(1).default(0.8),
  }),
  /** Protein g per kg LEAN mass by leanness band (Helms 2014 / ISSN 2017) + floor per kg bodyweight (Morton 2018). */
  protein: z.object({
    leanGPerKgLean: z.number().min(1).max(4).default(3.0),
    midGPerKgLean: z.number().min(1).max(4).default(2.6),
    highGPerKgLean: z.number().min(1).max(4).default(2.2),
    floorGPerKgBodyweight: z.number().min(0.8).max(3).default(1.6),
  }),
  /** Fat share of calories (Helms: 15–30 %). */
  fatPctOfCalories: z.number().min(0.15).max(0.4).default(0.25),
  /** Leanness band cut-offs (BF %) used by fatFractionOfLoss & protein: lean < lo, mid < hi, high ≥ hi. */
  leannessBands: z.object({
    male: z.object({ lo: z.number().default(15), hi: z.number().default(25) }),
    female: z.object({ lo: z.number().default(24), hi: z.number().default(35) }),
  }),
  /** Katch-McArdle weight in the BMR blend (rest is Mifflin-St Jeor when age is known). */
  bmrBlendKatchWeight: z.number().min(0).max(1).default(0.5),
  activityMultipliers: z.record(zActivityLevel, z.number().min(1).max(2.5)),
  ewma: z.object({
    alpha: z.number().min(0.02).max(1).default(0.1),
    sparseAlpha: z.number().min(0.02).max(1).default(0.25),
    outlierRejectKg: z.number().min(0.5).max(10).default(3),
  }),
  /** Measured-TDEE recalibration (MacroFactor-style). */
  recalibration: z.object({
    minDays: z.number().int().min(7).max(56).default(14),
    windowDays: z.number().int().min(7).max(56).default(21),
    settlingDays: z.number().int().min(0).max(21).default(10),
    dampingBeta: z.number().min(0).max(1).default(0.3),
    maxWeeklyChangeKcal: z.number().min(0).max(1000).default(150),
    sanityBounds: z.tuple([z.number(), z.number()]).default([0.65, 1.45]),
    minIntakeDaysPerWeek: z.number().int().min(1).max(7).default(5),
  }),
  /** A-priori adaptation used only while measured recalibration is unavailable. */
  adaptation: z.object({
    kcalPerDayPerKgLost: z.number().min(0).max(60).default(22),
    adaptivePctPerWeek: z.number().min(0).max(0.02).default(0.004),
    adaptiveCapPct: z.number().min(0).max(0.3).default(0.1),
  }),
  maxWeeks: z.number().int().min(4).max(208).default(104),
  /** Navy tape SEE shown as ± uncertainty in the UI. */
  bodyFatUncertaintyPct: z.number().min(0).max(10).default(3.5),
  rateTable: z.array(zRateBand).min(1),
});
export type GoalSettings = z.infer<typeof zGoalSettings>;

export const zSettings = z.object({
  goal: zGoalSettings,
  recovery: z.object({ small: z.number().min(6).max(168).default(48), large: z.number().min(6).max(168).default(24) }),
  week: z.object({ defaultMeasurementDay: zWeekday.default(0) }),
  vision: z.object({
    enabled: z.boolean().default(true),
    minConfidence: z.number().min(0).max(1).default(0.15),
    maxDetections: z.number().int().min(1).max(10).default(5),
  }),
  mascot: z.object({ name: z.string().default("Floo") }),
  updatedAt: z.string().optional(),
});
export type SettingsDTO = z.infer<typeof zSettings>;

/** Validate that rate bands per sex are contiguous and cover 0..100 without overlap. */
export function validateRateTable(bands: RateBand[]): string[] {
  const problems: string[] = [];
  for (const sex of ["male", "female"] as const) {
    const list = bands.filter((b) => b.sex === sex).sort((a, b) => a.bfMin - b.bfMin);
    if (list.length === 0) {
      problems.push(`${sex}: en az bir bant gerekli`);
      continue;
    }
    if (list[0].bfMin !== 0) problems.push(`${sex}: ilk bant 0'dan başlamalı`);
    if (list[list.length - 1].bfMax !== 100) problems.push(`${sex}: son bant 100'de bitmeli`);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.bfMax <= b.bfMin) problems.push(`${sex}: ${b.bfMin}-${b.bfMax} geçersiz aralık`);
      if (i > 0 && list[i - 1].bfMax !== b.bfMin)
        problems.push(`${sex}: ${list[i - 1].bfMax} ile ${b.bfMin} arasında boşluk/çakışma`);
      if (!(b.conservativePctBwPerWeek <= b.optimalPctBwPerWeek && b.optimalPctBwPerWeek <= b.aggressivePctBwPerWeek))
        problems.push(`${sex}: ${b.bfMin}-${b.bfMax} temkinli ≤ optimal ≤ agresif olmalı`);
    }
  }
  return problems;
}

export const DEFAULT_RATE_TABLE: RateBand[] = [
  { sex: "male", bfMin: 0, bfMax: 8, conservativePctBwPerWeek: 0.2, optimalPctBwPerWeek: 0.35, aggressivePctBwPerWeek: 0.5, maxKgPerWeek: 0.5, note: "Contest/photoshoot leanness. Severe lean-mass risk: leaner dieters can lose up to 1 lb muscle per 3 lb of weight lost. Alpert fat-mobilisation cap is the binding constraint here. Time-limit to 2-4 weeks and refeed.", sourceUrl: "https://bodyrecomposition.com/fat-loss/muscle-loss-single-digit-bodyfat" },
  { sex: "male", bfMin: 8, bfMax: 12, conservativePctBwPerWeek: 0.3, optimalPctBwPerWeek: 0.5, aggressivePctBwPerWeek: 0.7, maxKgPerWeek: 0.7, note: "High lean-mass risk. Garthe 2011: leaner subjects in the fast-loss (1.4%/wk) arm lost LBM while the 0.7%/wk arm gained 2.1%. Keep at or below 0.7%/wk.", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/21558571/" },
  { sex: "male", bfMin: 12, bfMax: 15, conservativePctBwPerWeek: 0.4, optimalPctBwPerWeek: 0.6, aggressivePctBwPerWeek: 0.8, maxKgPerWeek: 0.8, note: "Upper edge of Lyle McDonald Category 1 (men <=15%). Moderate-to-high lean-mass risk; Garthe's validated 0.7%/wk target sits in this band.", sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/" },
  { sex: "male", bfMin: 15, bfMax: 20, conservativePctBwPerWeek: 0.5, optimalPctBwPerWeek: 0.75, aggressivePctBwPerWeek: 1.0, maxKgPerWeek: 1.0, note: "Core Helms/ISSN 0.5-1%/wk band; RP Strength's 0.75%/wk default. Moderate lean-mass risk; a ~500 kcal/day deficit here is the Murphy & Koehler threshold below which lean mass is preserved.", sourceUrl: "https://www.tandfonline.com/doi/full/10.1186/s12970-017-0174-y" },
  { sex: "male", bfMin: 20, bfMax: 25, conservativePctBwPerWeek: 0.5, optimalPctBwPerWeek: 0.8, aggressivePctBwPerWeek: 1.1, maxKgPerWeek: 1.0, note: "Lyle Category 2 (men 16-25%). Low-moderate lean-mass risk: ample adipose buffers the deficit. ISSN: 'the higher the baseline body fat level, the more aggressively the caloric deficit may be imposed'.", sourceUrl: "https://www.tandfonline.com/doi/full/10.1186/s12970-017-0174-y" },
  { sex: "male", bfMin: 25, bfMax: 30, conservativePctBwPerWeek: 0.6, optimalPctBwPerWeek: 0.9, aggressivePctBwPerWeek: 1.2, maxKgPerWeek: 1.1, note: "Lyle Category 3 (men >=26%). Low lean-mass risk with adequate protein and resistance training. Watch the relative deficit rather than the absolute rate.", sourceUrl: "https://bodyrecomposition.com/fat-loss/3-sizes-of-calorie-deficit" },
  { sex: "male", bfMin: 30, bfMax: 40, conservativePctBwPerWeek: 0.7, optimalPctBwPerWeek: 1.0, aggressivePctBwPerWeek: 1.3, maxKgPerWeek: 1.25, note: "Low lean-mass risk, but %BW scales badly at high body mass - cap the relative deficit at 30% of TDEE. MacroFactor: 1%/wk at 300 lb is a ~42% relative deficit and 'feels rough'.", sourceUrl: "https://macrofactor.com/cutting-calculator/" },
  { sex: "male", bfMin: 40, bfMax: 100, conservativePctBwPerWeek: 0.7, optimalPctBwPerWeek: 1.0, aggressivePctBwPerWeek: 1.5, maxKgPerWeek: 1.25, note: "Low lean-mass risk. Medical supervision advised above ~1.4 kg/wk; sustained rapid loss raises gallstone risk. Relative-deficit cap and calorie floor will normally bind before the percentage does.", sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6163457/" },
  { sex: "female", bfMin: 0, bfMax: 16, conservativePctBwPerWeek: 0.2, optimalPctBwPerWeek: 0.3, aggressivePctBwPerWeek: 0.45, maxKgPerWeek: 0.4, note: "At or below the essential-fat margin. Severe lean-mass risk plus high RED-S / menstrual-dysfunction risk. Enforce energy availability >= 30 kcal per kg FFM per day and require clinical oversight.", sourceUrl: "https://stillmed.olympics.com/media/Documents/Athletes/Medical-Scientific/Consensus-Statements/REDs/IOC-consensus-statement-Relative-Energy-Deficiency-in-Sport-2018.pdf" },
  { sex: "female", bfMin: 16, bfMax: 20, conservativePctBwPerWeek: 0.3, optimalPctBwPerWeek: 0.45, aggressivePctBwPerWeek: 0.6, maxKgPerWeek: 0.5, note: "Physique-contest condition. High lean-mass risk; monitor menstrual function. Helms 2014: a 1 kg/wk vs 0.5 kg/wk cut in strength-trained women cost 5% bench strength and 30% more testosterone suppression.", sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/" },
  { sex: "female", bfMin: 20, bfMax: 24, conservativePctBwPerWeek: 0.4, optimalPctBwPerWeek: 0.55, aggressivePctBwPerWeek: 0.75, maxKgPerWeek: 0.6, note: "Upper edge of Lyle McDonald Category 1 (women <=24%). Moderate-to-high lean-mass risk; prefer the slower end and lengthen the timeline.", sourceUrl: "https://everycalculators.com/lyle-mcdonald-psmf-calculator.html" },
  { sex: "female", bfMin: 24, bfMax: 28, conservativePctBwPerWeek: 0.5, optimalPctBwPerWeek: 0.7, aggressivePctBwPerWeek: 0.9, maxKgPerWeek: 0.75, note: "Core Helms/ISSN 0.5-1%/wk band, scaled for typical female body mass. Moderate lean-mass risk. Note absolute deficits are smaller than for men at the same percentage.", sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/" },
  { sex: "female", bfMin: 28, bfMax: 33, conservativePctBwPerWeek: 0.5, optimalPctBwPerWeek: 0.75, aggressivePctBwPerWeek: 1.0, maxKgPerWeek: 0.85, note: "Lyle Category 2 (women 25-34%). Low-to-moderate lean-mass risk. A ~500 kcal/day deficit here is close to the Murphy & Koehler lean-mass-preservation threshold.", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/34623696/" },
  { sex: "female", bfMin: 33, bfMax: 40, conservativePctBwPerWeek: 0.6, optimalPctBwPerWeek: 0.85, aggressivePctBwPerWeek: 1.1, maxKgPerWeek: 1.0, note: "Lyle Category 3 (women >=35%). Low lean-mass risk with adequate protein and resistance training. ISSN supports a more aggressive deficit at higher baseline fat.", sourceUrl: "https://www.tandfonline.com/doi/full/10.1186/s12970-017-0174-y" },
  { sex: "female", bfMin: 40, bfMax: 50, conservativePctBwPerWeek: 0.65, optimalPctBwPerWeek: 0.95, aggressivePctBwPerWeek: 1.25, maxKgPerWeek: 1.1, note: "Low lean-mass risk. Cap the relative deficit at 30% of TDEE; the 1200 kcal floor will often bind first for smaller users.", sourceUrl: "https://macrofactor.com/cutting-calculator/" },
  { sex: "female", bfMin: 50, bfMax: 100, conservativePctBwPerWeek: 0.7, optimalPctBwPerWeek: 1.0, aggressivePctBwPerWeek: 1.3, maxKgPerWeek: 1.2, note: "Low lean-mass risk. Medical supervision advised. Calorie floor and relative-deficit cap will normally bind before the percentage rate does.", sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6163457/" },
];

export const DEFAULT_GOAL_SETTINGS: GoalSettings = {
  kcalPerKgFat: 7700,
  alpertKcalPerKgFatPerDay: 69.3,
  alpertSafetyFactor: 0.75,
  maxRelativeDeficitPct: 0.3,
  calorieFloor: { male: 1500, female: 1200 },
  minBmrFactor: 1,
  minTdeeFactor: 0.7,
  fatFractionOfLoss: { high: 1.0, mid: 0.9, low: 0.8 },
  protein: { leanGPerKgLean: 3.0, midGPerKgLean: 2.6, highGPerKgLean: 2.2, floorGPerKgBodyweight: 1.6 },
  fatPctOfCalories: 0.25,
  leannessBands: { male: { lo: 15, hi: 25 }, female: { lo: 24, hi: 35 } },
  bmrBlendKatchWeight: 0.5,
  activityMultipliers: { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryActive: 1.9 },
  ewma: { alpha: 0.1, sparseAlpha: 0.25, outlierRejectKg: 3 },
  recalibration: {
    minDays: 14,
    windowDays: 21,
    settlingDays: 10,
    dampingBeta: 0.3,
    maxWeeklyChangeKcal: 150,
    sanityBounds: [0.65, 1.45],
    minIntakeDaysPerWeek: 5,
  },
  adaptation: { kcalPerDayPerKgLost: 22, adaptivePctPerWeek: 0.004, adaptiveCapPct: 0.1 },
  maxWeeks: 104,
  bodyFatUncertaintyPct: 3.5,
  rateTable: DEFAULT_RATE_TABLE,
};

export const DEFAULT_SETTINGS: SettingsDTO = {
  goal: DEFAULT_GOAL_SETTINGS,
  recovery: { small: 48, large: 24 },
  week: { defaultMeasurementDay: 0 },
  vision: { enabled: true, minConfidence: 0.15, maxDetections: 5 },
  mascot: { name: "Floo" },
};
