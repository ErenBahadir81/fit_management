import type { FastifyInstance } from "fastify";
import { Types } from "mongoose";
import { z } from "zod";
import { labelTr, labelToTitle, searchKey, zFoodInput, zFoodUpdate, type Detection, type FoodDTO } from "@fitfloow/core";
import { Food, Scan, toFoodDTO, type FoodDoc, type ScanDoc } from "../../models/nutrition";
import { User } from "../../models/user";
import { AppError } from "../../lib/errors";
import type { AppContext } from "../../context";
import { cacheExternalFood, rethrowDuplicate } from "./foods.service";
import { offSearch } from "./off";
import { usdaSearch } from "./usda";
import { scanImageUrl } from "./uploads";

const zListQuery = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  source: z.enum(["seed", "off", "usda", "user", "admin"]).optional(),
});
const zIdParam = z.object({ id: z.string().min(1) });
const zImportBody = z.object({
  query: z.string().trim().min(2).max(80),
  source: z.enum(["off", "usda"]),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
const zScansQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function adminFoodsRoutes(app: FastifyInstance, ctx: AppContext) {
  const admin = { preHandler: [app.requireAdmin] };

  app.get("/admin/foods", { ...admin, schema: { querystring: zListQuery } }, async (req) => {
    const { q, limit, source } = req.query as z.infer<typeof zListQuery>;
    const filter: Record<string, unknown> = {};
    if (source) filter.source = source;
    const key = searchKey(q ?? "");
    if (key !== "") {
      filter.$or = [{ searchKey: { $regex: escapeRegex(key) } }, { aliases: { $regex: escapeRegex(key), $options: "i" } }];
    }
    const [foods, total] = await Promise.all([
      Food.find(filter).sort({ popularity: -1, name: 1 }).limit(limit).lean<FoodDoc[]>(),
      Food.countDocuments(filter),
    ]);
    return { foods: foods.map(toFoodDTO), total };
  });

  app.post("/admin/foods", { ...admin, schema: { body: zFoodInput } }, async (req, reply) => {
    const input = req.body as z.infer<typeof zFoodInput>;
    const doc = await Food.create({
      name: input.name,
      nameEn: input.nameEn ?? null,
      searchKey: searchKey(input.name),
      aliases: input.aliases ?? [],
      category: input.category ?? "diğer",
      per100g: input.per100g,
      defaultServingG: input.defaultServingG ?? 100,
      servings: input.servings ?? [],
      source: "admin",
      barcode: input.barcode ?? null,
      externalId: null,
      verified: input.verified,
      popularity: 0,
      ownerUserId: null,
      brand: input.brand ?? null,
    }).catch(rethrowDuplicate);
    return reply.status(201).send({ food: toFoodDTO(doc.toObject() as FoodDoc) });
  });

  app.patch("/admin/foods/:id", { ...admin, schema: { params: zIdParam, body: zFoodUpdate } }, async (req) => {
    const { id } = req.params as z.infer<typeof zIdParam>;
    if (!Types.ObjectId.isValid(id)) throw AppError.notFound("Besin");
    const input = req.body as z.infer<typeof zFoodUpdate>;
    const $set: Record<string, unknown> = { ...input };
    if (input.name) $set.searchKey = searchKey(input.name);
    const doc = await Food.findByIdAndUpdate(id, { $set }, { returnDocument: "after" }).lean<FoodDoc>().catch(rethrowDuplicate);
    if (!doc) throw AppError.notFound("Besin");
    return { food: toFoodDTO(doc) };
  });

  app.delete("/admin/foods/:id", { ...admin, schema: { params: zIdParam } }, async (req, reply) => {
    const { id } = req.params as z.infer<typeof zIdParam>;
    if (!Types.ObjectId.isValid(id)) throw AppError.notFound("Besin");
    const doc = await Food.findByIdAndDelete(id).lean<FoodDoc>();
    if (!doc) throw AppError.notFound("Besin");
    return reply.status(204).send();
  });

  /** Import from Open Food Facts or USDA FDC; every imported row is cached in `foods`. */
  app.post("/admin/foods/import", { ...admin, schema: { body: zImportBody } }, async (req) => {
    const { query, source, limit } = req.body as z.infer<typeof zImportBody>;
    const upstream = source === "off" ? await offSearch(ctx, query, limit) : await usdaSearch(ctx, query, limit);
    const foods: FoodDTO[] = [];
    for (const item of upstream) foods.push(await cacheExternalFood(item));
    return { foods };
  });

  app.get("/admin/scans", { ...admin, schema: { querystring: zScansQuery } }, async (req) => {
    const { limit } = req.query as z.infer<typeof zScansQuery>;
    const scans = await Scan.find().sort({ createdAt: -1 }).limit(limit).lean<ScanDoc[]>();
    if (scans.length === 0) return { scans: [] };

    const userIds = [...new Set(scans.map((s) => String(s.userId)))];
    const foodIds = [...new Set(scans.flatMap((s) => (s.detections ?? []).map((d) => d.foodId).filter(Boolean).map(String)))];
    const [users, foods] = await Promise.all([
      User.find({ _id: { $in: userIds } }).select("username").lean(),
      foodIds.length > 0 ? Food.find({ _id: { $in: foodIds } }).lean<FoodDoc[]>() : Promise.resolve([] as FoodDoc[]),
    ]);
    const usernames = new Map(users.map((u) => [String(u._id), u.username]));
    const foodById = new Map(foods.map((f) => [String(f._id), f]));

    return {
      scans: scans.map((s) => ({
        id: String(s._id),
        userId: String(s.userId),
        username: usernames.get(String(s.userId)) ?? "?",
        imageUrl: s.imagePath ? scanImageUrl(String(s.userId), String(s._id)) : null,
        detections: (s.detections ?? []).map((d): Detection => {
          const food = d.foodId ? foodById.get(String(d.foodId)) : undefined;
          return {
            label: d.label,
            labelTr: d.labelTr || labelTr(d.label) || labelToTitle(d.label),
            confidence: d.confidence,
            food: food ? toFoodDTO(food) : null,
            suggestedGrams: d.suggestedGrams,
          };
        }),
        mock: s.mock,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  });
}
