import type { FastifyInstance } from "fastify";
import { zGoalAdjustmentAnswer, zGoalInput, zGoalUpdate, zTrainingLevel } from "@fitfloow/core";
import { z } from "zod";
import type { AppContext } from "../../context";
import {
  acceptAdjustment,
  bodyAssessment,
  closeGoal,
  createGoal,
  currentGoalView,
  dismissAdjustment,
  previewGoal,
  recalibrateGoal,
  updateGoal,
} from "./goals.service";

const zAssessmentQuery = z.object({ trainingLevel: zTrainingLevel.optional() });

export async function goalRoutes(app: FastifyInstance, ctx: AppContext) {
  app.addHook("preHandler", app.authenticate);

  /** Active goal + progress + (T7) Floo's feedback and a pending adjustment. Call after every entry. */
  app.get("/goals/current", async (req) => currentGoalView(ctx, req.auth.id));

  /** T7 — FFMI + body fat of the latest measurement and the recommended goal. */
  app.get("/goals/assessment", { schema: { querystring: zAssessmentQuery } }, async (req) => ({
    assessment: await bodyAssessment(req.auth.id, (req.query as z.infer<typeof zAssessmentQuery>).trainingLevel ?? null),
  }));

  app.post("/goals/preview", { schema: { body: zGoalInput } }, async (req) => previewGoal(ctx, req.auth.id, req.body as z.infer<typeof zGoalInput>));

  app.post("/goals", { schema: { body: zGoalInput } }, async (req) => ({
    goal: await createGoal(ctx, req.auth.id, req.body as z.infer<typeof zGoalInput>),
  }));

  app.patch("/goals/current", { schema: { body: zGoalUpdate } }, async (req) => ({
    goal: await updateGoal(ctx, req.auth.id, req.body as z.infer<typeof zGoalUpdate>),
  }));

  app.post("/goals/current/recalibrate", async (req) => recalibrateGoal(ctx, req.auth.id));

  /** T7 — one-tap accept of the pending adjustment (`action` omitted → the recommended option). */
  app.post("/goals/current/adjustment/accept", { schema: { body: zGoalAdjustmentAnswer } }, async (req) =>
    acceptAdjustment(ctx, req.auth.id, req.body as z.infer<typeof zGoalAdjustmentAnswer>)
  );

  /** T7 — "not now": the proposal is recorded as dismissed and the cool-down restarts. */
  app.post("/goals/current/adjustment/dismiss", { schema: { body: zGoalAdjustmentAnswer } }, async (req) =>
    dismissAdjustment(ctx, req.auth.id, req.body as z.infer<typeof zGoalAdjustmentAnswer>)
  );

  app.post("/goals/current/complete", async (req) => ({ goal: await closeGoal(ctx, req.auth.id, "completed") }));

  app.post("/goals/current/abandon", async (req) => ({ goal: await closeGoal(ctx, req.auth.id, "abandoned") }));
}
