import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../context";
import { authRoutes } from "./auth.routes";
import { catalogRoutes } from "./catalog.routes";
import { adminUsersRoutes } from "./admin.users.routes";
import { adminSettingsRoutes } from "./admin.settings.routes";
import { adminMusclesRoutes } from "./admin.muscles.routes";
import { adminExercisesRoutes } from "./admin.exercises.routes";
import { adminTemplatesRoutes } from "./admin.templates.routes";
import { adminMascotRoutes } from "./admin.mascot.routes";
import { adminDashboardRoutes } from "./admin.dashboard.routes";
import { adminSystemRoutes } from "./admin.system.routes";

/**
 * PLATFORM module (owner: B1) — auth, profile, admin users, settings, muscles, exercises,
 * program templates, mascot messages, dashboard, catalog. Orchestrator wrote auth; B1 extends.
 */
export async function registerPlatformModule(app: FastifyInstance, ctx: AppContext) {
  await app.register(authRoutes, { config: ctx.config });
  await app.register(catalogRoutes);
  await app.register(adminUsersRoutes, { ctx });
  await app.register(adminSettingsRoutes, { ctx });
  await app.register(adminMusclesRoutes);
  await app.register(adminExercisesRoutes);
  await app.register(adminTemplatesRoutes);
  await app.register(adminMascotRoutes);
  await app.register(adminDashboardRoutes, { ctx });
  await app.register(adminSystemRoutes, { ctx });
}
