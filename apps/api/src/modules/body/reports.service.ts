/**
 * Weekly reports and the home composite. One query per collection per request, all in parallel;
 * the report itself is built by the pure `buildWeeklyReport` in `@fitfloow/core`.
 */
import { Types } from "mongoose";
import {
  buildWeeklyReport,
  computeGoalProgress,
  computeRecovery,
  homeMascotKey,
  previousWeekKeys,
  shiftKey,
  summarizeWeeklyReport,
  trDateKey,
  trWeekday,
  weekKeyFor,
  weekRange,
  type BodyPoint,
  type DayIntake,
  type GoalSettings,
  type HomeDTO,
  type MascotTemplate,
  type MuscleDTO,
  type ReportWorkoutLog,
  type WeeklyReportDTO,
  type WeeklyReportSummary,
  type WeightPoint,
  type Weekday,
} from "@fitfloow/core";
import type { AppContext } from "../../context";
import { BodyEntry, WeighIn, type BodyEntryDoc } from "../../models/body";
import { Goal, WeeklyReportCache, toGoalDTO, type GoalDoc } from "../../models/goal";
import { listActiveMuscles } from "../../models/muscle";
import { DietTarget } from "../../models/nutrition";
import { Program, type ProgramDoc } from "../../models/program";
import { WorkoutLog, toWorkoutLogDTO, type WorkoutLogDoc } from "../../models/workoutLog";
import { toUserDTO } from "../../models/user";
import { dayIntakeFor, goalSettings, loadUser, mascotCatalog, mascotFor, plannedSessionsForProgram, type UserLean } from "./shared";

/** Weigh-in history kept before the window so the EWMA does not restart at the week boundary. */
const EWMA_LOOKBACK_DAYS = 120;
export const MAX_HISTORY_WEEKS = 26;

interface ReportBundle {
  user: UserLean;
  settings: GoalSettings;
  goal: GoalDoc | null;
  weighIns: WeightPoint[];
  bodyEntries: BodyPoint[];
  logs: ReportWorkoutLog[];
  dayIntake: DayIntake[];
  muscles: MuscleDTO[];
  catalog: MascotTemplate[];
  plannedSessions: number;
  program: ProgramDoc | null;
  /** Raw logs kept for the shared recovery engine, which needs the exact timestamps. */
  rawLogs: WorkoutLogDoc[];
}

function toReportLog(l: WorkoutLogDoc): ReportWorkoutLog {
  return {
    dateKey: l.dateKey,
    isOffDay: l.isOffDay,
    kind: l.kind,
    strength: (l.strength ?? []).map((e) => ({ muscles: e.muscles ?? [], sets: e.sets ?? [], skipped: e.skipped })),
    run: l.run ? { totalKm: l.run.totalKm } : null,
    swim: l.swim ? { totalKm: l.swim.totalKm } : null,
  };
}

/** Everything the report builder needs for `[fromKey, toKey]`, in one round trip per collection. */
async function loadReportBundle(user: UserLean, fromKey: string, toKey: string): Promise<ReportBundle> {
  const userId = user._id;
  const [settings, goal, weighIns, bodyEntries, logs, dayIntake, muscles, catalog, program] = await Promise.all([
    goalSettings(),
    Goal.findOne({ userId, "start.dateKey": { $lte: toKey } }).sort({ status: 1, createdAt: -1 }).lean<GoalDoc>(),
    WeighIn.find({ userId, dateKey: { $gte: shiftKey(fromKey, -EWMA_LOOKBACK_DAYS), $lte: toKey } }).sort({ dateKey: 1 }).lean(),
    BodyEntry.find({ userId, dateKey: { $gte: shiftKey(fromKey, -EWMA_LOOKBACK_DAYS), $lte: toKey } }).sort({ date: 1 }).lean<BodyEntryDoc[]>(),
    WorkoutLog.find({ userId, dateKey: { $gte: fromKey, $lte: toKey } }).sort({ date: 1 }).lean<WorkoutLogDoc[]>(),
    dayIntakeFor(userId, fromKey, toKey),
    listActiveMuscles(),
    mascotCatalog(),
    Program.findOne({ userId }).lean<ProgramDoc>(),
  ]);

  return {
    user,
    settings,
    goal: goal ?? null,
    weighIns: weighIns.map((w) => ({ dateKey: w.dateKey, weightKg: w.weightKg })),
    bodyEntries: bodyEntries.map((e) => ({ dateKey: e.dateKey, weightKg: e.weightKg, bodyFatPct: e.bodyFatPct, waistCm: e.waistCm })),
    logs: logs.map(toReportLog),
    dayIntake,
    muscles,
    catalog,
    plannedSessions: plannedSessionsForProgram(program),
    program: program ?? null,
    rawLogs: logs,
  };
}

