import { Types } from "mongoose";
import type { AdminUserDTO, DayDTO, ProgramDTO } from "@fitfloow/core";
import { User, toUserDTO, type UserDoc } from "../../models/user";
import { Program, ProgramTemplate, toProgramDTO } from "../../models/program";
import { WorkoutLog } from "../../models/workoutLog";
import { BodyEntry, WeighIn } from "../../models/body";
import { Goal, WeeklyReportCache, invalidateAllWeeklyReports } from "../../models/goal";
import { DietTarget, MealEntry, Scan } from "../../models/nutrition";
import { AppError } from "../../lib/errors";

/** Escape a user supplied string so it can be embedded in a RegExp literally. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** MongoDB duplicate-key error — a unique index lost a race with our pre-check. */
export function isDuplicateKeyError(e: unknown): boolean {
  return (e as { code?: number } | null)?.code === 11000;
}

export function toObjectId(id: string): Types.ObjectId | null {
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
}

/** Load a user by id or throw 404 (invalid ObjectId strings are "not found", never a 500). */
export async function findUserOr404(id: string): Promise<UserDoc> {
  const oid = toObjectId(id);
  if (!oid) throw AppError.notFound("Kullanıcı");
  const user = await User.findById(oid).lean<UserDoc>();
  if (!user) throw AppError.notFound("Kullanıcı");
  return user;
}

/**
 * Decorate plain users with `hasProgram` / `goalStatus` using two extra queries for the whole
 * batch (never per user).
 */
export async function toAdminUserDTOs(users: UserDoc[]): Promise<AdminUserDTO[]> {
  if (users.length === 0) return [];
  const ids = users.map((u) => u._id);
  const [programUserIds, goals] = await Promise.all([
    Program.distinct("userId", { userId: { $in: ids } }),
    Goal.find({ userId: { $in: ids } })
      .select({ userId: 1, status: 1 })
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  const withProgram = new Set(programUserIds.map((v) => String(v)));
  const goalStatus = new Map<string, AdminUserDTO["goalStatus"]>();
  for (const g of goals) {
    const key = String(g.userId);
    // The active goal always wins; otherwise the most recent one (goals are sorted newest first).
    if (g.status === "active") goalStatus.set(key, "active");
    else if (!goalStatus.has(key)) goalStatus.set(key, g.status);
  }
  return users.map((u) => ({
    ...toUserDTO(u),
    hasProgram: withProgram.has(String(u._id)),
    goalStatus: goalStatus.get(String(u._id)) ?? null,
  }));
}

export async function toAdminUserDTO(user: UserDoc): Promise<AdminUserDTO> {
  const [dto] = await toAdminUserDTOs([user]);
  return dto;
}

/** Every collection that stores per-user data. DELETE /admin/users/:id wipes all of them. */
export async function deleteUserCascade(userId: Types.ObjectId): Promise<void> {
  await Promise.all([
    Program.deleteMany({ userId }),
    WorkoutLog.deleteMany({ userId }),
    BodyEntry.deleteMany({ userId }),
    WeighIn.deleteMany({ userId }),
    Goal.deleteMany({ userId }),
    WeeklyReportCache.deleteMany({ userId }),
    MealEntry.deleteMany({ userId }),
    DietTarget.deleteMany({ userId }),
    Scan.deleteMany({ userId }),
  ]);
  await User.deleteOne({ _id: userId });
}

/** Copy a template's days into the user's program (creating or replacing it), pointer reset. */
export async function assignTemplate(userId: Types.ObjectId, templateId: string, now: Date): Promise<ProgramDTO> {
  const tid = toObjectId(templateId);
  if (!tid) throw AppError.notFound("Program şablonu");
  const template = await ProgramTemplate.findById(tid).lean();
  if (!template) throw AppError.notFound("Program şablonu");

  const days = (template.days ?? []) as DayDTO[];
  const program = await Program.findOneAndUpdate(
    { userId },
    {
      $set: {
        name: template.name,
        days,
        currentIndex: 0,
        weekNumber: 1,
        startedAt: now,
        lastActionAt: now,
        sourceTemplateId: template._id,
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  await invalidateAllWeeklyReports(userId);
  return toProgramDTO(program!);
}
