/**
 * Goal lifecycle: preview, create, re-plan, recalibrate, complete, abandon — and (T7) the body
 * assessment, the three plan directions and one-tap acceptance of Floo's adjustment proposals.
 * All maths comes from `@fitfloow/core` — this file only assembles the inputs.
 */
import {
  ageFromBirthDate,
  assessBody,
  computeGoalPlan,
  evaluateGoal,
  goalDirectionOf,
  planSnapshot,
  recalibrateTdee,
  replanGoal,
  shiftKey,
  trDateKey,
  zGoalInput,
  type BodyAssessment,
  type GoalAdjustment,
  type GoalAdjustmentAnswer,
  type GoalDirection,
  type GoalDTO,
  type GoalInput,
  type GoalPlan,
  type GoalSettings,
  type GoalUpdate,
  type GoalView,
  type Recalibration,
  type ReplanBase,
  type TrainingLevel,
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

/** What a goal asks the engine for, after defaults and the stored goal are merged in. */
export interface GoalSpec {
  direction: GoalDirection;
  targetBodyFatPct: number | null;
  targetLeanGainKg: number | null;
  trainingLevel: TrainingLevel | null;
  profile: GoalInput["profile"];
}

function specOf(input: GoalInput): GoalSpec {
  return {
    direction: goalDirectionOf(input),
    targetBodyFatPct: input.targetBodyFatPct ?? null,
    targetLeanGainKg: input.targetLeanGainKg ?? null,
    trainingLevel: input.trainingLevel ?? null,
    profile: input.profile,
  };
}

/** Engine input for "this person, today" — everything except what the goal decides. */
function replanBaseFor(user: UserLean, state: GoalState, todayKey: string, settings: GoalSettings): ReplanBase {
  return {
    sex: user.gender,
    weightKg: state.weightKg,
    bodyFatPct: state.bodyFatPct,
    heightCm: state.heightCm,
    age: user.birthDate ? ageFromBirthDate(user.birthDate, todayKey) : null,
    activityLevel: user.activityLevel,
    settings,
  };
}

function planFor(user: UserLean, state: GoalState, spec: GoalSpec, startDate: string, settings: GoalSettings, tdeeOverride: number | null): GoalPlan {
  return computeGoalPlan({
    ...replanBaseFor(user, state, startDate, settings),
    direction: spec.direction,
    targetBodyFatPct: spec.targetBodyFatPct,
    targetLeanGainKg: spec.targetLeanGainKg,
    trainingLevel: spec.trainingLevel,
    profile: spec.profile,
    startDate,
    tdeeOverride,
  });
}

/**
 * The goal's stored `targetBodyFatPct` is the target for a cut/recomp and, for a bulk, the body
 * fat the plan expects to end at (the field stays required so older readers keep working).
 */
function storedTarget(spec: GoalSpec, plan: GoalPlan, state: GoalState): number {
  if (spec.direction !== "bulk") return spec.targetBodyFatPct ?? state.bodyFatPct;
  return plan.roadmap.at(-1)?.endBfPct ?? state.bodyFatPct;
}

export async function previewGoal(ctx: AppContext, userId: string, input: GoalInput): Promise<{ plan: GoalPlan; warnings: GoalPlan["warnings"] }> {
  const user = await loadUser(userId);
  const [settings, state] = await Promise.all([goalSettings(), currentState(user)]);
  const plan = planFor(user, state, specOf(input), trDateKey(ctx.now()), settings, null);
  return { plan, warnings: plan.warnings };
}

export async function createGoal(ctx: AppContext, userId: string, input: GoalInput): Promise<GoalDTO> {
  const user = await loadUser(userId);
  if (await Goal.exists({ userId: user._id, status: "active" })) {
    throw AppError.conflict("Zaten aktif bir hedefin var", "GOAL_EXISTS");
  }
  const [settings, state] = await Promise.all([goalSettings(), currentState(user)]);
  const startKey = trDateKey(ctx.now());
  const spec = specOf(input);
  const plan = planFor(user, state, spec, startKey, settings, null);
  const doc = await Goal.create({
    userId: user._id,
    status: "active",
    direction: spec.direction,
    targetBodyFatPct: storedTarget(spec, plan, state),
    targetLeanGainKg: spec.direction === "bulk" ? spec.targetLeanGainKg : null,
    trainingLevel: spec.trainingLevel ?? plan.trainingLevel ?? null,
    profile: spec.profile,
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
    adjustments: [],
    history: [{ at: ctx.now(), event: "created", snapshot: { ...spec } }],
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

export async function updateGoal(ctx: AppContext, userId: string, input: GoalUpdate): Promise<GoalDTO> {
  const { user, goal } = await activeGoalDoc(userId);
  const [settings, state] = await Promise.all([goalSettings(), currentState(user)]);
  const current = toGoalDTO(goal);
  const direction = input.direction ?? (input.targetLeanGainKg != null && input.targetBodyFatPct == null ? "bulk" : current.direction);
  const switched = direction !== current.direction;
  // A direction switch drops the old direction's target: a bulk's stored end-body-fat is no cut target.
  const merged = zGoalInput.safeParse({
    direction,
    targetBodyFatPct: input.targetBodyFatPct ?? (switched || current.direction === "bulk" ? undefined : current.targetBodyFatPct),
    targetLeanGainKg: input.targetLeanGainKg ?? (switched ? undefined : (current.targetLeanGainKg ?? undefined)),
    trainingLevel: input.trainingLevel ?? current.trainingLevel ?? undefined,
    profile: input.profile ?? current.profile,
  });
  if (!merged.success) throw AppError.validation("Geçersiz hedef", merged.error.issues);
  const spec = specOf(merged.data);
  const todayKey = trDateKey(ctx.now());
  // Re-plan from where the user is now; the original start (and therefore progress) is preserved.
  // A bulk's lean target counts from the goal start, so only what is still missing is planned.
  const planSpec =
    spec.direction === "bulk" && !switched && spec.targetLeanGainKg !== null
      ? { ...spec, targetLeanGainKg: Math.max(0.25, current.start.leanMassKg + spec.targetLeanGainKg - state.leanMassKg) }
      : spec;
  const plan = planFor(user, state, planSpec, todayKey, settings, switched ? null : (goal.tdeeOverride ?? null));
  const targetBodyFatPct = storedTarget(spec, plan, state);
  const set: Record<string, unknown> = {
    direction: spec.direction,
    targetBodyFatPct,
    targetLeanGainKg: spec.direction === "bulk" ? spec.targetLeanGainKg : null,
    trainingLevel: spec.trainingLevel ?? plan.trainingLevel ?? null,
    profile: spec.profile,
    plan,
  };
  if (switched) {
    // A new direction is a new journey: progress and calibration start from today.
    set.start = {
      dateKey: todayKey,
      weightKg: state.weightKg,
      bodyFatPct: state.bodyFatPct,
      leanMassKg: state.leanMassKg,
      fatMassKg: state.fatMassKg,
      bodyEntryId: state.entryId ? oid(state.entryId) : null,
    };
    set.tdeeOverride = null;
  }
  const updated = await Goal.findByIdAndUpdate(
    goal._id,
    { $set: set, $push: { history: { at: ctx.now(), event: "replanned", snapshot: { ...spec, from: state } } } },
    { returnDocument: "after" }
  ).lean<GoalDoc>();
  if (!updated) throw AppError.notFound("Aktif hedef");
  await invalidateAllWeeklyReports(user._id);
  return toGoalDTO(updated);
}

/** Spec of a stored goal, for re-planning it unchanged. */
function storedSpec(goal: GoalDTO): GoalSpec {
  return {
    direction: goal.direction,
    targetBodyFatPct: goal.direction === "bulk" ? null : goal.targetBodyFatPct,
    targetLeanGainKg: goal.targetLeanGainKg,
    trainingLevel: goal.trainingLevel,
    profile: goal.profile,
  };
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
  const dto = toGoalDTO(goal);
  const plan =
    dto.direction === "bulk"
      ? replanGoal(dto, { tdeeOverride: recalibration.tdeeUsed }, replanBaseFor(user, state, todayKey, settings), todayKey)
      : planFor(user, state, storedSpec(dto), todayKey, settings, recalibration.tdeeUsed);
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

interface Evaluated {
  user: UserLean;
  goal: GoalDoc;
  dto: GoalDTO;
  view: GoalView;
  replan: ReplanBase | null;
  todayKey: string;
}

/** Load everything the engine needs and evaluate the active goal: progress, feedback, adjustment. */
async function evaluateActive(ctx: AppContext, userId: string): Promise<Evaluated | { user: UserLean; goal: null }> {
  const user = await loadUser(userId);
  const goal = await Goal.findOne({ userId: user._id, status: "active" }).lean<GoalDoc>();
  if (!goal) return { user, goal: null };
  const settings = await goalSettings();
  const todayKey = trDateKey(ctx.now());
  const fromKey = goal.start.dateKey < shiftKey(todayKey, -HISTORY_DAYS) ? shiftKey(todayKey, -HISTORY_DAYS) : goal.start.dateKey;
  const [weighInDocs, entries, dayIntake, latest] = await Promise.all([
    // Bounded: the EWMA only needs enough history before the window to be warm.
    WeighIn.find({ userId: user._id, dateKey: { $gte: shiftKey(fromKey, -EWMA_LOOKBACK_DAYS), $lte: todayKey } })
      .sort({ dateKey: 1 })
      .lean(),
    BodyEntry.find({ userId: user._id, dateKey: { $gte: fromKey, $lte: todayKey } }).sort({ date: 1 }).lean<BodyEntryDoc[]>(),
    dayIntakeFor(user._id, fromKey, todayKey),
    BodyEntry.findOne({ userId: user._id }).sort({ date: -1, _id: -1 }).lean<BodyEntryDoc>(),
  ]);
  const dto = toGoalDTO(goal);
  const weighIns = weighInDocs.map((w) => ({ dateKey: w.dateKey, weightKg: w.weightKg }));
  const recalibration = recalibrateTdee({
    startKey: goal.start.dateKey,
    tdeeFormula: goal.plan.tdeeFormula,
    tdeePrev: goal.tdeeOverride ?? goal.plan.tdeeFormula,
    weighIns,
    dayIntake,
    todayKey,
    settings,
  });
  const replan: ReplanBase | null = latest
    ? replanBaseFor(
        user,
        {
          weightKg: latest.weightKg,
          bodyFatPct: latest.bodyFatPct,
          leanMassKg: latest.leanMassKg,
          fatMassKg: latest.fatMassKg,
          entryId: String(latest._id),
          dateKey: latest.dateKey,
          heightCm: latest.heightCm ?? user.heightCm ?? 175,
        },
        todayKey,
        settings
      )
    : null;
  const evaluation = evaluateGoal({
    goal: dto,
    weighIns,
    bodyEntries: entries.map((e) => ({ dateKey: e.dateKey, weightKg: e.weightKg, bodyFatPct: e.bodyFatPct, waistCm: e.waistCm })),
    dayIntake,
    todayKey,
    settings,
    replanBase: replan,
    recalibration,
  });
  const { replanBase, ...rest } = evaluation;
  return { user, goal, dto, replan: replanBase, todayKey, view: { goal: dto, ...rest } };
}

/** Active goal plus live progress, Floo's feedback and any pending adjustment; nulls when there is none. */
export async function currentGoalView(ctx: AppContext, userId: string): Promise<GoalView> {
  const r = await evaluateActive(ctx, userId);
  if (!r.goal) return { goal: null, progress: null, feedback: null, adjustment: null };
  return (r as Evaluated).view;
}

/** T7 — FFMI + body fat of the latest measurement and the goal they suggest. */
export async function bodyAssessment(userId: string, trainingLevel: TrainingLevel | null): Promise<BodyAssessment> {
  const user = await loadUser(userId);
  const [settings, state] = await Promise.all([goalSettings(), currentState(user)]);
  return assessBody({ sex: user.gender, weightKg: state.weightKg, heightCm: state.heightCm, bodyFatPct: state.bodyFatPct, trainingLevel, settings });
}

/** The pending proposal the client answered, or 409 when it is no longer the one on offer. */
async function pendingProposal(ctx: AppContext, userId: string, id: string) {
  const r = await evaluateActive(ctx, userId);
  if (!r.goal) throw AppError.notFound("Aktif hedef");
  const e = r as Evaluated;
  const proposal = e.view.adjustment;
  if (!proposal || proposal.id !== id) {
    throw AppError.conflict("Bu öneri artık geçerli değil, güncel durumu yeniden yükle", "ADJUSTMENT_STALE");
  }
  return { e, proposal };
}

/** T7 — one-tap accept: re-plan with the chosen option exactly as it was previewed. */
export async function acceptAdjustment(ctx: AppContext, userId: string, answer: GoalAdjustmentAnswer): Promise<{ goal: GoalDTO; adjustment: GoalAdjustment }> {
  const { e, proposal } = await pendingProposal(ctx, userId, answer.id);
  const chosen = answer.action ? proposal.options.find((o) => o.action === answer.action) : (proposal.options.find((o) => o.recommended) ?? proposal.options[0]);
  if (!chosen) throw AppError.validation("Bu öneride böyle bir seçenek yok");
  if (chosen.action !== "complete" && !e.replan) throw new AppError(400, "NO_BODY_ENTRY", "Önce bir vücut ölçümü ekle");

  const now = ctx.now();
  const record: GoalAdjustment = {
    id: proposal.id,
    kind: proposal.kind,
    status: "accepted",
    action: chosen.action,
    dateKey: e.todayKey,
    at: now.toISOString(),
    before: proposal.before,
    after: chosen.after,
  };

  const set: Record<string, unknown> = {};
  if (chosen.action === "complete") {
    set.status = "completed";
    set.completedAt = now;
  } else {
    const plan = replanGoal(e.dto, chosen.change, e.replan!, e.todayKey);
    set.plan = plan;
    if (chosen.change.tdeeOverride !== undefined) set.tdeeOverride = chosen.change.tdeeOverride;
    if (chosen.change.targetBodyFatPct !== undefined) set.targetBodyFatPct = chosen.change.targetBodyFatPct;
    if (chosen.change.targetLeanGainKg !== undefined) set.targetLeanGainKg = chosen.change.targetLeanGainKg;
    if (e.dto.direction === "bulk") set.targetBodyFatPct = plan.roadmap.at(-1)?.endBfPct ?? e.dto.targetBodyFatPct;
    record.after = planSnapshot(plan, {
      targetBodyFatPct: (set.targetBodyFatPct as number | undefined) ?? e.dto.targetBodyFatPct,
      targetLeanGainKg: (set.targetLeanGainKg as number | undefined) ?? e.dto.targetLeanGainKg,
    });
  }
  const updated = await Goal.findOneAndUpdate(
    { _id: e.goal._id, status: "active", "adjustments.id": { $ne: proposal.id } },
    { $set: set, $push: { adjustments: record, history: { at: now, event: "adjusted", snapshot: record } } },
    { returnDocument: "after" }
  ).lean<GoalDoc>();
  if (!updated) throw AppError.conflict("Bu öneri zaten yanıtlandı", "ADJUSTMENT_STALE");
  await invalidateAllWeeklyReports(e.user._id);
  return { goal: toGoalDTO(updated), adjustment: record };
}

/** T7 — "not now": recorded so the same proposal is not repeated; the cool-down restarts today. */
export async function dismissAdjustment(ctx: AppContext, userId: string, answer: GoalAdjustmentAnswer): Promise<{ goal: GoalDTO; adjustment: GoalAdjustment }> {
  const { e, proposal } = await pendingProposal(ctx, userId, answer.id);
  const now = ctx.now();
  const record: GoalAdjustment = {
    id: proposal.id,
    kind: proposal.kind,
    status: "dismissed",
    action: null,
    dateKey: e.todayKey,
    at: now.toISOString(),
    before: proposal.before,
    after: null,
  };
  const updated = await Goal.findOneAndUpdate(
    { _id: e.goal._id, status: "active", "adjustments.id": { $ne: proposal.id } },
    { $push: { adjustments: record, history: { at: now, event: "adjustmentDismissed", snapshot: record } } },
    { returnDocument: "after" }
  ).lean<GoalDoc>();
  if (!updated) throw AppError.conflict("Bu öneri zaten yanıtlandı", "ADJUSTMENT_STALE");
  return { goal: toGoalDTO(updated), adjustment: record };
}
