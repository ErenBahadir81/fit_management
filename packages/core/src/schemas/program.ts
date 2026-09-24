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

/**
 * Stable day id. The pointer, logs and the editor all refer to a day by id — never by position —
 * so reordering or deleting days can't move "today" to a different day (B5).
 */
export const zDayId = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/, "gün kimliği");

export const zDay = z.object({
  id: zDayId,
  order: z.number().int().min(1),
  title: z.string().min(1),
  focus: z.string().default(""),
  kind: zDayKind,
  exercises: z.array(zExerciseTarget),
  run: zCardioTarget.nullable(),
  swim: zCardioTarget.nullable(),
});
export type DayDTO = z.infer<typeof zDay>;

/**
 * `cycle`  — N days that repeat independently of the calendar (e.g. idman · koşu · mola).
 * `weekly` — exactly 7 days, Monday first; the calendar decides the day.
 */
export const zProgramMode = z.enum(["cycle", "weekly"]);
export type ProgramMode = z.infer<typeof zProgramMode>;

export const zProgram = z.object({
  id: zId,
  name: z.string(),
  mode: zProgramMode,
  days: z.array(zDay),
  /** The next day to do (cycle mode). "Next = the one after the last day actually done." */
  currentDayId: zDayId.nullable(),
  /** Position of `currentDayId` in `days` — derived, kept for older clients. */
  currentIndex: z.number().int().min(0),
  /** How many times the cycle has come round (weekly mode: weeks since the start). */
  cycleNumber: z.number().int().min(1),
  /** @deprecated alias of `cycleNumber`, kept for older clients. */
  weekNumber: z.number().int().min(1),
  startedAt: zIso,
  lastActionAt: zIso,
  sourceTemplateId: zId.nullable(),
});
export type ProgramDTO = z.infer<typeof zProgram>;

export const zDayInput = zDay.extend({
  id: zDayId.optional(),
  exercises: z.array(zExerciseTarget.partial({ metric: true, targetRIR: true, muscles: true })).default([]),
  run: zCardioTarget.nullable().default(null),
  swim: zCardioTarget.nullable().default(null),
});
export const zProgramInput = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  /** Omitted = keep the program's current mode. */
  mode: zProgramMode.optional(),
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
export const zSetEntry = z.object({
  reps: z.number().min(0).max(10000),
  rir: z.number().int().min(0).max(10).nullable(),
  /** Load in kg. `null` = bodyweight / not recorded. Absent in pre-2.1 logs. */
  weightKg: z.number().min(0).max(1000).nullable().default(null),
});
export type SetEntryDTO = z.infer<typeof zSetEntry>;

/**
 * "Last time you did this" (C1): the most recent logged instance of an exercise for the caller.
 * `{ dateKey: null, sets: [] }` is a valid answer — never a 404.
 */
export const zLastPerformance = z.object({ dateKey: z.string().nullable(), sets: z.array(zSetEntry) });
export type LastPerformance = z.infer<typeof zLastPerformance>;

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
  /** The program day that was actually done; `null` for a break and for pre-3.0 logs. */
  dayId: zDayId.nullable(),
  dayOrder: z.number().int().min(0),
  cycleNumber: z.number().int().min(1),
  /** @deprecated alias of `cycleNumber`. */
  weekNumber: z.number().int().min(1),
  /** A day off outside the plan: nothing done, the cycle did not move. A rest *day* is not a break. */
  isBreak: z.boolean(),
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

/**
 * The one pointer-moving operation: "today I did day `dayId`". Completing the planned day,
 * finishing a rest day and doing a different day than planned are all this call. The cycle then
 * continues from the day after `dayId`; `resumePlanned` instead keeps the day that was planned as
 * the next one ("İdmanı kaçırdım, sıraya geri koy").
 */
export const zLogDayInput = zCompleteWorkoutInput.extend({
  dayId: zDayId,
  resumePlanned: z.boolean().default(false),
});
export type LogDayInput = z.infer<typeof zLogDayInput>;

/**
 * Editing a logged session. Written out longhand rather than as `zCompleteWorkoutInput.partial()`
 * because `.partial()` keeps the `.default(...)`s: `{ rpe: 7 }` would come out as
 * `{ rpe: 7, strength: [], run: null, … }` and quietly erase the whole session. Here, a field the
 * client did not send stays `undefined` and the route leaves it alone.
 */
