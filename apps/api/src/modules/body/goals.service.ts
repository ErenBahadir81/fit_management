/**
 * Goal lifecycle: preview, create, re-plan, recalibrate, complete, abandon.
 * All maths comes from `@fitfloow/core` — this file only assembles the inputs.
 */
import {
  ageFromBirthDate,
  computeGoalPlan,
  computeGoalProgress,
  recalibrateTdee,
  shiftKey,
  trDateKey,
  type GoalDTO,
  type GoalInput,
  type GoalPlan,
  type GoalProgress,
  type GoalSettings,
  type Recalibration,
} from "@fitfloow/core";
import type { AppContext } from "../../context";
import { AppError } from "../../lib/errors";
import { BodyEntry, WeighIn, type BodyEntryDoc } from "../../models/body";
import { Goal, invalidateAllWeeklyReports, toGoalDTO, type GoalDoc } from "../../models/goal";
import { dayIntakeFor, goalSettings, loadUser, oid, type UserLean } from "./shared";

const HISTORY_DAYS = 200;
/** Weigh-in history kept before the progress window so the EWMA does not start cold. */
const EWMA_LOOKBACK_DAYS = 120;

export interface GoalState {
  weightKg: number;
  bodyFatPct: number;
  leanMassKg: number;
  fatMassKg: number;
  entryId: string | null;
  dateKey: string;
  heightCm: number;
}

/** Latest measurement — the only source of truth for body composition. */
async function currentState(user: UserLean): Promise<GoalState> {
  const entry = await BodyEntry.findOne({ userId: user._id }).sort({ date: -1, _id: -1 }).lean<BodyEntryDoc>();
  if (!entry) throw new AppError(400, "NO_BODY_ENTRY", "Önce bir vücut ölçümü ekle");
  return {
    weightKg: entry.weightKg,
    bodyFatPct: entry.bodyFatPct,
    leanMassKg: entry.leanMassKg,
    fatMassKg: entry.fatMassKg,
    entryId: String(entry._id),
    dateKey: entry.dateKey,
    heightCm: entry.heightCm ?? user.heightCm ?? 175,
  };
}

function planFor(
  user: UserLean,
  state: GoalState,
  targetBodyFatPct: number,
  profile: GoalInput["profile"],
  startDate: string,
  settings: GoalSettings,
  tdeeOverride: number | null
): GoalPlan {
  return computeGoalPlan({
    sex: user.gender,
    weightKg: state.weightKg,
    bodyFatPct: state.bodyFatPct,
    heightCm: state.heightCm,
    age: user.birthDate ? ageFromBirthDate(user.birthDate, startDate) : null,
    activityLevel: user.activityLevel,
    targetBodyFatPct,
    profile,
    startDate,
    settings,
    tdeeOverride,
  });
}

export async function previewGoal(ctx: AppContext, userId: string, input: GoalInput): Promise<{ plan: GoalPlan; warnings: GoalPlan["warnings"] }> {
  const user = await loadUser(userId);
  const [settings, state] = await Promise.all([goalSettings(), currentState(user)]);
  const plan = planFor(user, state, input.targetBodyFatPct, input.profile, trDateKey(ctx.now()), settings, null);
  return { plan, warnings: plan.warnings };
}

export async function createGoal(ctx: AppContext, userId: string, input: GoalInput): Promise<GoalDTO> {
  const user = await loadUser(userId);
  if (await Goal.exists({ userId: user._id, status: "active" })) {
    throw AppError.conflict("Zaten aktif bir hedefin var", "GOAL_EXISTS");
  }
  const [settings, state] = await Promise.all([goalSettings(), currentState(user)]);
  const startKey = trDateKey(ctx.now());
  const plan = planFor(user, state, input.targetBodyFatPct, input.profile, startKey, settings, null);
  const doc = await Goal.create({
    userId: user._id,
    status: "active",
    targetBodyFatPct: input.targetBodyFatPct,
    profile: input.profile,
    start: {
      dateKey: startKey,
      weightKg: state.weightKg,
      bodyFatPct: state.bodyFatPct,
      leanMassKg: state.leanMassKg,
      fatMassKg: state.fatMassKg,
      bodyEntryId: state.entryId ? oid(state.entryId) : null,
    },
    plan,
    tdeeOverride: null,
    history: [{ at: ctx.now(), event: "created", snapshot: { targetBodyFatPct: input.targetBodyFatPct, profile: input.profile } }],
  });
  await invalidateAllWeeklyReports(user._id);
  return toGoalDTO(doc.toObject());
}

async function activeGoalDoc(userId: string): Promise<{ user: UserLean; goal: GoalDoc }> {
  const user = await loadUser(userId);
  const goal = await Goal.findOne({ userId: user._id, status: "active" }).lean<GoalDoc>();
  if (!goal) throw AppError.notFound("Aktif hedef");
  return { user, goal };
}

