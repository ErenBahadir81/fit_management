import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { zBodyEntryInput, zBodyEntryUpdate, zDateKey, zWeighInInput } from "@fitfloow/core";
import type { AppContext } from "../../context";
import {
  bodySummary,
  bodyTrends,
  createBodyEntry,
  deleteBodyEntry,
  deleteWeighIn,
  listBodyEntries,
  listWeighIns,
  updateBodyEntry,
  upsertWeighIn,
} from "./body.service";

const zLimit = z.object({ limit: z.coerce.number().int().min(1).max(500).optional() });
const zDays = z.object({ days: z.coerce.number().int().min(1).max(365).default(90) });
const zId = z.object({ id: z.string().min(1) });

export async function bodyRoutes(app: FastifyInstance, ctx: AppContext) {
  app.addHook("preHandler", app.authenticate);

  app.get("/body/entries", { schema: { querystring: zLimit } }, async (req) => {
    const { limit } = req.query as z.infer<typeof zLimit>;
    return listBodyEntries(req.auth.id, limit);
  });

  app.post("/body/entries", { schema: { body: zBodyEntryInput } }, async (req) => ({
    entry: await createBodyEntry(ctx, req.auth.id, req.body as z.infer<typeof zBodyEntryInput>),
  }));

  app.patch("/body/entries/:id", { schema: { params: zId, body: zBodyEntryUpdate } }, async (req) => ({
    entry: await updateBodyEntry(ctx, req.auth.id, (req.params as z.infer<typeof zId>).id, req.body as z.infer<typeof zBodyEntryUpdate>),
  }));

  app.delete("/body/entries/:id", { schema: { params: zId } }, async (req, reply) => {
    await deleteBodyEntry(req.auth.id, (req.params as z.infer<typeof zId>).id);
    return reply.status(204).send();
  });

  app.get("/body/weighins", { schema: { querystring: zDays } }, async (req) => ({
    weighIns: await listWeighIns(ctx, req.auth.id, (req.query as z.infer<typeof zDays>).days),
  }));

  app.post("/body/weighins", { schema: { body: zWeighInInput.extend({ dateKey: zDateKey.optional() }) } }, async (req) => {
    const { weightKg, dateKey } = req.body as z.infer<typeof zWeighInInput>;
    return { weighIn: await upsertWeighIn(ctx, req.auth.id, weightKg, dateKey) };
  });

  app.delete("/body/weighins/:id", { schema: { params: zId } }, async (req, reply) => {
    await deleteWeighIn(req.auth.id, (req.params as z.infer<typeof zId>).id);
    return reply.status(204).send();
  });

  app.get("/body/trends", { schema: { querystring: zDays } }, async (req) =>
    bodyTrends(ctx, req.auth.id, (req.query as z.infer<typeof zDays>).days)
  );

  app.get("/body/summary", async (req) => bodySummary(ctx, req.auth.id));
}
