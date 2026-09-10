import { Schema, model, models, type Model, type Types } from "mongoose";
import type { BodyEntryDTO, WeighInDTO } from "@fitfloow/core";

export interface BodyEntryDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  date: Date;
  dateKey: string;
  gender: "male" | "female";
  heightCm: number;
  neckCm: number;
  waistCm: number;
  hipCm: number | null;
  weightKg: number;
  bodyFatPct: number;
  fatMassKg: number;
  leanMassKg: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const BodyEntrySchema = new Schema<BodyEntryDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, default: Date.now },
    dateKey: { type: String, required: true },
    gender: { type: String, enum: ["male", "female"], required: true },
    heightCm: { type: Number, required: true },
    neckCm: { type: Number, required: true },
    waistCm: { type: Number, required: true },
    hipCm: { type: Number, default: null },
    weightKg: { type: Number, required: true },
    bodyFatPct: { type: Number, required: true },
    fatMassKg: { type: Number, required: true },
    leanMassKg: { type: Number, required: true },
    notes: { type: String, default: null },
  },
  { timestamps: true }
);
BodyEntrySchema.index({ userId: 1, date: -1 });

export const BodyEntry: Model<BodyEntryDoc> = (models.BodyEntry as Model<BodyEntryDoc>) || model<BodyEntryDoc>("BodyEntry", BodyEntrySchema);

export function toBodyEntryDTO(e: BodyEntryDoc): BodyEntryDTO {
  return {
    id: String(e._id),
    date: e.date.toISOString(),
    dateKey: e.dateKey,
    gender: e.gender,
    heightCm: e.heightCm,
    neckCm: e.neckCm,
    waistCm: e.waistCm,
    hipCm: e.hipCm ?? null,
    weightKg: e.weightKg,
    bodyFatPct: e.bodyFatPct,
    fatMassKg: e.fatMassKg,
    leanMassKg: e.leanMassKg,
    notes: e.notes ?? null,
  };
}

export interface WeighInDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  dateKey: string;
  weightKg: number;
  source: "manual" | "bodyEntry";
  createdAt: Date;
  updatedAt: Date;
}

const WeighInSchema = new Schema<WeighInDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dateKey: { type: String, required: true },
    weightKg: { type: Number, required: true },
    source: { type: String, enum: ["manual", "bodyEntry"], default: "manual" },
  },
  { timestamps: true }
);
WeighInSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

export const WeighIn: Model<WeighInDoc> = (models.WeighIn as Model<WeighInDoc>) || model<WeighInDoc>("WeighIn", WeighInSchema);

export function toWeighInDTO(w: WeighInDoc): WeighInDTO {
  return { id: String(w._id), dateKey: w.dateKey, weightKg: w.weightKg, source: w.source, createdAt: w.createdAt.toISOString() };
}
