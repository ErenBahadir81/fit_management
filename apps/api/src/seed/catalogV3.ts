import mongoose from "mongoose";
import { Muscle } from "../models/muscle";
import { SEED_MUSCLES } from "./data/muscles";

const MARKER = "catalog-v3-muscles";

/**
 * One-time upgrade of an existing database to the 17-muscle catalog (T3). Seeding is otherwise
 * insert-only-when-empty, so a v1 database would never see rearDelt, quads, … . This adds the
 * missing muscles once and retires the v1 catch-all `legs` (kept, inactive). A marker document
 * makes it run exactly once, so muscles an admin deletes afterwards are not resurrected.
 * Returns how many muscles it inserted.
 */
export async function upgradeMusclesToV3(): Promise<number> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Veritabanı bağlantısı yok");
  const markers = db.collection<{ _id: string; at: Date }>("migrations");
  if (await markers.findOne({ _id: MARKER })) return 0;

  const existing = new Set((await Muscle.find({}).select({ key: 1 }).lean()).map((m) => m.key));
  const missing = SEED_MUSCLES.filter((m) => !existing.has(m.key));
  if (missing.length > 0) await Muscle.insertMany(missing);
  if (missing.some((m) => m.key === "quads")) await Muscle.updateOne({ key: "legs" }, { $set: { active: false } });
  await markers.updateOne({ _id: MARKER }, { $set: { at: new Date() } }, { upsert: true });
  return missing.length;
}