function buildFromBundle(b: ReportBundle, weekKey: string, todayKey: string, now: Date): WeeklyReportDTO {
  return buildWeeklyReport({
    weekKey,
    todayKey,
    measurementDay: (b.user.measurementDay ?? 0) as Weekday,
    goal: b.goal ? toGoalDTO(b.goal) : null,
    weighIns: b.weighIns,
    bodyEntries: b.bodyEntries,
    logs: b.logs,
    dayIntake: b.dayIntake,
    plannedSessions: b.plannedSessions,
    muscles: b.muscles,
    settings: b.settings,
    catalog: b.catalog,
    seed: String(b.user._id),
    generatedAt: now.toISOString(),
    displayName: b.user.displayName,
  });
}

async function cacheReport(userId: Types.ObjectId, report: WeeklyReportDTO): Promise<void> {
  await WeeklyReportCache.updateOne(
    { userId, weekKey: report.weekKey },
    { $set: { report, generatedAt: new Date(report.generatedAt) }, $setOnInsert: { userId, weekKey: report.weekKey } },
    { upsert: true }
  );
}

/**
 * Weekly report for one user. Exported for B1's admin user overview (imported dynamically there).
 * `weekKey` is snapped to the user's measurement day; omit it for the current week.
 */
export async function buildWeeklyReportForUser(userId: string, weekKey?: string, now: Date = new Date()): Promise<WeeklyReportDTO> {
  const user = await loadUser(userId);
  const todayKey = trDateKey(now);
  const week = weekKeyFor(weekKey ?? todayKey, (user.measurementDay ?? 0) as Weekday);
  const { startKey, endKey } = weekRange(week);
  const bundle = await loadReportBundle(user, startKey, endKey > todayKey ? endKey : todayKey);
  return buildFromBundle(bundle, week, todayKey, now);
}

/** Cached read-through: the cache doc is dropped by every writer touching the week. */
export async function weeklyReport(ctx: AppContext, userId: string, weekKey?: string): Promise<WeeklyReportDTO> {
  const user = await loadUser(userId);
  const now = ctx.now();
  const todayKey = trDateKey(now);
  const week = weekKeyFor(weekKey ?? todayKey, (user.measurementDay ?? 0) as Weekday);

  const cached = await WeeklyReportCache.findOne({ userId: user._id, weekKey: week }).lean();
  if (cached?.report) return cached.report as WeeklyReportDTO;

  const { startKey, endKey } = weekRange(week);
  const bundle = await loadReportBundle(user, startKey, endKey > todayKey ? endKey : todayKey);
  const report = buildFromBundle(bundle, week, todayKey, now);
  await cacheReport(user._id, report);
  return report;
}

/** Newest `limit` weeks (chronological), building and caching the ones that are missing. */
export async function weeklyHistory(ctx: AppContext, userId: string, limit: number): Promise<WeeklyReportSummary[]> {
  const user = await loadUser(userId);
  const now = ctx.now();
  const todayKey = trDateKey(now);
  const currentWeek = weekKeyFor(todayKey, (user.measurementDay ?? 0) as Weekday);
  const weeks = previousWeekKeys(currentWeek, Math.min(limit, MAX_HISTORY_WEEKS), true).reverse();

  const cached = await WeeklyReportCache.find({ userId: user._id, weekKey: { $in: weeks } }).lean();
  const byWeek = new Map(cached.map((c) => [c.weekKey, c.report as WeeklyReportDTO]));
  const missing = weeks.filter((w) => !byWeek.has(w));

  if (missing.length > 0) {
    const bundle = await loadReportBundle(user, missing[0], weekRange(missing[missing.length - 1]).endKey);
    const fresh: WeeklyReportDTO[] = missing.map((w) => buildFromBundle(bundle, w, todayKey, now));
    await Promise.all(fresh.map((r) => cacheReport(user._id, r)));
    for (const r of fresh) byWeek.set(r.weekKey, r);
  }
  return weeks.map((w) => summarizeWeeklyReport(byWeek.get(w)!));
}

/* --------------------------------- home ---------------------------------- */

function streakFrom(has: (key: string) => boolean, todayKey: string, maxDays = 60): number {
  let count = 0;
  const start = has(todayKey) ? 0 : 1; // today may simply not have happened yet
  for (let i = start; i < maxDays; i++) {
    if (!has(shiftKey(todayKey, -i))) break;
    count++;
  }
  return count;
}

