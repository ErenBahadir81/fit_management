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
/**
 * Every face Floo can pull. The last four arrived with the wider emotion set — keep this list in
 * step with `FLOO_MOODS` in the app, which asserts at compile time that it can draw all of them.
 */
export const zMood = z.enum(["happy", "cheer", "think", "sleepy", "flex", "worried", "proud", "sad", "hype", "curious"]);
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

/**
 * Peel `.default(...)` off a field, wherever it sits under `.optional()` / `.nullable()`.
 * `unwrap()` is typed against zod's internal base class, hence the casts.
 */
function withoutDefault(field: z.ZodType): z.ZodType {
  if (field instanceof z.ZodDefault) return withoutDefault(field.unwrap() as z.ZodType);
  if (field instanceof z.ZodOptional) return withoutDefault(field.unwrap() as z.ZodType).optional();
  if (field instanceof z.ZodNullable) return withoutDefault(field.unwrap() as z.ZodType).nullable();
  return field;
}

/**
 * A PATCH body derived from a create schema: every field optional, every default removed.
 *
 * Use this instead of `.partial()`. zod's `.partial()` makes fields optional but *keeps* their
 * `.default(...)`s, so `PATCH { name }` parses into every other field's default and the route
 * `$set`s them — turning "rename this" into "reset everything else". Validation is unchanged;
 * only the defaults go.
 */
export function patchOf<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T
): z.ZodObject<{ [K in keyof T["shape"]]: z.ZodOptional<T["shape"][K]> }> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) shape[key] = withoutDefault(field as z.ZodType).optional();
  return z.object(shape) as unknown as z.ZodObject<{ [K in keyof T["shape"]]: z.ZodOptional<T["shape"][K]> }>;
}

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
