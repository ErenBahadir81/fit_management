import { z } from "zod";
import { isDateKey } from "../time/index";

export const zId = z.string().min(1);
export const zDateKey = z.string().refine(isDateKey, "YYYY-MM-DD formatında geçerli bir tarih olmalı");
export const zIso = z.string().min(10);
export const zGender = z.enum(["male", "female"]);
export const zRole = z.enum(["admin", "user"]);
export const zActivityLevel = z.enum(["sedentary", "light", "moderate", "active", "veryActive"]);
export const zWeekday = z.number().int().min(0).max(6);
export const zMeal = z.enum(["breakfast", "lunch", "dinner", "snack"]);
export const zGoalProfile = z.enum(["conservative", "optimal", "aggressive"]);
export const zMood = z.enum(["happy", "cheer", "think", "sleepy", "flex", "worried"]);
export const zOnTrack = z.enum(["ahead", "onTrack", "behind", "stalled"]);
export const zPositive = z.number().positive().finite();
export const zNonNeg = z.number().min(0).finite();
export const zPct = z.number().min(0).max(100);

export type Gender = z.infer<typeof zGender>;
export type Role = z.infer<typeof zRole>;
export type ActivityLevel = z.infer<typeof zActivityLevel>;
export type Meal = z.infer<typeof zMeal>;
export type GoalProfile = z.infer<typeof zGoalProfile>;
export type Mood = z.infer<typeof zMood>;
export type OnTrack = z.infer<typeof zOnTrack>;

export const MEAL_TR: Record<Meal, string> = {
  breakfast: "Kahvaltı",
  lunch: "Öğle",
  dinner: "Akşam",
  snack: "Ara öğün",
};
export const ACTIVITY_TR: Record<ActivityLevel, string> = {
  sedentary: "Hareketsiz",
  light: "Az hareketli",
  moderate: "Orta",
  active: "Aktif",
  veryActive: "Çok aktif",
};
export const GOAL_PROFILE_TR: Record<GoalProfile, string> = {
  conservative: "Temkinli",
  optimal: "Optimal",
  aggressive: "Agresif",
};

/** Standard API error envelope. */
export const zApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof zApiError>;

export const ERROR_CODES = [
  "VALIDATION",
  "AUTH_REQUIRED",
  "AUTH_INVALID",
  "TOKEN_EXPIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "GOAL_EXISTS",
  "NO_BODY_ENTRY",
  "RATE_LIMITED",
  "VISION_UNAVAILABLE",
  "UPSTREAM_ERROR",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
