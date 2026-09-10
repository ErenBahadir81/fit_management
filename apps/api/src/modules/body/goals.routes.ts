import type { FastifyInstance } from "fastify";
import { zGoalInput, zGoalUpdate } from "@fitfloow/core";
import type { z } from "zod";
import type { AppContext } from "../../context";
import { closeGoal, createGoal, currentGoalView, previewGoal, recalibrateGoal, updateGoal } from "./goals.service";

export async function goalRoutes(app: FastifyInstance, ctx: AppContext) {
  app.addHook("preHandler", app.authenticate);

  app.get("/goals/current", async (req) => currentGoalView(ctx, req.auth.id));

  app.post("/goals/preview", { schema: { body: zGoalInput } }, async (req) => previewGoal(ctx, req.auth.id, req.body as z.infer<typeof zGoalInput>));

  app.post("/goals", { schema: { body: zGoalInput } }, async (req) => ({
    goal: await createGoal(ctx, req.auth.id, req.body as z.infer<typeof zGoalInput>),
  }));

  app.patch("/goals/current", { schema: { body: zGoalUpdate } }, async (req) => ({
    goal: await updateGoal(ctx, req.auth.id, req.body as z.infer<typeof zGoalUpdate>),
  }));

  app.post("/goals/current/recalibrate", async (req) => recalibrateGoal(ctx, req.auth.id));

  app.post("/goals/current/complete", async (req) => ({ goal: await closeGoal(ctx, req.auth.id, "completed") }));

  app.post("/goals/current/abandon", async (req) => ({ goal: await closeGoal(ctx, req.auth.id, "abandoned") }));
}
