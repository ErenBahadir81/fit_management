import mongoose, { Schema, model, type Model } from "mongoose";
import { DEFAULT_SETTINGS, zSettings, type SettingsDTO } from "@fitfloow/core";

export interface SettingsDoc {
  _id: string; // "global"
  data: SettingsDTO;
  updatedAt: Date;
  createdAt: Date;
}

const SettingsSchema = new Schema<SettingsDoc>(
  { _id: { type: String, default: "global" }, data: { type: Schema.Types.Mixed, required: true } },
  { timestamps: true, minimize: false }
);

export const Settings: Model<SettingsDoc> = (mongoose.models.Settings as Model<SettingsDoc>) || model<SettingsDoc>("Settings", SettingsSchema);

/** Read (and lazily create) the global settings singleton, always validated against the schema defaults. */
export async function getSettings(): Promise<SettingsDTO> {
  const doc = await Settings.findById("global").lean();
  if (!doc) {
    await Settings.updateOne({ _id: "global" }, { $setOnInsert: { data: DEFAULT_SETTINGS } }, { upsert: true });
    return DEFAULT_SETTINGS;
  }
  const parsed = zSettings.safeParse({ ...DEFAULT_SETTINGS, ...(doc.data as object) });
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}
