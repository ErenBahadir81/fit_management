/**
 * Weekly report builder (docs/plan/06-weekly-report.md). Pure: the API hands it plain rows,
 * it returns the DTO. The week starts on the user's measurement day; a live week only counts
 * the days that have actually happened.
 */
import { computeGoalProgress, ewmaAt, ewmaTrend, type BodyPoint, type DayIntake, type WeightPoint } from "../goal/index";
import type { MascotTemplate } from "../mascot/catalog";
import type { GoalDTO, RoadmapWeek } from "../schemas/goal";
import type { MuscleVolume } from "../schemas/program";
import type { WeeklyReportDTO, WeeklyReportSummary } from "../schemas/report";
import type { GoalSettings } from "../schemas/settings";
import { dayIndexInWeek, daysBetween, shiftKey, weekRange, type Weekday } from "../time/index";
import { clamp, round } from "../utils/index";
import { reportMascotKey, selectMascotMessage } from "./mascot";
import { computeWeekScore } from "./score";

export interface ReportStrengthEntry {
  muscles: Array<{ key: string; load: number }>;
  sets: unknown[];
  skipped?: boolean;
}

export interface ReportWorkoutLog {
  dateKey: string;
  isOffDay: boolean;
  kind: string;
  strength: ReportStrengthEntry[];
  run: { totalKm: number } | null;
  swim: { totalKm: number } | null;
}

export interface ReportMuscle {
  key: string;
  name: string;
  weeklyTarget: { min?: number; max: number };
}

export interface WeeklyReportContext {
  weekKey: string;
  todayKey: string;
  measurementDay: Weekday;
  goal: GoalDTO | null;
  /** Full weigh-in history (the EWMA needs continuity across week boundaries). */
  weighIns: WeightPoint[];
  bodyEntries: BodyPoint[];
  logs: ReportWorkoutLog[];
  dayIntake: DayIntake[];
  /** Program sessions expected in a 7-day week. */
  plannedSessions: number;
  muscles: ReportMuscle[];
  settings: GoalSettings;
  catalog: MascotTemplate[];
  /** Stable per-user seed for the mascot variant (e.g. `userId|weekKey`). */
  seed: string;
  generatedAt: string;
  displayName?: string;
}

function volumeStatus(done: number, target: { min?: number; max: number }): MuscleVolume["status"] {
  if (done <= 0) return "none";
  if (target.min !== undefined && done < target.min) return "under";
  if (target.max > 0 && done > target.max) return "over";
  return "in";
}

