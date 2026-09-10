import { z } from "zod";
import { zId, zIso } from "./common";
import { zMetric, zMuscleLoad } from "./catalog";

export const zDayKind = z.enum(["strength", "run", "swim", "stretch", "rest"]);
export type DayKind = z.infer<typeof zDayKind>;

export const zExerciseTarget = z.object({
  name: z.string().min(1),
  muscles: z.array(zMuscleLoad),
  targetSets: z.number().int().min(1).max(20),
  targetReps: z.number().int().min(1).max(600),
  targetRIR: z.number().int().min(0).max(10).nullable(),
  metric: zMetric,
});
export type ExerciseTargetDTO = z.infer<typeof zExerciseTarget>;

export const zCardioTarget = z.object({
  targetKm: z.number().min(0).max(200),
  targetMin: z.number().min(0).max(1440),
  label: z.string().default(""),
});
export type CardioTargetDTO = z.infer<typeof zCardioTarget>;

export const zDay = z.object({
  order: z.number().int().min(1),
  title: z.string().min(1),
  focus: z.string().default(""),
  kind: zDayKind,
  exercises: z.array(zExerciseTarget),
  run: zCardioTarget.nullable(),
  swim: zCardioTarget.nullable(),
});
export type DayDTO = z.infer<typeof zDay>;

export const zProgram = z.object({
  id: zId,
  name: z.string(),
  days: z.array(zDay),
  currentIndex: z.number().int().min(0),
  weekNumber: z.number().int().min(1),
  startedAt: zIso,
  lastActionAt: zIso,
  sourceTemplateId: zId.nullable(),
});
export type ProgramDTO = z.infer<typeof zProgram>;

export const zDayInput = zDay.extend({
  exercises: z.array(zExerciseTarget.partial({ metric: true, targetRIR: true, muscles: true })).default([]),
  run: zCardioTarget.nullable().default(null),
  swim: zCardioTarget.nullable().default(null),
});
export const zProgramInput = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  days: z.array(zDayInput).min(1).max(14),
});
export type ProgramInput = z.infer<typeof zProgramInput>;

export const zProgramTemplate = z.object({
  id: zId,
  name: z.string(),
  description: z.string(),
  days: z.array(zDay),
  tags: z.array(z.string()),
  cycleLength: z.number().int().min(1),
  weeklyVolume: z.record(z.string(), z.number()).optional(),
  createdAt: zIso,
  updatedAt: zIso,
});
export type ProgramTemplateDTO = z.infer<typeof zProgramTemplate>;
export const zProgramTemplateInput = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().max(500).default(""),
  days: z.array(zDayInput).min(1).max(14),
  tags: z.array(z.string()).default([]),
});
export type ProgramTemplateInput = z.infer<typeof zProgramTemplateInput>;

/* ------------------------------- logs ---------------------------------- */
export const zSetEntry = z.object({ reps: z.number().min(0).max(10000), rir: z.number().int().min(0).max(10).nullable() });
export type SetEntryDTO = z.infer<typeof zSetEntry>;

export const zStrengthEntry = z.object({
  name: z.string().min(1),
  muscles: z.array(zMuscleLoad),
  plannedSets: z.number().int().min(0),
  plannedReps: z.number().int().min(0),
  plannedRIR: z.number().int().min(0).max(10).nullable(),
  source: z.enum(["planned", "extra"]),
  skipped: z.boolean(),
  metric: zMetric,
  sets: z.array(zSetEntry),
});
export type StrengthEntryDTO = z.infer<typeof zStrengthEntry>;

export const zCardioSegment = z.object({ km: z.number().min(0), min: z.number().min(0) });
export const zCardioEntry = z.object({
  segments: z.array(zCardioSegment),
  totalKm: z.number().min(0),
  totalMin: z.number().min(0),
  targetKm: z.number().min(0),
  targetMin: z.number().min(0),
});
export type CardioEntryDTO = z.infer<typeof zCardioEntry>;

