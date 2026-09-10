import { Types } from "mongoose";
import {
  DEFAULT_DIET_TARGET,
  autoDietTarget,
  pickRoadmapWeek,
  trDateKey,
  type DietTargetDTO,
  type MacroTarget,
} from "@fitfloow/core";
import { DietTarget, type DietTargetDoc } from "../../models/nutrition";
import { Goal } from "../../models/goal";
import { BodyEntry } from "../../models/body";
import { User } from "../../models/user";
import { getSettings } from "../../models/settings";
import type { AppContext } from "../../context";

export interface TargetInput {
  mode: "auto" | "manual";
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

/**
 * Auto mode, in order of preference:
 *  1. the active goal's macros for the roadmap week containing today (falls back to `plan.macros`)
 *  2. maintenance from the latest body entry (Katch-McArdle × the settings activity multiplier)
 *  3. the flat defaults (2000 / 150 / 200 / 65)
 * Manual mode returns the stored numbers untouched.
 */
export async function resolveTarget(ctx: AppContext, userId: string): Promise<DietTargetDTO> {
  const uid = new Types.ObjectId(userId);
  const stored = await DietTarget.findOne({ userId: uid }).lean<DietTargetDoc>();
  if (stored && stored.mode === "manual") {
    return {
      mode: "manual",
      calories: stored.calories,
      protein: stored.protein,
      carbs: stored.carbs,
      fat: stored.fat,
      derivedFrom: null,
    };
  }
  return computeAutoTarget(ctx, userId);
}

export async function computeAutoTarget(ctx: AppContext, userId: string): Promise<DietTargetDTO> {
  const uid = new Types.ObjectId(userId);
  const [goal, body, user, settings] = await Promise.all([
    Goal.findOne({ userId: uid, status: "active" }).lean(),
    BodyEntry.findOne({ userId: uid }).sort({ date: -1 }).lean(),
    User.findById(uid).lean(),
    getSettings(),
  ]);

  let goalMacros: MacroTarget | null = null;
  if (goal?.plan) {
    const todayKey = trDateKey(ctx.now());
    const week = pickRoadmapWeek(goal.plan.roadmap ?? [], todayKey);
    const macros = week?.macros ?? goal.plan.macros;
    if (macros) goalMacros = { calories: macros.calories, protein: macros.protein, carbs: macros.carbs, fat: macros.fat };
  }

  const activityLevel = user?.activityLevel ?? "moderate";
  const multiplier = settings.goal.activityMultipliers[activityLevel] ?? 1.55;
  const maintenance = body?.leanMassKg ? { leanMassKg: body.leanMassKg, activityMultiplier: multiplier } : null;

  return autoDietTarget({ goalMacros, maintenance });
}

/** PUT /nutrition/target. Manual keeps whatever the user sent (missing fields keep their current value). */
export async function setTarget(ctx: AppContext, userId: string, input: TargetInput): Promise<DietTargetDTO> {
  const uid = new Types.ObjectId(userId);
  if (input.mode === "auto") {
    const auto = await computeAutoTarget(ctx, userId);
    await DietTarget.findOneAndUpdate(
      { userId: uid },
      { $set: { mode: "auto", calories: auto.calories, protein: auto.protein, carbs: auto.carbs, fat: auto.fat } },
      { upsert: true, returnDocument: "after" }
    );
    return auto;
  }

  const current = await resolveTarget(ctx, userId);
  const next: DietTargetDTO = {
    mode: "manual",
    calories: input.calories ?? current.calories ?? DEFAULT_DIET_TARGET.calories,
    protein: input.protein ?? current.protein ?? DEFAULT_DIET_TARGET.protein,
    carbs: input.carbs ?? current.carbs ?? DEFAULT_DIET_TARGET.carbs,
    fat: input.fat ?? current.fat ?? DEFAULT_DIET_TARGET.fat,
    derivedFrom: null,
  };
  await DietTarget.findOneAndUpdate(
    { userId: uid },
    { $set: { mode: "manual", calories: next.calories, protein: next.protein, carbs: next.carbs, fat: next.fat } },
    { upsert: true, returnDocument: "after" }
  );
  return next;
}
