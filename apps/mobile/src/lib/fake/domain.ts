/**
 * Core-backed goal / progress / report builders for the FakeApi (F4b).
 * The demo runs the *same* pure engines the API runs (`computeGoalPlan`, `computeGoalProgress`,
 * `buildWeeklyReport`, `recalibrateTdee`), so client-side instant previews and the "server" agree,
 * reports carry real highlights + Floo lines, and the roadmap is a genuine simulation.
 */
import {
  DEFAULT_GOAL_SETTINGS,
  DEFAULT_MASCOT_MESSAGES,
  ageFromBirthDate,
  autoDietTarget,
  bmrFor,
  bodyComposition,
  buildWeeklyReport,
  computeGoalPlan,
  computeGoalProgress,
  evaluateGoal,
  goalDirectionOf,
  ewmaTrend,
  latestTrendWeight,
  pickRoadmapWeek,
  planSnapshot,
  recalibrateTdee,
  replanGoal,
  round,
  shiftKey,
  summarizeWeeklyReport,
  tdeeFor,
  type BodyEntryDTO,
  type BodyPoint,
  type DayIntake,
  type EnergyDTO,
  type GoalAdjustment,
  type GoalAdjustmentAction,
  type GoalAdjustmentProposal,
  type GoalDTO,
  type GoalFeedback,
  type GoalInput,
  type GoalPlan,
  type GoalProfile,
  type GoalProgress,
  type MealEntryDTO,
  type ProgramDTO,
  type Recalibration,
  type ReplanBase,
  type UserDTO,
  type Weekday,
  type WeeklyReportDTO,
  type WeeklyReportSummary,
  type WeighInDTO,
  type WorkoutLogDTO,
} from "@fitfloow/core";
import { MUSCLES, nextId } from "./fixtures";

const SETTINGS = DEFAULT_GOAL_SETTINGS;
const iso = (key: string, h = 9) => `${key}T${String(h).padStart(2, "0")}:00:00.000Z`;

function ageOf(user: UserDTO, today: string): number | null {
  return user.birthDate ? ageFromBirthDate(user.birthDate, today) : null;
}

export function weightPoints(weighIns: WeighInDTO[]) {
  return weighIns.map((w) => ({ dateKey: w.dateKey, weightKg: w.weightKg }));
}

export function bodyPoints(entries: BodyEntryDTO[]): BodyPoint[] {
  return entries.map((e) => ({ dateKey: e.dateKey, weightKg: e.weightKg, bodyFatPct: e.bodyFatPct, waistCm: e.waistCm }));
}

/** Meal entries → one intake row per day (a day with zero entries is "not logged"). */
export function dayIntakeFrom(entries: MealEntryDTO[]): DayIntake[] {
  const byKey = new Map<string, DayIntake>();
  for (const e of entries) {
    const d = byKey.get(e.dateKey) ?? { dateKey: e.dateKey, kcal: 0, protein: 0, carbs: 0, fat: 0, entries: 0 };
    d.kcal += e.totals.kcal;
    d.protein = round((d.protein ?? 0) + e.totals.protein, 1);
    d.carbs = round((d.carbs ?? 0) + e.totals.carbs, 1);
    d.fat = round((d.fat ?? 0) + e.totals.fat, 1);
    d.entries = (d.entries ?? 0) + 1;
    byKey.set(e.dateKey, d);
  }
  return [...byKey.values()].sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
}

/** The plan the API would compute for `entry` as the starting state. */
export function planFor(user: UserDTO, entry: BodyEntryDTO, targetBodyFatPct: number, profile: GoalProfile, startKey: string, tdeeOverride: number | null = null): GoalPlan {
  return computeGoalPlan({
    sex: user.gender,
    weightKg: entry.weightKg,
    bodyFatPct: entry.bodyFatPct,
    heightCm: entry.heightCm || user.heightCm || 175,
    age: ageOf(user, startKey),
    activityLevel: user.activityLevel,
    targetBodyFatPct,
    profile,
    startDate: startKey,
    settings: SETTINGS,
    tdeeOverride,
  });
}

