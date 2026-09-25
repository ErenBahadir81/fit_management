import { z } from "zod";
import { patchOf, zDateKey, zId, zIso, zMeal } from "./common";

export const zPer100g = z.object({
  kcal: z.number().min(0).max(900),
  protein: z.number().min(0).max(100),
  carbs: z.number().min(0).max(100),
  fat: z.number().min(0).max(100),
  fiber: z.number().min(0).max(100).optional(),
});
export type Per100g = z.infer<typeof zPer100g>;

export const zTotals = z.object({ kcal: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() });
export type Totals = z.infer<typeof zTotals>;

export const zServing = z.object({ label: z.string().min(1), grams: z.number().positive() });
export const zFoodSource = z.enum(["seed", "off", "usda", "user", "admin"]);

export const zFood = z.object({
  id: zId,
  name: z.string(),
  nameEn: z.string().nullable(),
  aliases: z.array(z.string()),
  category: z.string(),
  per100g: zPer100g,
  defaultServingG: z.number().positive(),
  servings: z.array(zServing),
  source: zFoodSource,
  barcode: z.string().nullable(),
  verified: z.boolean(),
  popularity: z.number().int().min(0),
  brand: z.string().nullable().optional(),
});
export type FoodDTO = z.infer<typeof zFood>;

export const zFoodInput = z.object({
  name: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().max(80).nullable().optional(),
  aliases: z.array(z.string().trim().min(1)).default([]),
  category: z.string().trim().max(40).default("diğer"),
  per100g: zPer100g,
  defaultServingG: z.number().positive().max(2000).default(100),
  servings: z.array(zServing).default([]),
  barcode: z.string().trim().max(32).nullable().optional(),
  verified: z.boolean().default(false),
  brand: z.string().trim().max(60).nullable().optional(),
});
export type FoodInput = z.infer<typeof zFoodInput>;
export const zFoodUpdate = patchOf(zFoodInput);

export const zMealEntry = z.object({
  id: zId,
  dateKey: z.string(),
  meal: zMeal,
  foodId: zId.nullable(),
  name: z.string(),
  grams: z.number(),
  per100g: zPer100g,
  totals: zTotals,
  source: z.enum(["search", "scan", "manual", "barcode", "recent"]),
  scanId: zId.nullable(),
  loggedAt: zIso,
});
export type MealEntryDTO = z.infer<typeof zMealEntry>;

export const zCreateMealEntryInput = z
  .object({
    dateKey: zDateKey.optional(),
    meal: zMeal,
    foodId: zId.optional(),
    custom: z.object({ name: z.string().trim().min(1).max(80), per100g: zPer100g }).optional(),
    grams: z.number().positive().max(5000),
    source: z.enum(["search", "scan", "manual", "barcode", "recent"]).default("search"),
    scanId: zId.optional(),
  })
  .refine((v) => Boolean(v.foodId) !== Boolean(v.custom), { message: "foodId veya custom (yalnız biri) gerekli" });
export type CreateMealEntryInput = z.infer<typeof zCreateMealEntryInput>;
export const zUpdateMealEntryInput = z.object({ grams: z.number().positive().max(5000).optional(), meal: zMeal.optional() });

export const zDietTarget = z.object({
  mode: z.enum(["auto", "manual"]),
  calories: z.number().min(0),
  protein: z.number().min(0),
  carbs: z.number().min(0),
  fat: z.number().min(0),
  derivedFrom: z.enum(["goal", "maintenance", "default"]).nullable(),
});
export type DietTargetDTO = z.infer<typeof zDietTarget>;
export const zDietTargetInput = z.object({
  mode: z.enum(["auto", "manual"]),
  calories: z.number().min(500).max(8000).optional(),
  protein: z.number().min(0).max(500).optional(),
  carbs: z.number().min(0).max(1000).optional(),
  fat: z.number().min(0).max(400).optional(),
});

export const zDayView = z.object({
  dateKey: z.string(),
  target: zDietTarget,
  totals: zTotals,
  remaining: zTotals,
  meals: z.object({
    breakfast: z.array(zMealEntry),
    lunch: z.array(zMealEntry),
    dinner: z.array(zMealEntry),
    snack: z.array(zMealEntry),
  }),
  mealTotals: z.object({ breakfast: zTotals, lunch: zTotals, dinner: zTotals, snack: zTotals }),
});
export type NutritionDayView = z.infer<typeof zDayView>;

export const zWeekNutrition = z.object({
  weekKey: z.string(),
  days: z.array(z.object({ dateKey: z.string(), totals: zTotals, target: z.number(), logged: z.boolean() })),
  avg: zTotals,
  adherence: z.number(),
  daysLogged: z.number().int(),
});
export type WeekNutrition = z.infer<typeof zWeekNutrition>;

/**
 * T6 — another dish the model considered for the same photo ("Bunu mu demek istedin?"). Always
 * mapped to a catalogue food, so picking it can be logged as is.
 */
export const zDetectionAlternative = z.object({
  label: z.string(),
  labelTr: z.string(),
  confidence: z.number().min(0).max(1),
  food: zFood,
  suggestedGrams: z.number().positive(),
});
export type DetectionAlternative = z.infer<typeof zDetectionAlternative>;

/** Most alternatives a detection carries. */
export const MAX_DETECTION_ALTERNATIVES = 3;

export const zDetection = z.object({
  label: z.string(),
  labelTr: z.string(),
  confidence: z.number().min(0).max(1),
  food: zFood.nullable(),
  suggestedGrams: z.number().positive(),
  /**
   * T6 — up to three other candidates for this item, most likely first. Optional: scans stored
   * before T6 (and older API builds) have none, and clients must treat a missing list as empty.
   */
  alternatives: z.array(zDetectionAlternative).max(MAX_DETECTION_ALTERNATIVES).optional(),
});
export type Detection = z.infer<typeof zDetection>;
export const zScanResult = z.object({
  scanId: zId,
  imageUrl: z.string().nullable(),
  detections: z.array(zDetection),
  mock: z.boolean(),
  latencyMs: z.number(),
  modelVersion: z.string(),
});
export type ScanResultDTO = z.infer<typeof zScanResult>;

export const zFoodSearchResponse = z.object({ foods: z.array(zFood), remote: z.array(zFood) });
export type FoodSearchResponse = z.infer<typeof zFoodSearchResponse>;

/** Water for one day: the running total, the goal it counts toward, and how many taps made it. */
export const zWaterDay = z.object({
  dateKey: z.string(),
  totalMl: z.number().min(0),
  goalMl: z.number().positive(),
  count: z.number().int().min(0),
});
export type WaterDay = z.infer<typeof zWaterDay>;
export const zAddWaterInput = z.object({
  ml: z.number().int().min(50).max(2000),
  dateKey: z.string().optional(),
});
export type AddWaterInput = z.infer<typeof zAddWaterInput>;
