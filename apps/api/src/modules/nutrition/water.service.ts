import { Types } from "mongoose";
import { waterGoalMl, type AddWaterInput, type WaterDay } from "@fitfloow/core";
import type { AppContext } from "../../context";
import { BodyEntry, WaterLog } from "../../models";
import { resolveDateKey } from "./entries.service";

async function goalFor(userId: string): Promise<number> {
  const latest = await BodyEntry.findOne({ userId: new Types.ObjectId(userId) })
    .sort({ date: -1 })
    .select("weightKg")
    .lean<{ weightKg: number } | null>();
  return waterGoalMl(latest?.weightKg ?? null);
}

async function waterFor(userId: string, dateKey: string): Promise<WaterDay> {
  const [agg, goalMl] = await Promise.all([
    WaterLog.aggregate<{ total: number; count: number }>([
      { $match: { userId: new Types.ObjectId(userId), dateKey } },
      { $group: { _id: null, total: { $sum: "$ml" }, count: { $sum: 1 } } },
    ]),
    goalFor(userId),
  ]);
  return { dateKey, totalMl: agg[0]?.total ?? 0, goalMl, count: agg[0]?.count ?? 0 };
}

export function waterDay(ctx: AppContext, userId: string, date?: string): Promise<WaterDay> {
  return waterFor(userId, resolveDateKey(ctx, date));
}

export async function addWater(ctx: AppContext, userId: string, input: AddWaterInput): Promise<WaterDay> {
  const dateKey = resolveDateKey(ctx, input.dateKey);
  await WaterLog.create({ userId: new Types.ObjectId(userId), dateKey, ml: input.ml });
  return waterFor(userId, dateKey);
}

/** Undo the day's newest tap. A day with nothing logged stays at zero. */
export async function undoWater(ctx: AppContext, userId: string, date?: string): Promise<WaterDay> {
  const dateKey = resolveDateKey(ctx, date);
  const last = await WaterLog.findOne({ userId: new Types.ObjectId(userId), dateKey }).sort({ createdAt: -1, _id: -1 });
  if (last) await last.deleteOne();
  return waterFor(userId, dateKey);
}