export async function updateGoal(ctx: AppContext, userId: string, input: Partial<GoalInput>): Promise<GoalDTO> {
  const { user, goal } = await activeGoalDoc(userId);
  const [settings, state] = await Promise.all([goalSettings(), currentState(user)]);
  const targetBodyFatPct = input.targetBodyFatPct ?? goal.targetBodyFatPct;
  const profile = input.profile ?? goal.profile;
  const todayKey = trDateKey(ctx.now());
  // Re-plan from where the user is now; the original start (and therefore progress) is preserved.
  const plan = planFor(user, state, targetBodyFatPct, profile, todayKey, settings, goal.tdeeOverride ?? null);
  const updated = await Goal.findByIdAndUpdate(
    goal._id,
    {
      $set: { targetBodyFatPct, profile, plan },
      $push: { history: { at: ctx.now(), event: "replanned", snapshot: { targetBodyFatPct, profile, from: state } } },
    },
    { returnDocument: "after" }
  ).lean<GoalDoc>();
  if (!updated) throw AppError.notFound("Aktif hedef");
  await invalidateAllWeeklyReports(user._id);
  return toGoalDTO(updated);
}

export async function recalibrateGoal(ctx: AppContext, userId: string): Promise<{ goal: GoalDTO; recalibration: Recalibration }> {
  const { user, goal } = await activeGoalDoc(userId);
  const settings = await goalSettings();
  const todayKey = trDateKey(ctx.now());
  const fromKey = shiftKey(todayKey, -HISTORY_DAYS);
  const [weighIns, dayIntake] = await Promise.all([
    WeighIn.find({ userId: user._id, dateKey: { $gte: fromKey, $lte: todayKey } }).sort({ dateKey: 1 }).lean(),
    dayIntakeFor(user._id, fromKey, todayKey),
  ]);

  const recalibration = recalibrateTdee({
    startKey: goal.start.dateKey,
    tdeeFormula: goal.plan.tdeeFormula,
    tdeePrev: goal.tdeeOverride ?? goal.plan.tdeeFormula,
    weighIns: weighIns.map((w) => ({ dateKey: w.dateKey, weightKg: w.weightKg })),
    dayIntake,
    todayKey,
    settings,
  });
  if (!recalibration.applied) return { goal: toGoalDTO(goal), recalibration };

  const state = await currentState(user);
  const plan = planFor(user, state, goal.targetBodyFatPct, goal.profile, todayKey, settings, recalibration.tdeeUsed);
  const updated = await Goal.findByIdAndUpdate(
    goal._id,
    {
      $set: { tdeeOverride: recalibration.tdeeUsed, plan },
      $push: { history: { at: ctx.now(), event: "recalibrated", snapshot: recalibration } },
    },
    { returnDocument: "after" }
  ).lean<GoalDoc>();
  if (!updated) throw AppError.notFound("Aktif hedef");
  await invalidateAllWeeklyReports(user._id);
  return { goal: toGoalDTO(updated), recalibration };
}

export async function closeGoal(ctx: AppContext, userId: string, status: "completed" | "abandoned"): Promise<GoalDTO> {
  const { user, goal } = await activeGoalDoc(userId);
  const updated = await Goal.findByIdAndUpdate(
    goal._id,
    { $set: { status, completedAt: ctx.now() }, $push: { history: { at: ctx.now(), event: status, snapshot: {} } } },
    { returnDocument: "after" }
  ).lean<GoalDoc>();
  if (!updated) throw AppError.notFound("Aktif hedef");
  await invalidateAllWeeklyReports(user._id);
  return toGoalDTO(updated);
}

/** Active goal plus live progress; `{ goal: null, progress: null }` when there is none. */
export async function currentGoalView(ctx: AppContext, userId: string): Promise<{ goal: GoalDTO | null; progress: GoalProgress | null }> {
  const user = await loadUser(userId);
  const goal = await Goal.findOne({ userId: user._id, status: "active" }).lean<GoalDoc>();
  if (!goal) return { goal: null, progress: null };
  const settings = await goalSettings();
  const todayKey = trDateKey(ctx.now());
  const fromKey = goal.start.dateKey < shiftKey(todayKey, -HISTORY_DAYS) ? shiftKey(todayKey, -HISTORY_DAYS) : goal.start.dateKey;
  const [weighIns, entries, dayIntake] = await Promise.all([
    // Bounded: the EWMA only needs enough history before the window to be warm.
    WeighIn.find({ userId: user._id, dateKey: { $gte: shiftKey(fromKey, -EWMA_LOOKBACK_DAYS), $lte: todayKey } })
      .sort({ dateKey: 1 })
      .lean(),
    BodyEntry.find({ userId: user._id, dateKey: { $gte: fromKey, $lte: todayKey } }).sort({ date: 1 }).lean<BodyEntryDoc[]>(),
    dayIntakeFor(user._id, fromKey, todayKey),
  ]);
  const dto = toGoalDTO(goal);
  const progress = computeGoalProgress(
    dto,
    weighIns.map((w) => ({ dateKey: w.dateKey, weightKg: w.weightKg })),
    entries.map((e) => ({ dateKey: e.dateKey, weightKg: e.weightKg, bodyFatPct: e.bodyFatPct, waistCm: e.waistCm })),
    dayIntake,
    todayKey,
    settings
  );
  return { goal: dto, progress };
}
