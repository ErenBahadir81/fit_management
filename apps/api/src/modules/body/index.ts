import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../context";
import { bodyRoutes } from "./body.routes";
import { goalRoutes } from "./goals.routes";
import { reportRoutes } from "./reports.routes";

/**
 * BODY module (owner: B3) — measurements, weigh-ins, trends, goals, weekly reports,
 * the home composite and Floo's message endpoint.
 */
export async function registerBodyModule(app: FastifyInstance, ctx: AppContext) {
  await app.register(bodyRoutes, ctx);
  await app.register(goalRoutes, ctx);
  await app.register(reportRoutes, ctx);
}
