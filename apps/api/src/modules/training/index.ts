import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../context";
import { programRoutes } from "./program.routes";
import { workoutRoutes } from "./workouts.routes";
import { recoveryRoutes } from "./recovery.routes";

/**
 * TRAINING module (owner: B2) — program cycle, workout logs, recovery and training stats.
 * All maths live in `@fitfloow/core/training`; these routes only validate, read/write and serialize.
 */
export async function registerTrainingModule(app: FastifyInstance, ctx: AppContext) {
  await app.register(async (scope) => programRoutes(scope, ctx));
  await app.register(async (scope) => workoutRoutes(scope));
  await app.register(async (scope) => recoveryRoutes(scope, ctx));
}