export function buildWeeklyReport(ctx: WeeklyReportContext): WeeklyReportDTO {
  const { weekKey, todayKey, measurementDay, goal, settings } = ctx;
  const { startKey, endKey, keys } = weekRange(weekKey);
  const dayIndexToday = dayIndexInWeek(todayKey, weekKey);
  const isCurrent = dayIndexToday !== null;
  const isPast = todayKey > endKey;
  const daysElapsed = isCurrent ? dayIndexToday + 1 : isPast ? 7 : 0;
  const asOfKey = isCurrent ? todayKey : isPast ? endKey : startKey;

  /* ------------------------------- goal ------------------------------- */
  const activeGoal = goal && endKey >= goal.start.dateKey ? goal : null;
  let planWeek: RoadmapWeek | null = null;
  if (activeGoal && activeGoal.plan.roadmap.length > 0) {
    const offset = daysBetween(activeGoal.plan.startKey || activeGoal.start.dateKey, startKey);
    const i = clamp(Math.floor(Math.max(0, offset) / 7), 0, activeGoal.plan.roadmap.length - 1);
    planWeek = activeGoal.plan.roadmap[i];
  }
  const tdeeUsed = planWeek ? planWeek.dailyCalorieTarget + planWeek.weeklyDeficitKcal / 7 : (activeGoal?.plan.tdee ?? 0);
  const targetKcal = planWeek ? planWeek.dailyCalorieTarget : (activeGoal?.plan.initialDailyCalorieTarget ?? 0);
  const proteinTarget = planWeek ? planWeek.macros.protein : (activeGoal?.plan.macros.protein ?? 0);
  const plannedWeeklyDeficit = planWeek ? planWeek.weeklyDeficitKcal : 0;

  const goalBlock = activeGoal
    ? {
        targetBodyFatPct: activeGoal.targetBodyFatPct,
        profile: activeGoal.profile,
        weekIndexInPlan: planWeek ? planWeek.weekIndex : 0,
        plannedDailyTarget: targetKcal,
        plannedWeeklyDeficit,
        tdeeUsed: round(tdeeUsed, 0),
        expectedWeightEnd: planWeek ? planWeek.endWeightKg : activeGoal.start.weightKg,
        expectedBfEnd: planWeek ? planWeek.endBfPct : activeGoal.start.bodyFatPct,
      }
    : null;

  /* ----------------------------- nutrition ---------------------------- */
  const intakeByKey = new Map(ctx.dayIntake.map((d) => [d.dateKey, d]));
  const days = keys.map((dateKey, i) => {
    const d = intakeByKey.get(dateKey);
    const logged = Boolean(d && (d.entries ?? (d.kcal > 0 ? 1 : 0)) > 0) && i < daysElapsed;
    return {
      dateKey,
      kcal: round(d?.kcal ?? 0, 0),
      protein: round(d?.protein ?? 0, 1),
      carbs: round(d?.carbs ?? 0, 1),
      fat: round(d?.fat ?? 0, 1),
      logged,
      deficit: logged ? round(tdeeUsed - (d?.kcal ?? 0), 0) : 0,
    };
  });
  const loggedDays = days.filter((d) => d.logged);
  const totalKcal = loggedDays.reduce((a, d) => a + d.kcal, 0);
  const deficitBankedKcal = loggedDays.reduce((a, d) => a + d.deficit, 0);
  const deficitPlannedKcal = round((plannedWeeklyDeficit * daysElapsed) / 7, 0);
  const fatEquivalentKg = deficitBankedKcal / settings.kcalPerKgFat;
  const nutrition = {
    daysLogged: loggedDays.length,
    avgKcal: loggedDays.length === 0 ? 0 : round(totalKcal / loggedDays.length, 0),
    totalKcal: round(totalKcal, 0),
    targetKcal,
    avgProtein: loggedDays.length === 0 ? 0 : round(loggedDays.reduce((a, d) => a + d.protein, 0) / loggedDays.length, 1),
    proteinTarget,
    deficitBankedKcal: round(deficitBankedKcal, 0),
    deficitPlannedKcal,
    deficitPct: deficitPlannedKcal > 0 ? round((deficitBankedKcal / deficitPlannedKcal) * 100, 0) : 0,
    fatEquivalentKg: round(fatEquivalentKg, 3),
    days,
  };

  /* -------------------------------- body ------------------------------ */
  const usableWeighIns = ctx.weighIns.filter((w) => w.dateKey <= asOfKey);
  const trend = ewmaTrend(usableWeighIns, settings.ewma);
  const weekWeighIns = usableWeighIns.filter((w) => w.dateKey >= startKey && w.dateKey <= endKey).sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
  const weekBody = ctx.bodyEntries
    .filter((b) => b.dateKey >= startKey && b.dateKey <= asOfKey)
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
  const ewmaStart = ewmaAt(trend, startKey);
  const ewmaEnd = ewmaAt(trend, asOfKey < endKey ? asOfKey : endKey);
  const firstWaist = weekBody.find((b) => b.waistCm != null)?.waistCm ?? null;
  const lastWaist = [...weekBody].reverse().find((b) => b.waistCm != null)?.waistCm ?? null;
  const body = {
    weightStart: weekWeighIns[0]?.weightKg ?? null,
    weightEnd: weekWeighIns.at(-1)?.weightKg ?? null,
    weightDelta:
      weekWeighIns.length >= 2 ? round(weekWeighIns[weekWeighIns.length - 1].weightKg - weekWeighIns[0].weightKg, 2) : null,
    ewmaStart: ewmaStart === null ? null : round(ewmaStart, 2),
    ewmaEnd: ewmaEnd === null ? null : round(ewmaEnd, 2),
    ewmaDelta: ewmaStart === null || ewmaEnd === null ? null : round(ewmaEnd - ewmaStart, 2),
    expectedDelta: planWeek ? round(planWeek.endWeightKg - planWeek.startWeightKg, 2) : null,
    bodyFatStart: weekBody[0]?.bodyFatPct ?? null,
    bodyFatEnd: weekBody.at(-1)?.bodyFatPct ?? null,
    waistStart: firstWaist,
    waistEnd: lastWaist,
    weighInDays: weekWeighIns.length,
    hasMeasurement: weekBody.length > 0,
  };

  /* ------------------------------ training ---------------------------- */
  const weekLogs = ctx.logs.filter((l) => l.dateKey >= startKey && l.dateKey <= endKey);
  let sets = 0;
  let cardioKm = 0;
  const volumeMap = new Map<string, number>();
  for (const log of weekLogs) {
    for (const e of log.strength ?? []) {
      if (e.skipped) continue;
      const n = e.sets?.length ?? 0;
      sets += n;
      for (const m of e.muscles ?? []) volumeMap.set(m.key, (volumeMap.get(m.key) ?? 0) + n * (m.load ?? 1));
    }
    cardioKm += (log.run?.totalKm ?? 0) + (log.swim?.totalKm ?? 0);
  }
  const training = {
    sessions: weekLogs.filter((l) => !l.isOffDay && l.kind !== "rest").length,
    plannedSessions: ctx.plannedSessions,
    offDays: weekLogs.filter((l) => l.isOffDay).length,
    sets: round(sets, 1),
    cardioKm: round(cardioKm, 2),
    volumeByMuscle: ctx.muscles.map<MuscleVolume>((m) => {
      const done = round(volumeMap.get(m.key) ?? 0, 1);
      return { key: m.key, name: m.name, done, target: m.weeklyTarget, status: volumeStatus(done, m.weeklyTarget) };
    }),
  };

  /* --------------------------- goal distance -------------------------- */
  const progress = activeGoal ? computeGoalProgress(activeGoal, ctx.weighIns, ctx.bodyEntries, ctx.dayIntake, asOfKey, settings) : null;
  const goalDistance = progress
    ? {
        kgToGo: progress.kgToGo,
        bfToGo: progress.bfToGo,
        weeksRemainingPlan: progress.weeksRemainingPlan,
        weeksRemainingProjected: progress.weeksRemainingProjected,
        percentComplete: progress.percentComplete,
        onTrack: progress.onTrack,
        projectedDate: progress.projectedDate,
      }
    : null;

  /* ------------------------------- score ------------------------------ */
  const { score } = computeWeekScore({
    deficitBankedKcal,
    deficitPlannedKcal,
    daysLogged: nutrition.daysLogged,
    daysElapsed,
    sessions: training.sessions,
    plannedSessions: (ctx.plannedSessions * daysElapsed) / 7,
    weighInDays: body.weighInDays,
  });

  const partial: WeeklyReportDTO = {
    weekKey,
    startKey,
    endKey,
    dayIndexToday,
    isCurrent,
    measurementDay,
    generatedAt: ctx.generatedAt,
    goal: goalBlock,
    nutrition,
    body,
    training,
    goalDistance,
    score,
    highlights: [],
    mascot: { key: "report.empty", mood: "sleepy", text: "" },
  };

  partial.highlights = buildHighlights(partial, daysElapsed);
  const key = reportMascotKey(partial);
  partial.mascot = selectMascotMessage(
    key,
    ctx.catalog,
    {
      name: ctx.displayName ?? "",
      score,
      sessions: training.sessions,
      kcal: Math.abs(nutrition.deficitBankedKcal),
      kg: Math.abs(round(nutrition.fatEquivalentKg, 2)),
      pct: activeGoal?.targetBodyFatPct ?? "",
      weeks: progress?.weeksRemainingPlan ?? "",
      streak: body.weighInDays,
    },
    `${ctx.seed}|${weekKey}`
  );
  return partial;
}