/** Demo goal: %15 target, optimal pace, started 4 weeks ago; the demo trend runs a little behind it, so Floo has an adjustment to propose. */
export function goalFor(today: string, user: UserDTO, entries: BodyEntryDTO[]): GoalDTO {
  const startKey = shiftKey(today, -28);
  const start = [...entries].reverse().find((e) => e.dateKey <= startKey) ?? entries[0];
  const target = 15;
  const profile: GoalProfile = "optimal";
  return {
    id: "g_demo",
    status: "active",
    direction: "cut",
    targetLeanGainKg: null,
    trainingLevel: null,
    adjustments: [],
    targetBodyFatPct: target,
    profile,
    start: { dateKey: startKey, weightKg: start.weightKg, bodyFatPct: start.bodyFatPct, leanMassKg: start.leanMassKg, fatMassKg: start.fatMassKg, bodyEntryId: start.id },
    plan: planFor(user, { ...start, dateKey: startKey }, target, profile, startKey),
    tdeeOverride: null,
    createdAt: iso(startKey),
    updatedAt: iso(startKey),
    completedAt: null,
  };
}

export function goalCreate(
  today: string,
  user: UserDTO,
  start: BodyEntryDTO,
  targetBodyFatPct: number,
  profile: GoalProfile,
  plan: GoalPlan = planFor(user, start, targetBodyFatPct, profile, today)
): GoalDTO {
  const now = new Date().toISOString();
  return {
    id: nextId("goal"),
    status: "active",
    direction: "cut",
    targetLeanGainKg: null,
    trainingLevel: null,
    adjustments: [],
    targetBodyFatPct,
    profile,
    start: { dateKey: today, weightKg: start.weightKg, bodyFatPct: start.bodyFatPct, leanMassKg: start.leanMassKg, fatMassKg: start.fatMassKg, bodyEntryId: start.id },
    plan,
    tdeeOverride: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

/** T8 — `POST /onboarding`'s goal in any direction (cut / bulk / recomp), through the real engine. */
export function goalFromInput(today: string, user: UserDTO, start: BodyEntryDTO, input: GoalInput): GoalDTO {
  const direction = goalDirectionOf(input);
  const profile = input.profile ?? "optimal";
  const plan = computeGoalPlan({
    sex: user.gender,
    weightKg: start.weightKg,
    bodyFatPct: start.bodyFatPct,
    heightCm: start.heightCm || user.heightCm || 175,
    age: ageOf(user, today),
    activityLevel: user.activityLevel,
    direction,
    targetBodyFatPct: input.targetBodyFatPct ?? null,
    targetLeanGainKg: input.targetLeanGainKg ?? null,
    trainingLevel: input.trainingLevel ?? null,
    profile,
    startDate: today,
    settings: SETTINGS,
  });
  // Same rule as the API's `storedTarget`: a bulk stores the body fat its plan ends at.
  const target = direction === "bulk" ? (plan.roadmap.at(-1)?.endBfPct ?? start.bodyFatPct) : (input.targetBodyFatPct ?? start.bodyFatPct);
  return {
    ...goalCreate(today, user, start, target, profile, plan),
    direction,
    targetLeanGainKg: direction === "bulk" ? (input.targetLeanGainKg ?? null) : null,
    trainingLevel: input.trainingLevel ?? null,
  };
}

/** PATCH: recompute from the *current* state (trend weight, lean mass preserved), keep the start. */
export function goalUpdate(today: string, user: UserDTO, goal: GoalDTO, weighIns: WeighInDTO[], patch: { targetBodyFatPct?: number; profile?: GoalProfile }): GoalDTO {
  const target = patch.targetBodyFatPct ?? goal.targetBodyFatPct;
  const profile = patch.profile ?? goal.profile;
  const current = currentState(goal, weighIns, today);
  return { ...goal, targetBodyFatPct: target, profile, plan: planFor(user, current, target, profile, today, goal.tdeeOverride), updatedAt: new Date().toISOString() };
}

/** Current body state assuming lean mass is preserved since the goal started. */
function currentState(goal: GoalDTO, weighIns: WeighInDTO[], today: string): BodyEntryDTO {
  const trend = ewmaTrend(weightPoints(weighIns.filter((w) => w.dateKey <= today)), SETTINGS.ewma);
  const weightKg = round(latestTrendWeight(trend) ?? goal.start.weightKg, 2);
  const lean = goal.start.leanMassKg;
  const bodyFatPct = round(Math.max(2, ((weightKg - lean) / weightKg) * 100), 1);
  const comp = bodyComposition(weightKg, bodyFatPct);
  return {
    id: goal.start.bodyEntryId ?? "be_current",
    date: iso(today),
    dateKey: today,
    gender: "male",
    heightCm: 0,
    neckCm: 0,
    waistCm: 0,
    hipCm: null,
    weightKg,
    bodyFatPct,
    fatMassKg: comp.fatMassKg,
    leanMassKg: comp.leanMassKg,
    notes: null,
  };
}

export function progressFor(today: string, goal: GoalDTO, weighIns: WeighInDTO[], entries: BodyEntryDTO[], meals: MealEntryDTO[]): GoalProgress {
  return computeGoalProgress(goal, weightPoints(weighIns), bodyPoints(entries), dayIntakeFrom(meals), today, SETTINGS);
}

export interface GoalEvaluationView {
  progress: GoalProgress;
  feedback: GoalFeedback;
  adjustment: GoalAdjustmentProposal | null;
  replanBase: ReplanBase | null;
}

/**
 * T7/T6 — the same `evaluateGoal` call the API makes for `GET /goals/current`: progress, Floo's
 * line and any pending adjustment proposal, re-planned from the latest measurement.
 */
export function evaluateFor(today: string, user: UserDTO, goal: GoalDTO, weighIns: WeighInDTO[], entries: BodyEntryDTO[], meals: MealEntryDTO[]): GoalEvaluationView {
  const latest = [...entries].filter((e) => e.dateKey <= today).sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1)).at(-1) ?? null;
  const recalibration = recalibrateTdee({
    startKey: goal.start.dateKey,
    tdeeFormula: goal.plan.tdeeFormula,
    tdeePrev: goal.tdeeOverride ?? goal.plan.tdeeFormula,
    weighIns: weightPoints(weighIns),
    dayIntake: dayIntakeFrom(meals),
    todayKey: today,
    settings: SETTINGS,
  });
  const replanBase: ReplanBase | null = latest
    ? { sex: user.gender, weightKg: latest.weightKg, bodyFatPct: latest.bodyFatPct, heightCm: latest.heightCm || user.heightCm || 175, age: ageOf(user, today), activityLevel: user.activityLevel, settings: SETTINGS }
    : null;
  return evaluateGoal({ goal, weighIns: weightPoints(weighIns), bodyEntries: bodyPoints(entries), dayIntake: dayIntakeFrom(meals), todayKey: today, settings: SETTINGS, replanBase, recalibration });
}

