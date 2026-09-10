import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { zCreateMealEntryInput, zDietTargetInput, zFoodInput, zUpdateMealEntryInput } from "@fitfloow/core";
import type { AppContext } from "../../context";
import { MAX_SEARCH_LIMIT, createUserFood, findByBarcode, getFood, recentFoods, searchFoods } from "./foods.service";
import { createEntry, dayView, deleteEntry, updateEntry, weekView } from "./entries.service";
import { resolveTarget, setTarget } from "./target.service";

const zSearchQuery = z.object({
  q: z.string().max(80).default(""),
  limit: z.coerce.number().int().min(1).max(MAX_SEARCH_LIMIT).default(20),
  /** Accepts the client's `remote=1`; anything falsy or absent keeps the request local. */
  remote: z.string().max(8).optional(),
});
const zDateQuery = z.object({ date: z.string().optional() });
const zWeekQuery = z.object({ week: z.string().optional() });
const zIdParam = z.object({ id: z.string().min(1) });
const zCodeParam = z.object({ code: z.string().min(1).max(32) });

export async function foodsRoutes(app: FastifyInstance, ctx: AppContext) {
  const auth = { preHandler: [app.authenticate] };

  /* ------------------------------- foods -------------------------------- */

  app.get("/nutrition/foods/search", { ...auth, schema: { querystring: zSearchQuery } }, async (req) => {
    const q = req.query as z.infer<typeof zSearchQuery>;
    const remote = ["1", "true", "yes", "on"].includes((q.remote ?? "").toLowerCase());
    return searchFoods(ctx, req.auth.id, { q: q.q, limit: q.limit, remote });
  });

  app.get("/nutrition/foods/barcode/:code", { ...auth, schema: { params: zCodeParam } }, async (req) => {
    const { code } = req.params as z.infer<typeof zCodeParam>;
    return { food: await findByBarcode(ctx, req.auth.id, code) };
  });

  app.get("/nutrition/recent", auth, async (req) => ({ foods: await recentFoods(req.auth.id) }));

  app.get("/nutrition/foods/:id", { ...auth, schema: { params: zIdParam } }, async (req) => {
    const { id } = req.params as z.infer<typeof zIdParam>;
    return { food: await getFood(req.auth.id, id) };
  });

  app.post("/nutrition/foods", { ...auth, schema: { body: zFoodInput } }, async (req, reply) => {
    const input = req.body as z.infer<typeof zFoodInput>;
    const food = await createUserFood(req.auth.id, input);
    return reply.status(201).send({ food });
  });

  /* ----------------------------- meal entries --------------------------- */

  app.post("/nutrition/entries", { ...auth, schema: { body: zCreateMealEntryInput } }, async (req, reply) => {
    const input = req.body as z.infer<typeof zCreateMealEntryInput>;
    const result = await createEntry(ctx, req.auth.id, input);
    return reply.status(201).send(result);
  });

  app.patch("/nutrition/entries/:id", { ...auth, schema: { params: zIdParam, body: zUpdateMealEntryInput } }, async (req) => {
    const { id } = req.params as z.infer<typeof zIdParam>;
    return updateEntry(req.auth.id, id, req.body as z.infer<typeof zUpdateMealEntryInput>);
  });

  app.delete("/nutrition/entries/:id", { ...auth, schema: { params: zIdParam } }, async (req, reply) => {
    const { id } = req.params as z.infer<typeof zIdParam>;
    await deleteEntry(req.auth.id, id);
    return reply.status(204).send();
  });

  /* --------------------------- day / week views ------------------------- */

  app.get("/nutrition/day", { ...auth, schema: { querystring: zDateQuery } }, async (req) => {
    const { date } = req.query as z.infer<typeof zDateQuery>;
    return dayView(ctx, req.auth.id, date);
  });

  app.get("/nutrition/week", { ...auth, schema: { querystring: zWeekQuery } }, async (req) => {
    const { week } = req.query as z.infer<typeof zWeekQuery>;
    return weekView(ctx, req.auth.id, week);
  });

  /* -------------------------------- target ------------------------------ */

  app.get("/nutrition/target", auth, async (req) => resolveTarget(ctx, req.auth.id));

  app.put("/nutrition/target", { ...auth, schema: { body: zDietTargetInput } }, async (req) => {
    const input = req.body as z.infer<typeof zDietTargetInput>;
    return setTarget(ctx, req.auth.id, input);
  });
}