export const zWorkoutLog = z.object({
  id: zId,
  date: zIso,
  dateKey: z.string(),
  dayOrder: z.number().int().min(0),
  weekNumber: z.number().int().min(1),
  title: z.string(),
  kind: zDayKind,
  isOffDay: z.boolean(),
  strength: z.array(zStrengthEntry),
  run: zCardioEntry.nullable(),
  swim: zCardioEntry.nullable(),
  durationMin: z.number().min(0).nullable(),
  notes: z.string().nullable(),
  rpe: z.number().min(1).max(10).nullable(),
});
export type WorkoutLogDTO = z.infer<typeof zWorkoutLog>;

export const zStrengthEntryInput = zStrengthEntry.partial({
  muscles: true,
  plannedSets: true,
  plannedReps: true,
  plannedRIR: true,
  source: true,
  skipped: true,
  metric: true,
});
export const zCardioEntryInput = z.object({
  segments: z.array(zCardioSegment).min(1),
  targetKm: z.number().min(0).optional(),
  targetMin: z.number().min(0).optional(),
});
export const zCompleteWorkoutInput = z.object({
  strength: z.array(zStrengthEntryInput).default([]),
  run: zCardioEntryInput.nullable().default(null),
  swim: zCardioEntryInput.nullable().default(null),
  durationMin: z.number().min(0).max(600).nullable().default(null),
  notes: z.string().max(500).nullable().default(null),
  rpe: z.number().min(1).max(10).nullable().default(null),
});
export type CompleteWorkoutInput = z.infer<typeof zCompleteWorkoutInput>;
export const zUpdateWorkoutInput = zCompleteWorkoutInput.partial();

export const zScheduleEntry = z.object({
  dateKey: z.string(),
  weekday: z.number().int().min(0).max(6),
  isToday: z.boolean(),
  day: zDay.nullable(),
  status: z.enum(["done", "skipped", "today", "upcoming", "past"]),
  logId: zId.nullable(),
});
export type ScheduleEntry = z.infer<typeof zScheduleEntry>;

export const zVolumeStatus = z.enum(["under", "in", "over", "none"]);
export const zMuscleVolume = z.object({
  key: z.string(),
  name: z.string(),
  done: z.number(),
  target: z.object({ min: z.number().optional(), max: z.number() }),
  status: zVolumeStatus,
});
export type MuscleVolume = z.infer<typeof zMuscleVolume>;

export const zProgramView = z.object({
  program: zProgram,
  current: z.object({ index: z.number().int(), day: zDay }),
  todayLog: zWorkoutLog.nullable(),
  schedule: z.array(zScheduleEntry),
  weeklyVolume: z.array(zMuscleVolume),
});
export type ProgramView = z.infer<typeof zProgramView>;

export const zRecoveryStatus = z.enum(["fatigued", "recovering", "ready"]);
export type RecoveryStatus = z.infer<typeof zRecoveryStatus>;
export const zMuscleReadiness = z.object({
  key: z.string(),
  name: z.string(),
  short: z.string(),
  size: z.enum(["large", "small"]),
  color: z.string(),
  fullRecoveryHours: z.number(),
  readiness: z.number().min(0).max(100),
  status: zRecoveryStatus,
  lastTrainedAt: zIso.nullable(),
  hoursSince: z.number().nullable(),
  hoursToFull: z.number().nullable(),
  residualSets: z.number(),
  weeklySets: z.number(),
  weeklyTarget: z.object({ min: z.number().optional(), max: z.number() }),
});
export type MuscleReadiness = z.infer<typeof zMuscleReadiness>;
export const zRecoveryView = z.object({
  muscles: z.array(zMuscleReadiness),
  overall: z.object({
    readiness: z.number(),
    status: zRecoveryStatus,
    readyCount: z.number().int(),
    fatiguedCount: z.number().int(),
  }),
  generatedAt: zIso,
});
export type RecoveryView = z.infer<typeof zRecoveryView>;

export const zTrainingStats = z.object({
  weeks: z.array(
    z.object({
      weekKey: z.string(),
      sessions: z.number().int(),
      sets: z.number(),
      cardioKm: z.number(),
      volumeByMuscle: z.record(z.string(), z.number()),
    })
  ),
  streakDays: z.number().int(),
  totalSessions: z.number().int(),
});
export type TrainingStats = z.infer<typeof zTrainingStats>;
