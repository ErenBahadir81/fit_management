/**
 * C3 — the one-time questionnaire a new account answers, and the energy figures the diet tab
 * shows on the back of it. Everything the app used to bury in the Profil tab is asked once,
 * at the start, and turned straight into a first measurement and a goal.
 */
import { z } from "zod";
import { zActivityLevel, zDateKey, zGender, zWeekday } from "./common";
import { zBodyEntry } from "./body";
import { zGoal, zGoalInput } from "./goal";
import { zProgram } from "./program";
import { zUser } from "./user";

export const zOnboardingProfile = z.object({
  gender: zGender,
  birthDate: zDateKey,
  heightCm: z.number().min(100).max(250),
  activityLevel: zActivityLevel,
  measurementDay: zWeekday,
});
export type OnboardingProfile = z.infer<typeof zOnboardingProfile>;

/** Navy-formula inputs; `hipCm` is only required for women (the service enforces that). */
export const zOnboardingMeasurement = z.object({
  weightKg: z.number().min(25).max(400),
  neckCm: z.number().min(20).max(80),
  waistCm: z.number().min(40).max(250),
  hipCm: z.number().min(50).max(250).nullish(),
});
export type OnboardingMeasurement = z.infer<typeof zOnboardingMeasurement>;

/** Same as `POST /goals` (T7: cut, bulk or recomp); `{ targetBodyFatPct, profile }` still means a cut. */
export const zOnboardingGoal = zGoalInput;

/**
 * T8 — "Ne kadar süredir antrenman yapıyorsun?". Mapped to the goal engine's `trainingLevel` by
 * `trainingLevelForExperience` (none / < 1 y → beginner, 1–3 y → intermediate, 3 y + → advanced).
 */
export const zTrainingExperience = z.enum(["none", "under1", "oneToThree", "overThree"]);
export type TrainingExperience = z.infer<typeof zTrainingExperience>;

/** T8 — what the first program is sized from. Optional: older clients never send it. */
export const zOnboardingTraining = z.object({
  daysPerWeek: z.number().int().min(2).max(6),
  experience: zTrainingExperience,
});
export type OnboardingTraining = z.infer<typeof zOnboardingTraining>;

export const zOnboardingInput = z.object({
  profile: zOnboardingProfile,
  measurement: zOnboardingMeasurement,
  /** `null` = "I'll set a goal later". */
  goal: zOnboardingGoal.nullish().default(null),
  /** T8 — present: an account without a program gets a starter program sized to it. */
  training: zOnboardingTraining.nullish(),
});
export type OnboardingInput = z.infer<typeof zOnboardingInput>;

export const zOnboardingResponse = z.object({
  user: zUser,
  bodyEntry: zBodyEntry,
  goal: zGoal.nullable(),
  /** T8 — the account's program after onboarding (the starter one, or the one it already had). */
  program: zProgram.nullable().optional(),
});
export type OnboardingResponse = z.infer<typeof zOnboardingResponse>;

/**
 * "Yaklaşık kalori ihtiyacın" — what the body burns and what the plan asks for.
 * `dailyDeficit = maintenanceCalories − targetCalories`, so a bulk reads as a negative deficit.
 */
export const zEnergy = z.object({
  bmr: z.number(),
  tdee: z.number(),
  maintenanceCalories: z.number(),
  targetCalories: z.number(),
  dailyDeficit: z.number(),
  derivedFrom: z.enum(["goal", "maintenance", "default"]),
  activityLevel: zActivityLevel,
  activityMultiplier: z.number(),
  leanMassKg: z.number().nullable(),
});
export type EnergyDTO = z.infer<typeof zEnergy>;
