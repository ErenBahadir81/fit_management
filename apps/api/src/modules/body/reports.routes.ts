import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { zDateKey } from "@fitfloow/core";
import type { AppContext } from "../../context";
import { homeView, weeklyHistory, weeklyReport, MAX_HISTORY_WEEKS } from "./reports.service";
import { mascotMessage, type MascotContext } from "./mascot.service";

const zWeekQuery = z.object({ week: zDateKey.optional() });
const zHistoryQuery = z.object({ limit: z.coerce.number().int().min(1).max(MAX_HISTORY_WEEKS).default(12) });
const zMascotQuery = z.object({ context: z.enum(["home", "report", "scan", "workout", "body", "goal"]).default("home") });

export async function reportRoutes(app: FastifyInstance, ctx: AppContext) {
  app.addHook("preHandler", app.authenticate);

  app.get("/reports/weekly", { schema: { querystring: zWeekQuery } }, async (req) =>
    weeklyReport(ctx, req.auth.id, (req.query as z.infer<typeof zWeekQuery>).week)
  );

  app.get("/reports/weekly/history", { schema: { querystring: zHistoryQuery } }, async (req) => ({
    weeks: await weeklyHistory(ctx, req.auth.id, (req.query as z.infer<typeof zHistoryQuery>).limit),
  }));

  app.get("/reports/home", async (req) => homeView(ctx, req.auth.id));

  app.get("/mascot/message", { schema: { querystring: zMascotQuery } }, async (req) =>
    mascotMessage(ctx, req.auth.id, (req.query as z.infer<typeof zMascotQuery>).context as MascotContext)
  );
}