export async function homeView(ctx: AppContext, userId: string): Promise<HomeDTO> {
  const user = await loadUser(userId);
  const now = ctx.now();
  const todayKey = trDateKey(now);
  const measurementDay = (user.measurementDay ?? 0) as Weekday;
  const weekKey = weekKeyFor(todayKey, measurementDay);
  const { startKey } = weekRange(weekKey);
  const fromKey = shiftKey(todayKey, -30) < startKey ? shiftKey(todayKey, -30) : startKey;

  const [bundle, dietTarget, todayLog] = await Promise.all([
    loadReportBundle(user, fromKey, todayKey),
    DietTarget.findOne({ userId: user._id }).lean(),
    WorkoutLog.findOne({ userId: user._id, dateKey: todayKey }).sort({ createdAt: -1 }).lean<WorkoutLogDoc>(),
  ]);
  const program = bundle.program;

  const report = buildFromBundle(bundle, weekKey, todayKey, now);
  const goalDto = bundle.goal && bundle.goal.status === "active" ? toGoalDTO(bundle.goal) : null;
  const progress = goalDto
    ? computeGoalProgress(goalDto, bundle.weighIns, bundle.bodyEntries, bundle.dayIntake, todayKey, bundle.settings)
    : null;

  /* today's plate */
  const today = bundle.dayIntake.find((d) => d.dateKey === todayKey) ?? null;
  const planWeek = progress?.currentWeek ?? goalDto?.plan.roadmap[0] ?? null;
  const manual = dietTarget && dietTarget.mode === "manual" ? dietTarget : null;
  const calorieTarget = manual ? manual.calories : (planWeek?.dailyCalorieTarget ?? dietTarget?.calories ?? 0);
  const proteinTarget = manual ? manual.protein : (planWeek?.macros.protein ?? dietTarget?.protein ?? 0);
  const eaten = Math.round(today?.kcal ?? 0);
  const proteinEaten = Math.round((today?.protein ?? 0) * 10) / 10;

  /* program day + recovery */
  const day = program && program.days.length > 0 ? program.days[Math.min(program.currentIndex, program.days.length - 1)] : null;
  const recoveryView = computeRecovery(bundle.rawLogs, bundle.muscles, now);
  const recovery = {
    ...recoveryView.overall,
    // Least recovered first: that is what the home screen has to warn about.
    top: [...recoveryView.muscles]
      .sort((a, b) => a.readiness - b.readiness)
      .slice(0, 3)
      .map((m) => ({ key: m.key, name: m.name, readiness: m.readiness, status: m.status, color: m.color })),
  };

  /* streaks */
  const logDays = new Set(bundle.logs.map((l) => l.dateKey));
  const mealDays = new Set(bundle.dayIntake.filter((d) => (d.entries ?? 0) > 0).map((d) => d.dateKey));
  const weighDays = new Set(bundle.weighIns.map((w) => w.dateKey));

  const workoutDone = Boolean(todayLog && !todayLog.isOffDay);
  const isRestDay = day?.kind === "rest";
  const hasAnyData = bundle.weighIns.length > 0 || bundle.logs.length > 0 || bundle.dayIntake.length > 0 || bundle.bodyEntries.length > 0;
  const key = homeMascotKey({
    hasAnyData,
    workoutDone,
    isRestDay,
    workoutDue: Boolean(day) && !todayLog && !isRestDay,
    caloriesRemaining: calorieTarget > 0 ? calorieTarget - eaten : null,
    caloriesEaten: eaten,
    hourTR: (now.getUTCHours() + 3) % 24,
  });
  const mascot = mascotFor(
    key,
    bundle.catalog,
    {
      name: user.displayName,
      kcal: Math.abs(Math.round(calorieTarget - eaten)),
      day: day?.title ?? "",
      sessions: report.training.sessions,
      streak: streakFrom((k) => weighDays.has(k), todayKey),
      muscle: recovery.top[0]?.name ?? "",
      pct: goalDto?.targetBodyFatPct ?? "",
      weeks: progress?.weeksRemainingPlan ?? "",
    },
    String(user._id),
    todayKey,
    user.mascotEnabled
  );

  return {
    user: toUserDTO(user),
    today: {
      dateKey: todayKey,
      weekday: trWeekday(now),
      workout: { day, log: todayLog ? toWorkoutLogDTO(todayLog) : null, programName: program?.name ?? null },
      calories: { target: calorieTarget, eaten, remaining: Math.round(calorieTarget - eaten) },
      protein: { target: proteinTarget, eaten: proteinEaten },
      weighedIn: weighDays.has(todayKey),
    },
    recovery,
    goal: progress,
    week: {
      weekKey,
      dayIndex: report.dayIndexToday ?? 0,
      deficitBankedKcal: report.nutrition.deficitBankedKcal,
      deficitPlannedKcal: report.nutrition.deficitPlannedKcal,
      onTrack: report.goalDistance?.onTrack ?? null,
      score: report.score,
    },
    streaks: {
      workout: streakFrom((k) => logDays.has(k), todayKey),
      logging: streakFrom((k) => mealDays.has(k), todayKey),
      weighIn: streakFrom((k) => weighDays.has(k), todayKey),
    },
    mascot,
  };
}
