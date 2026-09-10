import { z } from "zod";
import { zId } from "./common";

export const zMuscleSize = z.enum(["large", "small"]);
export const zMuscleRegion = z.enum(["front", "back", "legs", "core", "arms"]);
export const zMuscleKey = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[a-zA-Z][a-zA-Z0-9]*$/, "camelCase anahtar");

export const zMuscle = z.object({
  key: zMuscleKey,
  name: z.string().min(1),
  short: z.string().min(1),
  size: zMuscleSize,
  fullRecoveryHours: z.number().min(6).max(168),
  weeklyTarget: z.object({ min: z.number().min(0).optional(), max: z.number().min(0) }),
  region: zMuscleRegion,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  order: z.number().int().min(0),
  active: z.boolean(),
});
export type MuscleDTO = z.infer<typeof zMuscle>;
export const zMuscleInput = zMuscle.omit({ order: true }).extend({ order: z.number().int().min(0).optional() });
export const zMuscleUpdate = zMuscle.omit({ key: true }).partial();

export const zMuscleLoad = z.object({ key: zMuscleKey, load: z.number().min(0).max(1) });
export type MuscleLoad = z.infer<typeof zMuscleLoad>;

export const zMetric = z.enum(["reps", "time", "stretch"]);
export type ExerciseMetric = z.infer<typeof zMetric>;
export const zExerciseKind = z.enum(["strength", "cardio", "mobility"]);

export const zExercise = z.object({
  id: zId,
  name: z.string().min(1),
  muscles: z.array(zMuscleLoad),
  defaultSets: z.number().int().min(1).max(20),
  defaultReps: z.number().int().min(1).max(600),
  metric: zMetric,
  kind: zExerciseKind,
  equipment: z.array(z.string()),
  instructions: z.string(),
  active: z.boolean(),
});
export type ExerciseDTO = z.infer<typeof zExercise>;
export const zExerciseInput = zExercise.omit({ id: true }).partial({
  equipment: true,
  instructions: true,
  active: true,
  kind: true,
  metric: true,
});
export type ExerciseInput = z.infer<typeof zExerciseInput>;
export const zExerciseUpdate = zExercise.omit({ id: true }).partial();
