import { z } from "zod";
import { zDateKey, zGender, zId, zIso } from "./common";

export const zBodyEntry = z.object({
  id: zId,
  date: zIso,
  dateKey: z.string(),
  gender: zGender,
  heightCm: z.number(),
  neckCm: z.number(),
  waistCm: z.number(),
  hipCm: z.number().nullable(),
  weightKg: z.number(),
  bodyFatPct: z.number(),
  fatMassKg: z.number(),
  leanMassKg: z.number(),
  notes: z.string().nullable(),
});
export type BodyEntryDTO = z.infer<typeof zBodyEntry>;

export const zBodyEntryInput = z.object({
  gender: zGender.optional(),
  heightCm: z.number().min(100).max(250),
  neckCm: z.number().min(20).max(80),
  waistCm: z.number().min(40).max(250),
  hipCm: z.number().min(50).max(250).nullable().optional(),
  weightKg: z.number().min(25).max(400),
  date: zIso.optional(),
  notes: z.string().max(300).nullable().optional(),
});
export type BodyEntryInput = z.infer<typeof zBodyEntryInput>;
export const zBodyEntryUpdate = zBodyEntryInput.partial();

export const zWeighIn = z.object({
  id: zId,
  dateKey: z.string(),
  weightKg: z.number(),
  source: z.enum(["manual", "bodyEntry"]),
  createdAt: zIso,
});
export type WeighInDTO = z.infer<typeof zWeighIn>;
export const zWeighInInput = z.object({ weightKg: z.number().min(25).max(400), dateKey: zDateKey.optional() });
export type WeighInInput = z.infer<typeof zWeighInInput>;

export const zTrendPoint = z.object({
  dateKey: z.string(),
  weightKg: z.number().nullable(),
  weightEwma: z.number().nullable(),
  bodyFatPct: z.number().nullable(),
  leanMassKg: z.number().nullable(),
  waistCm: z.number().nullable(),
});
export type TrendPoint = z.infer<typeof zTrendPoint>;
export const zBodyTrends = z.object({
  points: z.array(zTrendPoint),
  summary: z.object({
    weightDelta7d: z.number().nullable(),
    weightDelta30d: z.number().nullable(),
    bfDelta30d: z.number().nullable(),
    waistDelta30d: z.number().nullable(),
    ewmaLatest: z.number().nullable(),
  }),
});
export type BodyTrends = z.infer<typeof zBodyTrends>;

export const zBodySummary = z.object({
  latest: zBodyEntry.nullable(),
  prev: zBodyEntry.nullable(),
  latestWeighIn: zWeighIn.nullable(),
  ewmaWeightKg: z.number().nullable(),
  deltas: z.object({
    weightKg: z.number().nullable(),
    bodyFatPct: z.number().nullable(),
    leanMassKg: z.number().nullable(),
    waistCm: z.number().nullable(),
  }),
  category: z.enum(["essential", "athletic", "fit", "average", "high"]).nullable(),
  profile: z.object({ gender: zGender, heightCm: z.number().nullable() }),
});
export type BodySummary = z.infer<typeof zBodySummary>;
