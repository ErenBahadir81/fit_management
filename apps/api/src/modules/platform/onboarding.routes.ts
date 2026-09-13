/**
 * C3 — `POST /onboarding`. Everything the app used to bury in the Profil tab, asked once, at the
 * start, and turned into a first measurement and a goal.
 *
 * It deliberately delegates: the measurement goes through `body.service` so the Navy body-fat and
 * lean-mass maths run exactly as they do for a normal weigh-in, and the goal goes through
 * `goals.service` so the plan comes from the real engine. Nothing here recomputes either.
 *
 * Idempotent, because a flaky network on the very first screen must not leave a user with two
 * measurements and two goals: the day's measurement is updated in place, and an active goal is
 * returned as it stands rather than replaced.
 */
import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { trDateKey, zOnboardingInput, type OnboardingResponse } from "@fitfloow/core";
import type { AppContext } from "../../context";
import { AppError } from "../../lib/errors";
import { BodyEntry, type BodyEntryDoc } from "../../models/body";
import { Goal, invalidateAllWeeklyReports, toGoalDTO, type GoalDoc } from "../../models/goal";
import { User, toUserDTO } from "../../models/user";
import { createBodyEntry, updateBodyEntry } from "../body/body.service";
import { createGoal } from "../body/goals.service";

export async function onboardingRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post("/onboarding", { preHandler: [app.authenticate], schema: { body: zOnboardingInput } }, async (req): Promise<OnboardingResponse> => {
    const input = req.body as z.infer<typeof zOnboardingInput>;
    const userId = req.auth.id;

    const before = await User.findById(userId).select("measurementDay").lean();
    if (!before) throw new AppError(401, "AUTH_INVALID", "Kullanıcı bulunamadı");

    // The profile has to land first: the body service reads the gender and the goal engine reads
    // the birth date and activity level straight off the user.
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { ...input.profile, onboardingCompleted: true } },
      { returnDocument: "after" }
    );
    if (!user) throw new AppError(401, "AUTH_INVALID", "Kullanıcı bulunamadı");
    if (input.profile.measurementDay !== before.measurementDay) await invalidateAllWeeklyReports(user._id);

    const measurement = {
      gender: input.profile.gender,
      heightCm: input.profile.heightCm,
      weightKg: input.measurement.weightKg,
      neckCm: input.measurement.neckCm,
      waistCm: input.measurement.waistCm,
      hipCm: input.measurement.hipCm ?? null,
    };
    const todayKey = trDateKey(ctx.now());
    const existing = await BodyEntry.findOne({ userId: user._id, dateKey: todayKey }).sort({ date: -1, _id: -1 }).lean<BodyEntryDoc>();
    const bodyEntry = existing
      ? await updateBodyEntry(ctx, userId, String(existing._id), measurement)
      : await createBodyEntry(ctx, userId, measurement);

    let goal = null;
    if (input.goal) {
      const active = await Goal.findOne({ userId: user._id, status: "active" }).lean<GoalDoc>();
      goal = active ? toGoalDTO(active) : await createGoal(ctx, userId, input.goal);
    }

    // Re-read: creating the measurement writes gender/height back onto the user.
    const fresh = await User.findById(userId);
    if (!fresh) throw new AppError(401, "AUTH_INVALID", "Kullanıcı bulunamadı");
    return { user: toUserDTO(fresh), bodyEntry, goal };
  });
}
