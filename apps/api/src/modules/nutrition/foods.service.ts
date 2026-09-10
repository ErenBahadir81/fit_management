import { Types } from "mongoose";
import { rankFoods, searchKey, type FoodDTO, type FoodInput } from "@fitfloow/core";
import { Food, MealEntry, toFoodDTO, type FoodDoc } from "../../models/nutrition";
import { AppError } from "../../lib/errors";
import type { AppContext } from "../../context";
import { offBarcode, offSearch, type ExternalFood } from "./off";

export const MAX_SEARCH_LIMIT = 30;
const CANDIDATE_LIMIT = 150;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Foods visible to a user: the shared catalogue plus their own private foods. */
function visibility(userId: string) {
  return { $or: [{ ownerUserId: null }, { ownerUserId: new Types.ObjectId(userId) }] };
}

/**
 * One indexed query over `foods`, ranked in core.
 *
 * The `$or` combines the anchored `searchKey` prefix (index seek), exact alias hits (multikey index)
 * and an unanchored fold-aware regex; `rankFoods` then applies the tier ordering
 * (exact > prefix > alias > word start > contains) with popularity as a tie-breaker only.
 */
export async function searchLocalFoods(userId: string, query: string, limit = 20): Promise<FoodDTO[]> {
  const cap = Math.min(Math.max(limit, 1), MAX_SEARCH_LIMIT);
  const key = searchKey(query);
  if (key === "") {
    const popular = await Food.find(visibility(userId)).sort({ popularity: -1, name: 1 }).limit(cap).lean<FoodDoc[]>();
    return popular.map(toFoodDTO);
  }
  const esc = escapeRegex(key);
  const candidates = await Food.find({
    $and: [
      visibility(userId),
      {
        $or: [
          { searchKey: { $regex: `^${esc}` } },
          { searchKey: { $regex: esc } },
          { aliases: { $in: [key, query.trim().toLowerCase(), query.trim()] } },
          { aliases: { $regex: esc, $options: "i" } },
        ],
      },
    ],
  })
    .limit(CANDIDATE_LIMIT)
    .lean<FoodDoc[]>();

  const ranked = rankFoods(
    candidates.map((f) => ({ ...f, searchKey: f.searchKey ?? searchKey(f.name), aliases: f.aliases ?? [], popularity: f.popularity ?? 0, verified: f.verified })),
    query,
    cap
  );
  return ranked.map((f) => toFoodDTO(f as unknown as FoodDoc));
}

/** Upsert an OFF/USDA result into `foods` so the next lookup is local. Returns the stored food. */
export async function cacheExternalFood(food: ExternalFood): Promise<FoodDTO> {
  const filter = food.barcode ? { barcode: food.barcode } : { externalId: food.externalId };
  const doc = await Food.findOneAndUpdate(
    filter,
    {
      $set: {
        name: food.name,
        nameEn: food.nameEn,
        searchKey: searchKey(food.name),
        category: food.category,
        per100g: food.per100g,
        defaultServingG: food.defaultServingG,
        servings: food.servings,
        source: food.source,
        barcode: food.barcode,
        externalId: food.externalId,
        brand: food.brand,
      },
      $addToSet: { aliases: { $each: food.aliases } },
      $setOnInsert: { verified: false, popularity: 0, ownerUserId: null },
    },
    { upsert: true, returnDocument: "after" }
  ).lean<FoodDoc>();
  return toFoodDTO(doc!);
}

export interface FoodSearchResult {
  foods: FoodDTO[];
  remote: FoodDTO[];
}

export async function searchFoods(
  ctx: AppContext,
  userId: string,
  opts: { q: string; limit?: number; remote?: boolean }
): Promise<FoodSearchResult> {
  const foods = await searchLocalFoods(userId, opts.q, opts.limit);
  if (!opts.remote || opts.q.trim() === "") return { foods, remote: [] };

  const known = new Set(foods.map((f) => f.id));
  const upstream = await offSearch(ctx, opts.q, 10);
  const remote: FoodDTO[] = [];
  for (const item of upstream) {
    const cached = await cacheExternalFood(item);
    if (!known.has(cached.id)) remote.push(cached);
  }
  return { foods, remote };
}

export async function getFood(userId: string, id: string): Promise<FoodDTO> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound("Besin");
  const doc = await Food.findOne({ _id: id, ...visibility(userId) }).lean<FoodDoc>();
  if (!doc) throw AppError.notFound("Besin");
  return toFoodDTO(doc);
}

/** Mongo duplicate-key (a taken barcode) reads as a conflict, not an internal error. */
export function rethrowDuplicate(err: unknown): never {
  if ((err as { code?: number })?.code === 11000) throw AppError.conflict("Bu barkod başka bir besine ait");
  throw err;
}

/** A user-private food (`source: "user"`, `ownerUserId` set) — never visible to anyone else. */
export async function createUserFood(userId: string, input: FoodInput): Promise<FoodDTO> {
  const doc = await Food.create({
    name: input.name,
    nameEn: input.nameEn ?? null,
    searchKey: searchKey(input.name),
    aliases: input.aliases ?? [],
    category: input.category ?? "diğer",
    per100g: input.per100g,
    defaultServingG: input.defaultServingG ?? 100,
    servings: input.servings ?? [],
    source: "user",
    barcode: input.barcode ?? null,
    externalId: null,
    verified: false,
    popularity: 0,
    ownerUserId: new Types.ObjectId(userId),
    brand: input.brand ?? null,
  }).catch(rethrowDuplicate);
  return toFoodDTO(doc.toObject() as FoodDoc);
}

/** Local barcode hit, else Open Food Facts (cached on the way back), else null. */
export async function findByBarcode(ctx: AppContext, userId: string, code: string): Promise<FoodDTO | null> {
  const trimmed = code.trim();
  if (trimmed === "") return null;
  const local = await Food.findOne({ barcode: trimmed, ...visibility(userId) }).lean<FoodDoc>();
  if (local) return toFoodDTO(local);
  const upstream = await offBarcode(ctx, trimmed);
  if (!upstream) return null;
  return cacheExternalFood(upstream);
}

/** Last 20 distinct foods the user logged, most recent first — one aggregation. */
export async function recentFoods(userId: string, limit = 20): Promise<FoodDTO[]> {
  const rows = await MealEntry.aggregate<{ food: FoodDoc }>([
    { $match: { userId: new Types.ObjectId(userId), foodId: { $ne: null } } },
    { $sort: { loggedAt: -1 } },
    { $group: { _id: "$foodId", loggedAt: { $first: "$loggedAt" } } },
    { $sort: { loggedAt: -1 } },
    { $limit: Math.min(Math.max(limit, 1), 50) },
    { $lookup: { from: "foods", localField: "_id", foreignField: "_id", as: "food" } },
    { $unwind: "$food" },
    { $project: { _id: 0, food: 1 } },
  ]);
  return rows.map((r) => toFoodDTO(r.food));
}

/** Popularity drives search tie-breaks; bumping is fire-and-forget. */
export async function bumpPopularity(foodId: Types.ObjectId | string): Promise<void> {
  await Food.updateOne({ _id: foodId }, { $inc: { popularity: 1 } });
}
