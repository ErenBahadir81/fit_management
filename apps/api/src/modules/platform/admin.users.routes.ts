import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  trDateKey,
  weekKeyFor,
  zActivityLevel,
  zAdminCreateUserInput,
  zDateKey,
  zGender,
  zId,
  zPassword,
  zRole,
  zUsername,
  zWeekday,
  type Weekday,
} from "@fitfloow/core";
import { User, type UserDoc } from "../../models/user";
import { Program, toProgramDTO } from "../../models/program";
import { WorkoutLog, toWorkoutLogDTO } from "../../models/workoutLog";
import { BodyEntry, toBodyEntryDTO } from "../../models/body";
import { Goal, invalidateAllWeeklyReports, toGoalDTO } from "../../models/goal";
import { AppError } from "../../lib/errors";
import type { AppContext } from "../../context";
import { hashPassword } from "./auth.service";
import type { WeeklyReportDTO } from "@fitfloow/core";
import { buildWeeklyReportForUser } from "../body/reports.service";
import {
  assignTemplate,
  deleteUserCascade,
  escapeRegex,
  findUserOr404,
  isDuplicateKeyError,
  toAdminUserDTO,
  toAdminUserDTOs,
} from "./users.service";

const zIdParams = z.object({ id: zId });

/**
 * Same fields as `zAdminUpdateUserInput`, written out without the create-schema defaults:
 * `.partial()` keeps `.default()`s, so a PATCH of one field would otherwise silently reset
 * role / gender / activityLevel / measurementDay.
 */
const zUpdateUser = z.object({
  username: zUsername.optional(),
  displayName: z.string().trim().min(1).max(60).optional(),
  password: zPassword.optional(),
  role: zRole.optional(),
  gender: zGender.optional(),
  heightCm: z.number().min(100).max(250).nullable().optional(),
  birthDate: zDateKey.nullable().optional(),
  activityLevel: zActivityLevel.optional(),
  measurementDay: zWeekday.optional(),
});

/** Weekly report for the admin overview (B3's service); any failure degrades to `null` rather than breaking the overview. */
async function tryWeeklyReport(userId: string, weekKey: string, now: Date): Promise<WeeklyReportDTO | null> {
  try {
    return await buildWeeklyReportForUser(userId, weekKey, now);
  } catch {
    return null;
  }
}

export async function adminUsersRoutes(app: FastifyInstance, opts: { ctx: AppContext }) {
  const { ctx } = opts;
  const admin = { preHandler: [app.requireAdmin] };

  app.get("/admin/users", { ...admin, schema: { querystring: z.object({ q: z.string().optional() }) } }, async (req) => {
    const { q } = req.query as { q?: string };
    const filter: Record<string, unknown> = {};
    if (q && q.trim()) {
      const rx = new RegExp(escapeRegex(q.trim()), "i");
      filter.$or = [{ username: rx }, { displayName: rx }];
    }
    const users = await User.find(filter).sort({ createdAt: 1 }).lean<UserDoc[]>();
    return { users: await toAdminUserDTOs(users) };
  });

  app.post("/admin/users", { ...admin, schema: { body: zAdminCreateUserInput } }, async (req, reply) => {
    const input = req.body as z.infer<typeof zAdminCreateUserInput>;
    if (await User.exists({ username: input.username })) throw AppError.conflict("Bu kullanıcı adı zaten kullanılıyor");
    const { password, ...rest } = input;
    const created = await User.create({ ...rest, passwordHash: await hashPassword(password) }).catch((e: unknown) => {
      if (isDuplicateKeyError(e)) throw AppError.conflict("Bu kullanıcı adı zaten kullanılıyor");
      throw e;
    });
    reply.status(201);
    return { user: await toAdminUserDTO(created.toObject() as UserDoc) };
  });

  app.get("/admin/users/:id", { ...admin, schema: { params: zIdParams } }, async (req) => {
    const user = await findUserOr404((req.params as { id: string }).id);
    return { user: await toAdminUserDTO(user) };
  });

  app.patch("/admin/users/:id", { ...admin, schema: { params: zIdParams, body: zUpdateUser } }, async (req) => {
    const existing = await findUserOr404((req.params as { id: string }).id);
    const input = req.body as z.infer<typeof zUpdateUser>;
    const { password, username, ...rest } = input;
    const set: Record<string, unknown> = { ...rest };
    if (username && username !== existing.username) {
      if (await User.exists({ username, _id: { $ne: existing._id } })) throw AppError.conflict("Bu kullanıcı adı zaten kullanılıyor");
      set.username = username;
    }
    if (password) {
      set.passwordHash = await hashPassword(password);
      set.refreshTokens = [];
    }
    const user = await User.findByIdAndUpdate(existing._id, { $set: set }, { returnDocument: "after" }).lean<UserDoc>();
    if (!user) throw AppError.notFound("Kullanıcı");
    // Moving the measurement day re-keys every week; the cached reports use the old boundary.
    if (input.measurementDay !== undefined && input.measurementDay !== existing.measurementDay) {
      await invalidateAllWeeklyReports(user._id);
    }
    return { user: await toAdminUserDTO(user) };
  });

  app.delete("/admin/users/:id", { ...admin, schema: { params: zIdParams } }, async (req, reply) => {
    const user = await findUserOr404((req.params as { id: string }).id);
    if (String(user._id) === req.auth.id) throw AppError.forbidden("Kendi hesabını silemezsin");
    await deleteUserCascade(user._id);
    return reply.status(204).send();
  });

  app.post(
    "/admin/users/:id/reset-password",
    { ...admin, schema: { params: zIdParams, body: z.object({ password: zPassword }) } },
    async (req, reply) => {
      const user = await findUserOr404((req.params as { id: string }).id);
      const { password } = req.body as { password: string };
      await User.updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(password), refreshTokens: [] } });
      return reply.status(204).send();
    }
  );

  app.post(
    "/admin/users/:id/assign-program",
    { ...admin, schema: { params: zIdParams, body: z.object({ templateId: zId }) } },
    async (req) => {
      const user = await findUserOr404((req.params as { id: string }).id);
      const { templateId } = req.body as { templateId: string };
      return { program: await assignTemplate(user._id, templateId, ctx.now()) };
    }
  );

  app.get("/admin/users/:id/overview", { ...admin, schema: { params: zIdParams } }, async (req) => {
    const user = await findUserOr404((req.params as { id: string }).id);
    const [dto, program, latestBody, goal, lastWorkouts] = await Promise.all([
      toAdminUserDTO(user),
      Program.findOne({ userId: user._id }),
      BodyEntry.findOne({ userId: user._id }).sort({ date: -1 }),
      // Active goal first, otherwise the most recent one.
      Goal.findOne({ userId: user._id, status: "active" }).then((g) => g ?? Goal.findOne({ userId: user._id }).sort({ createdAt: -1 })),
      WorkoutLog.find({ userId: user._id }).sort({ date: -1 }).limit(5),
    ]);
    const weekKey = weekKeyFor(trDateKey(ctx.now()), (user.measurementDay ?? 0) as Weekday);
    return {
      user: dto,
      program: program ? toProgramDTO(program) : null,
      latestBody: latestBody ? toBodyEntryDTO(latestBody) : null,
      goal: goal ? toGoalDTO(goal) : null,
      lastWorkouts: lastWorkouts.map(toWorkoutLogDTO),
      weekReport: await tryWeeklyReport(String(user._id), weekKey, ctx.now()),
    };
  });
}
