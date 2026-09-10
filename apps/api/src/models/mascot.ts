import mongoose, { Schema, model, type Model, type Types } from "mongoose";
import type { MascotTemplateDTO } from "@fitfloow/core";

export interface MascotMessageDoc {
  _id: Types.ObjectId;
  key: string;
  mood: "happy" | "cheer" | "think" | "sleepy" | "flex" | "worried";
  variants: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MascotMessageSchema = new Schema<MascotMessageDoc>(
  {
    key: { type: String, required: true, unique: true },
    mood: { type: String, enum: ["happy", "cheer", "think", "sleepy", "flex", "worried"], default: "happy" },
    variants: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const MascotMessage: Model<MascotMessageDoc> =
  (mongoose.models.MascotMessage as Model<MascotMessageDoc>) || model<MascotMessageDoc>("MascotMessage", MascotMessageSchema);

export function toMascotTemplateDTO(m: MascotMessageDoc): MascotTemplateDTO {
  return { id: String(m._id), key: m.key, mood: m.mood, variants: m.variants, active: m.active };
}