/** Short Turkish sentences the report hero shows under the score. */
export function buildHighlights(r: WeeklyReportDTO, daysElapsed: number): string[] {
  const out: string[] = [];
  const n = (v: number, d = 0) => String(round(v, d));

  if (r.training.plannedSessions > 0) {
    out.push(`Planlanan ${r.training.plannedSessions} antrenmanın ${r.training.sessions} tanesini tamamladın.`);
  } else if (r.training.sessions > 0) {
    out.push(`Bu hafta ${r.training.sessions} antrenman yaptın.`);
  }

  if (r.nutrition.deficitBankedKcal > 0) {
    out.push(`${n(r.nutrition.deficitBankedKcal)} kcal açık biriktirdin — yaklaşık ${n(r.nutrition.fatEquivalentKg, 2)} kg yağ.`);
  } else if (r.nutrition.deficitBankedKcal < 0) {
    out.push(`Bu hafta hedefin ${n(Math.abs(r.nutrition.deficitBankedKcal))} kcal üstünde kaldın.`);
  }

  if (daysElapsed > 0) out.push(`${r.nutrition.daysLogged}/${daysElapsed} gün beslenme kaydı girdin.`);

  if (r.body.ewmaDelta !== null) {
    const d = r.body.ewmaDelta;
    out.push(d <= 0 ? `Trend kilon ${n(Math.abs(d), 2)} kg düştü.` : `Trend kilon ${n(d, 2)} kg arttı.`);
  } else if (r.body.weighInDays === 0 && daysElapsed > 0) {
    out.push("Bu hafta hiç tartılmadın — trend için tartı şart.");
  }

  const under = r.training.volumeByMuscle.filter((m) => m.status === "under").slice(0, 2);
  for (const m of under) out.push(`${m.name} hacmi hedefin altında (${n(m.done, 1)}/${n(m.target.min ?? m.target.max, 0)} set).`);

  return out.slice(0, 5);
}

export function summarizeWeeklyReport(r: WeeklyReportDTO): WeeklyReportSummary {
  return {
    weekKey: r.weekKey,
    score: r.score,
    avgKcal: r.nutrition.avgKcal,
    daysLogged: r.nutrition.daysLogged,
    deficitBankedKcal: r.nutrition.deficitBankedKcal,
    ewmaDelta: r.body.ewmaDelta,
    sessions: r.training.sessions,
    bodyFatEnd: r.body.bodyFatEnd,
    weightEnd: r.body.ewmaEnd ?? r.body.weightEnd,
    onTrack: r.goalDistance?.onTrack ?? null,
  };
}
