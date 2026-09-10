import { Schema, model, models, type Model, type Types } from "mongoose";
import type { FoodDTO, MealEntryDTO, Per100g, Totals } from "@fitfloow/core";

const Per100gSchema = new Schema(
  { kcal: Number, protein: Number, carbs: Number, fat: Number, fiber: { type: Number, default: undefined } },
  { _id: false }
);
const TotalsSchema = new Schema({ kcal: Number, protein: Number, carbs: Number, fat: Number }, { _id: false });

export interface FoodDoc {
  _id: Types.ObjectId;
  name: string;
  nameEn: string | null;
  searchKey: string;
  aliases: string[];
  category: string;
  per100g: Per100g;
  defaultServingG: number;
  servings: Array<{ label: string; grams: number }>;
  source: "seed" | "off" | "usda" | "user" | "admin";
  barcode: string | null;
  externalId: string | null;
  verified: boolean;
  popularity: number;
  ownerUserId: Types.ObjectId | null;
  brand: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const FoodSchema = new Schema<FoodDoc>(
  {
    name: { type: String, required: true },
    nameEn: { type: String, default: null },
    searchKey: { type: String, required: true, index: true },
    aliases: { type: [String], default: [] },
    category: { type: String, default: "diğer" },
    per100g: { type: Per100gSchema, required: true },
    defaultServingG: { type: Number, default: 100 },
    servings: { type: [{ label: String, grams: Number, _id: false }], default: [] },
    source: { type: String, enum: ["seed", "off", "usda", "user", "admin"], default: "seed" },
    barcode: { type: String, default: null },
    externalId: { type: String, default: null },
    verified: { type: Boolean, default: false },
    popularity: { type: Number, default: 0 },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    brand: { type: String, default: null },
  },
  { timestamps: true }
);
FoodSchema.index({ barcode: 1 }, { unique: true, sparse: true });
FoodSchema.index({ aliases: 1 });
FoodSchema.index({ name: "text", nameEn: "text", aliases: "text" }, { default_language: "none" });

export const Food: Model<FoodDoc> = (models.Food as Model<FoodDoc>) || model<FoodDoc>("Food", FoodSchema);

export function toFoodDTO(f: FoodDoc): FoodDTO {
  return {
    id: String(f._id),
    name: f.name,
    nameEn: f.nameEn ?? null,
    aliases: f.aliases ?? [],
    category: f.category,
    per100g: { kcal: f.per100g.kcal, protein: f.per100g.protein, carbs: f.per100g.carbs, fat: f.per100g.fat, fiber: f.per100g.fiber },
    defaultServingG: f.defaultServingG,
    servings: f.servings ?? [],
    source: f.source,
    barcode: f.barcode ?? null,
    verified: f.verified,
    popularity: f.popularity ?? 0,
    brand: f.brand ?? null,
  };
}

export interface MealEntryDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  dateKey: string;
  meal: "breakfast" | "lunch" | "dinner" | "snack";
  foodId: Types.ObjectId | null;
  name: string;
  grams: number;
  per100g: Per100g;
  totals: Totals;
  source: "search" | "scan" | "manual" | "barcode" | "recent";
  scanId: Types.ObjectId | null;
  loggedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MealEntrySchema = new Schema<MealEntryDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dateKey: { type: String, required: true },
    meal: { type: String, enum: ["breakfast", "lunch", "dinner", "snack"], required: true },
    foodId: { type: Schema.Types.ObjectId, ref: "Food", default: null },
    name: { type: String, required: true },
    grams: { type: Number, required: true },
    per100g: { type: Per100gSchema, required: true },
    totals: { type: TotalsSchema, required: true },
    source: { type: String, enum: ["search", "scan", "manual", "barcode", "recent"], default: "search" },
    scanId: { type: Schema.Types.ObjectId, ref: "Scan", default: null },
    loggedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
MealEntrySchema.index({ userId: 1, dateKey: 1 });

export const MealEntry: Model<MealEntryDoc> = (models.MealEntry as Model<MealEntryDoc>) || model<MealEntryDoc>("MealEntry", MealEntrySchema);

export function toMealEntryDTO(m: MealEntryDoc): MealEntryDTO {
  return {
    id: String(m._id),
    dateKey: m.dateKey,
    meal: m.meal,
    foodId: m.foodId ? String(m.foodId) : null,
    name: m.name,
    grams: m.grams,
    per100g: { kcal: m.per100g.kcal, protein: m.per100g.protein, carbs: m.per100g.carbs, fat: m.per100g.fat },
    totals: { kcal: m.totals.kcal, protein: m.totals.protein, carbs: m.totals.carbs, fat: m.totals.fat },
    source: m.source,
    scanId: m.scanId ? String(m.scanId) : null,
    loggedAt: m.loggedAt.toISOString(),
  };
}

export interface DietTargetDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  mode: "auto" | "manual";
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  createdAt: Date;
  updatedAt: Date;
}
const DietTargetSchema = new Schema<DietTargetDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    mode: { type: String, enum: ["auto", "manual"], default: "auto" },
    calories: { type: Number, default: 2000 },
    protein: { type: Number, default: 150 },
    carbs: { type: Number, default: 200 },
    fat: { type: Number, default: 65 },
  },
  { timestamps: true }
);
export const DietTarget: Model<DietTargetDoc> = (models.DietTarget as Model<DietTargetDoc>) || model<DietTargetDoc>("DietTarget", DietTargetSchema);

export interface ScanDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  imagePath: string | null;
  width: number | null;
  height: number | null;
  detections: Array<{ label: string; labelTr: string; confidence: number; foodId: Types.ObjectId | null; suggestedGrams: number }>;
  modelVersion: string;
  latencyMs: number;
  mock: boolean;
  loggedEntryId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}
const ScanSchema = new Schema<ScanDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    imagePath: { type: String, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    detections: {
      type: [
        {
          label: String,
          labelTr: String,
          confidence: Number,
          foodId: { type: Schema.Types.ObjectId, default: null },
          suggestedGrams: Number,
          _id: false,
        },
      ],
      default: [],
    },
    modelVersion: { type: String, default: "mock" },
    latencyMs: { type: Number, default: 0 },
    mock: { type: Boolean, default: true },
    loggedEntryId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);
export const Scan: Model<ScanDoc> = (models.Scan as Model<ScanDoc>) || model<ScanDoc>("Scan", ScanSchema);
