import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../context";
import { programRoutes } from "./program.routes";
import { workoutRoutes } from "./workouts.routes";
import { recoveryRoutes } from "./recovery.routes";
import { migrateTraining } from "./migrate";

/**
 * TRAINING module (owner: B2) — program cycle, workout logs, recovery and training stats.
 * All maths live in `@fitfloow/core/training`; these routes only validate, read/write and serialize.
 */
export async function registerTrainingModule(app: FastifyInstance, ctx: AppContext) {
  await app.register(async (scope) => programRoutes(scope, ctx));
  await app.register(async (scope) => workoutRoutes(scope));
  await app.register(async (scope) => recoveryRoutes(scope, ctx));
  // 3.0 data upgrades (unique day index, exercise name keys). Idempotent; only when a DB is up.
  app.addHook("onReady", async () => {
    const mongoose = (await import("mongoose")).default;
    if (mongoose.connection.readyState === 1) await migrateTraining(app.log);
  });
}
