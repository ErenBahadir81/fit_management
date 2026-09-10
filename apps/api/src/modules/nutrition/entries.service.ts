import { Types } from "mongoose";
import {
  adherence,
  avgTotals,
  emptyTotals,
  entryTotals,
  isDateKey,
  remaining,
  sumTotals,
  trDateKey,
  weekKeyFor,
  weekRange,
  type CreateMealEntryInput,
  type Meal,
  type MealEntryDTO,
  type NutritionDayView,
  type Totals,
  type WeekNutrition,
  type Weekday,
} from "@fitfloow/core";
import { Food, MealEntry, toMealEntryDTO, type FoodDoc, type MealEntryDoc } from "../../models/nutrition";
import { invalidateWeeklyReports } from "../../models/goal";
import { User } from "../../models/user";
import { AppError } from "../../lib/errors";
import type { AppContext } from "../../context";
import { bumpPopularity } from "./foods.service";
import { resolveTarget } from "./target.service";

export const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

async function measurementDay(userId: string): Promise<Weekday> {
  const user = await User.findById(userId).select("measurementDay").lean();
  const d = user?.measurementDay ?? 0;
  return (d >= 0 && d <= 6 ? d : 0) as Weekday;
}

/** Every meal write invalidates the cached weekly report of the week that day belongs to. */
async function invalidateFor(userId: string, dateKeys: string[]): Promise<void> {
  const start = await measurementDay(userId);
  const weeks = [...new Set(dateKeys.map((k) => weekKeyFor(k, start)))];
  await invalidateWeeklyReports(userId, weeks);
}

export function resolveDateKey(ctx: AppContext, date?: string): string {
  return date && isDateKey(date) ? date : trDateKey(ctx.now());
}

async function dayTotalsFor(userId: string, dateKey: string): Promise<Totals> {
  const rows = await MealEntry.find({ userId: new Types.ObjectId(userId), dateKey }).select("totals").lean<Array<{ totals: Totals }>>();
  return sumTotals(rows.map((r) => r.totals));
}

export interface CreatedEntry {
  entry: MealEntryDTO;
  dayTotals: Totals;
}

export async function createEntry(ctx: AppContext, userId: string, input: CreateMealEntryInput): Promise<CreatedEntry> {
  const dateKey = resolveDateKey(ctx, input.dateKey);
  let name: string;
  let per100g = input.custom?.per100g;
  let foodId: Types.ObjectId | null = null;

  if (input.foodId) {
    if (!Types.ObjectId.isValid(input.foodId)) throw AppError.notFound("Besin");
    const food = await Food.findOne({
      _id: input.foodId,
      $or: [{ ownerUserId: null }, { ownerUserId: new Types.ObjectId(userId) }],
    }).lean<FoodDoc>();
    if (!food) throw AppError.notFound("Besin");
    foodId = food._id;
    name = food.name;
    per100g = food.per100g;
  } else {
    if (!input.custom) throw AppError.validation("foodId veya custom gerekli");
    name = input.custom.name;
  }
  if (!per100g) throw AppError.validation("Besin değerleri eksik");

  const totals = entryTotals(input.grams, per100g);
  const doc = await MealEntry.create({
    userId: new Types.ObjectId(userId),
    dateKey,
    meal: input.meal,
    foodId,
    name,
    grams: input.grams,
    per100g,
    totals,
    source: input.source ?? "search",
    scanId: input.scanId && Types.ObjectId.isValid(input.scanId) ? new Types.ObjectId(input.scanId) : null,
    loggedAt: ctx.now(),
  });

  if (foodId) await bumpPopularity(foodId);
  await invalidateFor(userId, [dateKey]);
  return { entry: toMealEntryDTO(doc.toObject() as MealEntryDoc), dayTotals: await dayTotalsFor(userId, dateKey) };
}

