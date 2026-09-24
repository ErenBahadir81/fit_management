/**
 * C3 — the one-time questionnaire a new account answers, and the energy figures the diet tab
 * shows on the back of it. Everything the app used to bury in the Profil tab is asked once,
 * at the start, and turned straight into a first measurement and a goal.
 */
import { z } from "zod";
import { zActivityLevel, zDateKey, zGender, zWeekday } from "./common";
import { zBodyEntry } from "./body";
import { zGoal, zGoalInput } from "./goal";
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

export const zOnboardingInput = z.object({
  profile: zOnboardingProfile,
  measurement: zOnboardingMeasurement,
  /** `null` = "I'll set a goal later". */
  goal: zOnboardingGoal.nullish().default(null),
});
export type OnboardingInput = z.infer<typeof zOnboardingInput>;

export const zOnboardingResponse = z.object({ user: zUser, bodyEntry: zBodyEntry, goal: zGoal.nullable() });
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
