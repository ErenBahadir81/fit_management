/**
 * C3 — `GET /me/energy`, the numbers behind the "yaklaşık kalori ihtiyacın" card in the diet tab.
 *
 * Nothing is recomputed here: expenditure comes from the goal engine's own `bmrFor` / `tdeeFor`
 * and the daily target comes from the same `computeAutoTarget` the nutrition module serves, so the
 * card can never disagree with the plan it is describing.
 */
import type { FastifyInstance } from "fastify";
import { ageFromBirthDate, bmrFor, round, tdeeFor, trDateKey, type EnergyDTO } from "@fitfloow/core";
import type { AppContext } from "../../context";
import { AppError } from "../../lib/errors";
import { BodyEntry, type BodyEntryDoc } from "../../models/body";
import { getSettings } from "../../models/settings";
import { User, type UserDoc } from "../../models/user";
import { computeAutoTarget } from "../nutrition/target.service";

export async function energyRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/me/energy", { preHandler: [app.authenticate] }, async (req): Promise<EnergyDTO> => {
    const userId = req.auth.id;
    const todayKey = trDateKey(ctx.now());
    const [user, body, settings, target] = await Promise.all([
      User.findById(userId).lean<UserDoc>(),
      BodyEntry.findOne({ userId }).sort({ date: -1, _id: -1 }).lean<BodyEntryDoc>(),
      getSettings(),
      computeAutoTarget(ctx, userId),
    ]);
    if (!user) throw new AppError(401, "AUTH_INVALID", "Kullanıcı bulunamadı");

    const activityLevel = user.activityLevel ?? "moderate";
    const activityMultiplier = settings.goal.activityMultipliers[activityLevel] ?? 1.55;
    const leanMassKg = typeof body?.leanMassKg === "number" ? round(body.leanMassKg, 2) : null;

    // No measurement means no lean mass, and without lean mass there is no honest expenditure
    // figure — so we report zero and, crucially, no deficit rather than a made-up one.
    const bmr =
      body && leanMassKg
        ? bmrFor({
            sex: body.gender ?? user.gender,
            weightKg: body.weightKg,
            heightCm: body.heightCm ?? user.heightCm ?? 175,
            leanMassKg,
            age: user.birthDate ? ageFromBirthDate(user.birthDate, todayKey) : null,
            settings: settings.goal,
          }).bmr
        : 0;
    const tdee = bmr > 0 ? tdeeFor(bmr, activityLevel, settings.goal) : 0;
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
  });
}
