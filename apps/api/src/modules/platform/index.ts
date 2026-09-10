import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../context";
import { authRoutes } from "./auth.routes";

/**
 * PLATFORM module (owner: B1) — auth, profile, admin users, settings, muscles, exercises,
 * program templates, mascot messages, dashboard, catalog. Orchestrator wrote auth; B1 extends.
 */
export async function registerPlatformModule(app: FastifyInstance, ctx: AppContext) {
  await app.register(authRoutes, { config: ctx.config });
  // B1: await app.register(adminUsersRoutes, ctx); settings; muscles; exercises; templates; mascot; dashboard; catalog
}
