import { Schema, model, models, type Model } from "mongoose";
import type { MuscleDTO } from "@fitfloow/core";

export interface MuscleDoc extends MuscleDTO {
  _id: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const MuscleSchema = new Schema<MuscleDoc>(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    short: { type: String, required: true },
    size: { type: String, enum: ["large", "small"], required: true },
    fullRecoveryHours: { type: Number, required: true },
    weeklyTarget: { min: { type: Number }, max: { type: Number, required: true } },
    region: { type: String, enum: ["front", "back", "legs", "core", "arms"], required: true },
    color: { type: String, default: "#6D5DF6" },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Muscle: Model<MuscleDoc> = (models.Muscle as Model<MuscleDoc>) || model<MuscleDoc>("Muscle", MuscleSchema);

export function toMuscleDTO(m: MuscleDoc): MuscleDTO {
  return {
    key: m.key,
    name: m.name,
    short: m.short,
    size: m.size,
    fullRecoveryHours: m.fullRecoveryHours,
    weeklyTarget: { min: m.weeklyTarget?.min ?? undefined, max: m.weeklyTarget?.max ?? 0 },
    region: m.region,
    color: m.color,
    order: m.order,
    active: m.active,
  };
}

/** Active muscles in display order (used by recovery, volume, reports). */
export async function listActiveMuscles(): Promise<MuscleDTO[]> {
  const docs = await Muscle.find({ active: true }).sort({ order: 1 }).lean();
  return docs.map((d) => toMuscleDTO(d as MuscleDoc));
}