/** One-tap answer to a proposal, exactly as the API stores it (`adjustments[]` + the re-plan). */
export function answerAdjustment(
  today: string,
  goal: GoalDTO,
  evaluation: GoalEvaluationView,
  answer: { id: string; action?: GoalAdjustmentAction; dismiss?: boolean }
): { goal: GoalDTO; adjustment: GoalAdjustment } | { error: "stale" | "option" } {
  const proposal = evaluation.adjustment;
  if (!proposal || proposal.id !== answer.id || goal.adjustments.some((a) => a.id === answer.id)) return { error: "stale" };
  const at = new Date().toISOString();
  if (answer.dismiss) {
    const record: GoalAdjustment = { id: proposal.id, kind: proposal.kind, status: "dismissed", action: null, dateKey: today, at, before: proposal.before, after: null };
    return { goal: { ...goal, adjustments: [...goal.adjustments, record], updatedAt: at }, adjustment: record };
  }
  const chosen = answer.action ? proposal.options.find((o) => o.action === answer.action) : (proposal.options.find((o) => o.recommended) ?? proposal.options[0]);
  if (!chosen) return { error: "option" };
  const record: GoalAdjustment = { id: proposal.id, kind: proposal.kind, status: "accepted", action: chosen.action, dateKey: today, at, before: proposal.before, after: chosen.after };
  if (chosen.action === "complete" || !evaluation.replanBase) {
    return { goal: { ...goal, status: "completed", completedAt: at, adjustments: [...goal.adjustments, record], updatedAt: at }, adjustment: record };
  }
  const plan = replanGoal(goal, chosen.change, evaluation.replanBase, today);
  const next: GoalDTO = {
    ...goal,
    plan,
    tdeeOverride: chosen.change.tdeeOverride !== undefined ? chosen.change.tdeeOverride : goal.tdeeOverride,
    targetBodyFatPct: chosen.change.targetBodyFatPct ?? goal.targetBodyFatPct,
    targetLeanGainKg: chosen.change.targetLeanGainKg ?? goal.targetLeanGainKg,
    profile: chosen.change.profile ?? goal.profile,
    updatedAt: at,
  };
  const stored = { ...record, after: planSnapshot(plan, next) };
  return { goal: { ...next, adjustments: [...goal.adjustments, stored] }, adjustment: stored };
}