export const zUpdateWorkoutInput = z.object({
  strength: z.array(zStrengthEntryInput).optional(),
  run: zCardioEntryInput.nullable().optional(),
  swim: zCardioEntryInput.nullable().optional(),
  durationMin: z.number().min(0).max(600).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  rpe: z.number().min(1).max(10).nullable().optional(),
});
export type UpdateWorkoutInput = z.infer<typeof zUpdateWorkoutInput>;

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

/**
 * Weekly effective sets per muscle, banded (see `training/volumeBands.ts`):
 * none · low (<5) · maintain (5+) · grow (10+) · optimal (15+) · excessive (20+).
 */
export const zVolumeZone = z.enum(["none", "low", "maintain", "grow", "optimal", "excessive"]);
export type VolumeZone = z.infer<typeof zVolumeZone>;
/** `none` fine · `info` could be better · `warn` should change · `alert` injury territory. */
export const zVolumeSeverity = z.enum(["none", "info", "warn", "alert"]);
export type VolumeSeverity = z.infer<typeof zVolumeSeverity>;

export const zVolumeRating = z.object({
  zone: zVolumeZone,
  /** 0..1, continuous: how good this weekly volume is for growth (peaks across 10–18). */
  score: z.number().min(0).max(1),
  /** 0..1, continuous: overuse risk — ~0 at 18, small at 20, real from ~23, full at 25. */
  risk: z.number().min(0).max(1),
  severity: zVolumeSeverity,
});
export type VolumeRating = z.infer<typeof zVolumeRating>;

export const zMuscleVolume = z.object({
  key: z.string(),
  name: z.string(),
  done: z.number(),
  /** The recommended band (10–15 weekly effective sets). */
  target: z.object({ min: z.number().optional(), max: z.number() }),
  status: zVolumeStatus,
  zone: zVolumeZone.optional(),
  score: z.number().optional(),
  risk: z.number().optional(),
  severity: zVolumeSeverity.optional(),
});
export type MuscleVolume = z.infer<typeof zMuscleVolume>;

/** One muscle of a program's planned volume, normalized to a 7-day week. */
export const zPlannedMuscleVolume = zVolumeRating.extend({
  key: z.string(),
  name: z.string(),
  /** Σ targetSets × activation over one pass of the program's days. */
  perCycle: z.number(),
  /** `perCycle × 7 / cycleLength` — what the bands are applied to. */
  weekly: z.number(),
  /** Exercises feeding this muscle, biggest contribution first (weekly effective sets). */
  sources: z.array(z.object({ name: z.string(), sets: z.number() })),
});
export type PlannedMuscleVolume = z.infer<typeof zPlannedMuscleVolume>;

/** A ready-to-say hint for Floo / the editor. */
export const zVolumeAdvice = z.object({
  key: z.string(),
  name: z.string(),
  severity: zVolumeSeverity,
  kind: z.enum(["missing", "low", "maintain", "high", "excessive"]),
  weekly: z.number(),
  message: z.string(),
});
export type VolumeAdvice = z.infer<typeof zVolumeAdvice>;

export const zProgramVolume = z.object({
  cycleLength: z.number().int().min(0),
  muscles: z.array(zPlannedMuscleVolume),
  advice: z.array(zVolumeAdvice),
});
export type ProgramVolume = z.infer<typeof zProgramVolume>;

export const zProgramView = z.object({
  program: zProgram,
  current: z.object({ index: z.number().int(), day: zDay }),
  todayLog: zWorkoutLog.nullable(),
  schedule: z.array(zScheduleEntry),
  weeklyVolume: z.array(zMuscleVolume),
  /** The program's planned weekly volume per active muscle, banded, with advice. */
  plannedVolume: zProgramVolume,
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
      /** Load moved that week: Σ reps × weightKg. 0 for weeks logged before 2.1. */
      tonnageKg: z.number().default(0),
      volumeByMuscle: z.record(z.string(), z.number()),
    })
  ),
  streakDays: z.number().int(),
  totalSessions: z.number().int(),
});
export type TrainingStats = z.infer<typeof zTrainingStats>;
