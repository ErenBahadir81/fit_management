/**
 * Shared plumbing for the body / goals / reports module (owner: B3).
 * Everything here is I/O; the maths lives in `@fitfloow/core`.
 */
import { Types } from "mongoose";
import type { DayIntake, MascotTemplate, MascotKey, MascotMessage, MascotVars, GoalSettings, Weekday } from "@fitfloow/core";
import { DEFAULT_MASCOT_MESSAGES, selectMascotMessage, weekKeyFor } from "@fitfloow/core";
import { AppError } from "../../lib/errors";
import { MascotMessage as MascotMessageModel } from "../../models/mascot";
import { MealEntry } from "../../models/nutrition";
import { getSettings } from "../../models/settings";
import { User, type UserDoc } from "../../models/user";
import { invalidateWeeklyReports } from "../../models/goal";
import type { ProgramDoc } from "../../models/program";

export type UserLean = UserDoc;

export async function loadUser(userId: string): Promise<UserLean> {
  const user = await User.findById(userId).lean<UserDoc>();
  if (!user) throw new AppError(401, "AUTH_INVALID", "Kullanıcı bulunamadı");
  return user;
}

export function oid(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound();
  return new Types.ObjectId(id);
}

export async function goalSettings(): Promise<GoalSettings> {
  return (await getSettings()).goal;
}

export async function mascotCatalog(): Promise<MascotTemplate[]> {
  const docs = await MascotMessageModel.find({ active: true }).lean();
  if (docs.length === 0) return DEFAULT_MASCOT_MESSAGES;
  return docs.map((d) => ({ key: d.key as MascotKey, mood: d.mood, variants: d.variants }));
}

/** Mascot line for a user; `mascotEnabled: false` still returns a key so the client can stay silent. */
export function mascotFor(
  key: MascotKey,
  catalog: MascotTemplate[],
  vars: MascotVars,
  userId: string,
  dateKey: string,
  enabled = true
): MascotMessage {
  const msg = selectMascotMessage(key, catalog, vars, `${userId}|${dateKey}`);
  return enabled ? msg : { ...msg, text: "" };
}

/** Per-day nutrition totals for a date range — one aggregation, never one query per day. */
export async function dayIntakeFor(userId: Types.ObjectId | string, fromKey: string, toKey: string): Promise<DayIntake[]> {
  const rows = await MealEntry.aggregate<{ _id: string; kcal: number; protein: number; carbs: number; fat: number; entries: number }>([
    { $match: { userId: new Types.ObjectId(String(userId)), dateKey: { $gte: fromKey, $lte: toKey } } },
    {
      $group: {
        _id: "$dateKey",
        kcal: { $sum: "$totals.kcal" },
        protein: { $sum: "$totals.protein" },
        carbs: { $sum: "$totals.carbs" },
        fat: { $sum: "$totals.fat" },
        entries: { $sum: 1 },
      },
    },
  ]);
  return rows.map((r) => ({ dateKey: r._id, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, entries: r.entries }));
}

/** Drop the cached weekly reports covering `dateKeys`. Every writer in this module calls it. */
export async function invalidateWeeksFor(
  userId: Types.ObjectId | string,
  dateKeys: Array<string | null | undefined>,
  measurementDay: number
): Promise<void> {
  const weeks = new Set<string>();
  for (const key of dateKeys) if (key) weeks.add(weekKeyFor(key, (measurementDay ?? 0) as Weekday));
  await invalidateWeeklyReports(userId, [...weeks]);
}

/** Program sessions expected in a 7-day week: cycle days that are not rest, scaled to 7 days. */
export function plannedSessionsForProgram(program: Pick<ProgramDoc, "days"> | null): number {
  const days = program?.days ?? [];
  if (days.length === 0) return 0;
  const training = days.filter((d) => d.kind !== "rest").length;
  return Math.round((7 * training) / days.length);
}