/** Measured-TDEE recalibration: applies the observed TDEE and re-simulates the plan from today. */
export function recalibrationFor(today: string, user: UserDTO, goal: GoalDTO, weighIns: WeighInDTO[], meals: MealEntryDTO[]): { goal: GoalDTO; recalibration: Recalibration } {
  const recalibration = recalibrateTdee({
    startKey: goal.start.dateKey,
    tdeeFormula: goal.plan.tdeeFormula,
    tdeePrev: goal.tdeeOverride ?? goal.plan.tdeeFormula,
    weighIns: weightPoints(weighIns),
    dayIntake: dayIntakeFrom(meals),
    todayKey: today,
    settings: SETTINGS,
  });
  if (!recalibration.applied) return { goal, recalibration };
  const current = currentState(goal, weighIns, today);
  const plan = planFor(user, current, goal.targetBodyFatPct, goal.profile, today, recalibration.tdeeUsed);
  return { goal: { ...goal, tdeeOverride: recalibration.tdeeUsed, plan, updatedAt: new Date().toISOString() }, recalibration };
}

export interface ReportInput {
  today: string;
  weekKey: string;
  measurementDay: Weekday;
  user: UserDTO;
  goal: GoalDTO | null;
  weighIns: WeighInDTO[];
  bodyEntries: BodyEntryDTO[];
  logs: WorkoutLogDTO[];
  meals: MealEntryDTO[];
  program: ProgramDTO;
}

/** Sessions a 7-day week is expected to hold for a cyclic program. */
export function plannedSessionsPerWeek(program: ProgramDTO): number {
  const days = program.days.length;
  if (days === 0) return 0;
  const training = program.days.filter((d) => d.kind !== "rest").length;
  return Math.max(1, Math.round((training * 7) / days));
}

export function reportFor(input: ReportInput): WeeklyReportDTO {
  const { today, weekKey, measurementDay, user, goal, weighIns, bodyEntries, logs, meals, program } = input;
  return buildWeeklyReport({
    weekKey,
    todayKey: today,
    measurementDay,
    goal: goal && goal.status === "active" ? goal : null,
    weighIns: weightPoints(weighIns),
    bodyEntries: bodyPoints(bodyEntries),
    logs: logs.map((l) => ({ dateKey: l.dateKey, isOffDay: l.isOffDay, kind: l.kind, strength: l.strength, run: l.run, swim: l.swim })),
    dayIntake: dayIntakeFrom(meals),
    plannedSessions: plannedSessionsPerWeek(program),
    muscles: MUSCLES.map((m) => ({ key: m.key, name: m.name, weeklyTarget: m.weeklyTarget })),
    settings: SETTINGS,
    catalog: DEFAULT_MASCOT_MESSAGES,
    seed: user.id,
    generatedAt: iso(today, 12),
    displayName: user.displayName,
  });
}

export function summaryFor(report: WeeklyReportDTO): WeeklyReportSummary {
  return summarizeWeeklyReport(report);
}

/**
 * C3 — `GET /me/energy`, mirroring the API exactly: expenditure from the goal engine's own
 * `bmrFor` / `tdeeFor`, the daily target from `autoDietTarget`. With no measurement there is no
 * lean mass, so there is no honest maintenance figure and therefore no deficit to claim.
 */
export function energyFor(today: string, user: UserDTO, entry: BodyEntryDTO | null, goal: GoalDTO | null): EnergyDTO {
  const activityLevel = user.activityLevel ?? "moderate";
  const activityMultiplier = SETTINGS.activityMultipliers[activityLevel] ?? 1.55;
  const leanMassKg = entry ? round(entry.leanMassKg, 2) : null;

  const week = goal?.status === "active" ? pickRoadmapWeek(goal.plan.roadmap ?? [], today) : null;
  const macros = week?.macros ?? (goal?.status === "active" ? goal.plan.macros : null);
  const target = autoDietTarget({
    goalMacros: macros ?? null,
    maintenance: leanMassKg ? { leanMassKg, activityMultiplier } : null,
  });

  const bmr =
    entry && leanMassKg
      ? bmrFor({
          sex: entry.gender ?? user.gender,
          weightKg: entry.weightKg,
          heightCm: entry.heightCm || user.heightCm || 175,
          leanMassKg,
          age: ageOf(user, today),
          settings: SETTINGS,
        }).bmr
      : 0;
  const tdee = bmr > 0 ? tdeeFor(bmr, activityLevel, SETTINGS) : 0;
  const maintenanceCalories = tdee > 0 ? round(tdee) : target.calories;

  return {
    bmr: round(bmr),
    tdee: round(tdee),
    maintenanceCalories,
    targetCalories: target.calories,
    dailyDeficit: round(maintenanceCalories - target.calories),
    derivedFrom: target.derivedFrom ?? "default",
    activityLevel,
    activityMultiplier,
    leanMassKg,
  };
}
