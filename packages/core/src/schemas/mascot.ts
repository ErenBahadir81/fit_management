import { z } from "zod";
import { zId, zMood } from "./common";

export const zMascotTemplate = z.object({
  id: zId,
  key: z.string().min(1),
  mood: zMood,
  variants: z.array(z.string().min(1)).min(1),
  active: z.boolean(),
});
export type MascotTemplateDTO = z.infer<typeof zMascotTemplate>;
export const zMascotTemplateInput = zMascotTemplate.omit({ id: true }).partial({ active: true });
export const zMascotTemplateUpdate = zMascotTemplate.omit({ id: true, key: true }).partial();

export const MASCOT_KEYS = [
  "home.morning",
  "home.afternoon",
  "home.evening",
  "home.noData",
  "home.workoutDue",
  "home.workoutDone",
  "home.restDay",
  "home.caloriesLeft",
  "home.caloriesOver",
  "report.empty",
  "report.onTrack",
  "report.ahead",
  "report.behind",
  "report.stalled",
  "report.perfectWeek",
  "goal.created",
  "goal.halfway",
  "goal.completed",
  "goal.recalibrated",
  "goal.none",
  "scan.start",
  "scan.done",
  "scan.lowConfidence",
  "scan.failed",
  "body.newMeasurement",
  "body.weighInStreak",
  "body.noMeasurement7d",
  "workout.start",
  "workout.finished",
  "workout.pr",
  "workout.skipped",
  "recovery.allReady",
  "recovery.fatigued",
] as const;
export type MascotKey = (typeof MASCOT_KEYS)[number];
