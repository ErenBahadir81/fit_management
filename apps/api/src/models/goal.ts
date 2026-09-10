import mongoose, { Schema, model, type Model, type Types } from "mongoose";
import type { GoalDTO, GoalPlan, GoalProfile } from "@fitfloow/core";

export interface GoalDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  status: "active" | "completed" | "abandoned";
  targetBodyFatPct: number;
  profile: GoalProfile;
  start: { dateKey: string; weightKg: number; bodyFatPct: number; leanMassKg: number; fatMassKg: number; bodyEntryId: Types.ObjectId | null };
  plan: GoalPlan;
  tdeeOverride: number | null;
  history: Array<{ at: Date; event: string; snapshot: unknown }>;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const GoalSchema = new Schema<GoalDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["active", "completed", "abandoned"], default: "active" },
    targetBodyFatPct: { type: Number, required: true },
    profile: { type: String, enum: ["conservative", "optimal", "aggressive"], default: "optimal" },
    start: {
      dateKey: String,
      weightKg: Number,
      bodyFatPct: Number,
      leanMassKg: Number,
      fatMassKg: Number,
      bodyEntryId: { type: Schema.Types.ObjectId, default: null },
    },
    plan: { type: Schema.Types.Mixed, required: true },
    tdeeOverride: { type: Number, default: null },
    history: { type: [{ at: Date, event: String, snapshot: Schema.Types.Mixed, _id: false }], default: [] },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false }
);
// only one active goal per user
GoalSchema.index({ userId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: "active" } });

export const Goal: Model<GoalDoc> = (mongoose.models.Goal as Model<GoalDoc>) || model<GoalDoc>("Goal", GoalSchema);

export function toGoalDTO(g: GoalDoc): GoalDTO {
  return {
    id: String(g._id),
    status: g.status,
    targetBodyFatPct: g.targetBodyFatPct,
    profile: g.profile,
    start: { ...g.start, bodyEntryId: g.start.bodyEntryId ? String(g.start.bodyEntryId) : null },
    plan: g.plan,
    tdeeOverride: g.tdeeOverride ?? null,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    completedAt: g.completedAt ? g.completedAt.toISOString() : null,
  };
}

export interface WeeklyReportCacheDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  weekKey: string;
  generatedAt: Date;
  report: unknown;
}
const WeeklyReportCacheSchema = new Schema<WeeklyReportCacheDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    weekKey: { type: String, required: true },
    generatedAt: { type: Date, default: Date.now },
    report: { type: Schema.Types.Mixed, required: true },
  },
  { minimize: false }
);
WeeklyReportCacheSchema.index({ userId: 1, weekKey: 1 }, { unique: true });
export const WeeklyReportCache: Model<WeeklyReportCacheDoc> =
  (mongoose.models.WeeklyReportCache as Model<WeeklyReportCacheDoc>) || model<WeeklyReportCacheDoc>("WeeklyReportCache", WeeklyReportCacheSchema);

/** Any module that writes data inside a week must call this (B3 exposes a helper; others may call directly). */
export async function invalidateWeeklyReports(userId: Types.ObjectId | string, weekKeys: string[]): Promise<void> {
  if (weekKeys.length === 0) return;
  await WeeklyReportCache.deleteMany({ userId, weekKey: { $in: weekKeys } });
}

/**
 * Drop *every* cached report of a user. Used by writes that change all weeks at once rather than
 * the data of one day: a goal re-plan (new roadmap → new targets, expectations and score for every
 * week), a measurement-day change (new week keys) and a program change (new plannedSessions).
 */
export async function invalidateAllWeeklyReports(userId: Types.ObjectId | string): Promise<void> {
  await WeeklyReportCache.deleteMany({ userId });
}
