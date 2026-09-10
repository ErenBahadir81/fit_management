import { z } from "zod";
import { zGoalProfile, zIso, zMood, zOnTrack, zWeekday } from "./common";
import { zGoalProgress } from "./goal";
import { zDay, zMuscleVolume, zRecoveryStatus, zWorkoutLog } from "./program";
import { zUser } from "./user";

export const zMascotMessage = z.object({ mood: zMood, text: z.string(), key: z.string() });
export type MascotMessage = z.infer<typeof zMascotMessage>;

export const zReportDay = z.object({
  dateKey: z.string(),
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  logged: z.boolean(),
  deficit: z.number(),
});

export const zWeeklyReport = z.object({
  weekKey: z.string(),
  startKey: z.string(),
  endKey: z.string(),
  dayIndexToday: z.number().int().min(0).max(6).nullable(),
  isCurrent: z.boolean(),
  measurementDay: zWeekday,
  generatedAt: zIso,
  goal: z
    .object({
      targetBodyFatPct: z.number(),
      profile: zGoalProfile,
      weekIndexInPlan: z.number().int(),
      plannedDailyTarget: z.number(),
      plannedWeeklyDeficit: z.number(),
      tdeeUsed: z.number(),
      expectedWeightEnd: z.number(),
      expectedBfEnd: z.number(),
    })
    .nullable(),
  nutrition: z.object({
    daysLogged: z.number().int(),
    avgKcal: z.number(),
    totalKcal: z.number(),
    targetKcal: z.number(),
    avgProtein: z.number(),
    proteinTarget: z.number(),
    deficitBankedKcal: z.number(),
    deficitPlannedKcal: z.number(),
    deficitPct: z.number(),
    fatEquivalentKg: z.number(),
    days: z.array(zReportDay),
  }),
  body: z.object({
    weightStart: z.number().nullable(),
    weightEnd: z.number().nullable(),
    weightDelta: z.number().nullable(),
    ewmaStart: z.number().nullable(),
    ewmaEnd: z.number().nullable(),
    ewmaDelta: z.number().nullable(),
    expectedDelta: z.number().nullable(),
    bodyFatStart: z.number().nullable(),
    bodyFatEnd: z.number().nullable(),
    waistStart: z.number().nullable(),
    waistEnd: z.number().nullable(),
    weighInDays: z.number().int(),
    hasMeasurement: z.boolean(),
  }),
  training: z.object({
    sessions: z.number().int(),
    plannedSessions: z.number().int(),
    offDays: z.number().int(),
    sets: z.number(),
    cardioKm: z.number(),
    volumeByMuscle: z.array(zMuscleVolume),
  }),
  goalDistance: z
    .object({
      kgToGo: z.number(),
      bfToGo: z.number(),
      weeksRemainingPlan: z.number().int(),
      weeksRemainingProjected: z.number().nullable(),
      percentComplete: z.number(),
      onTrack: zOnTrack,
      projectedDate: z.string().nullable(),
    })
    .nullable(),
  score: z.number().min(0).max(100),
  highlights: z.array(z.string()),
  mascot: zMascotMessage,
});
export type WeeklyReportDTO = z.infer<typeof zWeeklyReport>;

export const zWeeklyReportSummary = z.object({
  weekKey: z.string(),
  score: z.number(),
  avgKcal: z.number(),
  daysLogged: z.number().int(),
  deficitBankedKcal: z.number(),
  ewmaDelta: z.number().nullable(),
  sessions: z.number().int(),
  bodyFatEnd: z.number().nullable(),
  weightEnd: z.number().nullable(),
  onTrack: zOnTrack.nullable(),
});
export type WeeklyReportSummary = z.infer<typeof zWeeklyReportSummary>;

export const zHome = z.object({
  user: zUser,
  today: z.object({
    dateKey: z.string(),
    weekday: zWeekday,
    workout: z.object({ day: zDay.nullable(), log: zWorkoutLog.nullable(), programName: z.string().nullable() }),
    calories: z.object({ target: z.number(), eaten: z.number(), remaining: z.number() }),
    protein: z.object({ target: z.number(), eaten: z.number() }),
    weighedIn: z.boolean(),
  }),
  recovery: z.object({
    readiness: z.number(),
    status: zRecoveryStatus,
    readyCount: z.number().int(),
    fatiguedCount: z.number().int(),
    top: z.array(z.object({ key: z.string(), name: z.string(), readiness: z.number(), status: zRecoveryStatus, color: z.string() })),
  }),
  goal: zGoalProgress.nullable(),
  week: z.object({
    weekKey: z.string(),
    dayIndex: z.number().int(),
    deficitBankedKcal: z.number(),
    deficitPlannedKcal: z.number(),
    onTrack: zOnTrack.nullable(),
    score: z.number(),
  }),
  streaks: z.object({ workout: z.number().int(), logging: z.number().int(), weighIn: z.number().int() }),
  mascot: zMascotMessage,
});
export type HomeDTO = z.infer<typeof zHome>;