export async function updateEntry(
  userId: string,
  id: string,
  patch: { grams?: number; meal?: Meal }
): Promise<CreatedEntry> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound("Öğün kaydı");
  const existing = await MealEntry.findOne({ _id: id, userId: new Types.ObjectId(userId) }).lean<MealEntryDoc>();
  if (!existing) throw AppError.notFound("Öğün kaydı");

  const grams = patch.grams ?? existing.grams;
  const meal = patch.meal ?? existing.meal;
  const doc = await MealEntry.findOneAndUpdate(
    { _id: id, userId: new Types.ObjectId(userId) },
    { $set: { grams, meal, totals: entryTotals(grams, existing.per100g) } },
    { returnDocument: "after" }
  ).lean<MealEntryDoc>();
  if (!doc) throw AppError.notFound("Öğün kaydı");

  await invalidateFor(userId, [doc.dateKey]);
  return { entry: toMealEntryDTO(doc), dayTotals: await dayTotalsFor(userId, doc.dateKey) };
}

export async function deleteEntry(userId: string, id: string): Promise<{ dayTotals: Totals; dateKey: string }> {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound("Öğün kaydı");
  const doc = await MealEntry.findOneAndDelete({ _id: id, userId: new Types.ObjectId(userId) }).lean<MealEntryDoc>();
  if (!doc) throw AppError.notFound("Öğün kaydı");
  await invalidateFor(userId, [doc.dateKey]);
  return { dateKey: doc.dateKey, dayTotals: await dayTotalsFor(userId, doc.dateKey) };
}

/**
 * The whole day screen in one `foods`-free query: the entries are loaded once and every total
 * (day and per meal) is folded from them in core — no second `$group` round-trip.
 */
export async function dayView(ctx: AppContext, userId: string, date?: string): Promise<NutritionDayView> {
  const dateKey = resolveDateKey(ctx, date);
  const [rows, target] = await Promise.all([
    MealEntry.find({ userId: new Types.ObjectId(userId), dateKey }).sort({ loggedAt: 1 }).lean<MealEntryDoc[]>(),
    resolveTarget(ctx, userId),
  ]);

  const meals = { breakfast: [], lunch: [], dinner: [], snack: [] } as Record<Meal, MealEntryDTO[]>;
  for (const row of rows) meals[row.meal]?.push(toMealEntryDTO(row));
  const mealTotals = {
    breakfast: sumTotals(meals.breakfast.map((e) => e.totals)),
    lunch: sumTotals(meals.lunch.map((e) => e.totals)),
    dinner: sumTotals(meals.dinner.map((e) => e.totals)),
    snack: sumTotals(meals.snack.map((e) => e.totals)),
  };
  const totals = sumTotals(MEALS.map((m) => mealTotals[m]));

  return { dateKey, target, totals, remaining: remaining(target, totals), meals, mealTotals };
}

/**
 * Seven days keyed by the user's measurement day. One `$group` aggregation over `mealEntries`,
 * one target lookup. `avg` averages the *logged* days so a half-logged week is not halved twice.
 */
export async function weekView(ctx: AppContext, userId: string, week?: string): Promise<WeekNutrition> {
  const start = await measurementDay(userId);
  const anchor = week && isDateKey(week) ? week : trDateKey(ctx.now());
  const weekKey = weekKeyFor(anchor, start);
  const { keys } = weekRange(weekKey);

  const [grouped, target] = await Promise.all([
    MealEntry.aggregate<{ _id: string; kcal: number; protein: number; carbs: number; fat: number; count: number }>([
      { $match: { userId: new Types.ObjectId(userId), dateKey: { $in: keys } } },
      {
        $group: {
          _id: "$dateKey",
          kcal: { $sum: "$totals.kcal" },
          protein: { $sum: "$totals.protein" },
          carbs: { $sum: "$totals.carbs" },
          fat: { $sum: "$totals.fat" },
          count: { $sum: 1 },
        },
      },
    ]),
    resolveTarget(ctx, userId),
  ]);

  const byKey = new Map(grouped.map((g) => [g._id, g]));
  const days = keys.map((dateKey) => {
    const g = byKey.get(dateKey);
    const totals = g ? sumTotals([{ kcal: g.kcal, protein: g.protein, carbs: g.carbs, fat: g.fat }]) : emptyTotals();
    return { dateKey, totals, target: target.calories, logged: Boolean(g && g.count > 0) };
  });

  const loggedDays = days.filter((d) => d.logged);
  return {
    weekKey,
    days,
    avg: avgTotals(loggedDays.map((d) => d.totals), loggedDays.length),
    adherence: adherence(days, target.calories),
    daysLogged: loggedDays.length,
  };
}
