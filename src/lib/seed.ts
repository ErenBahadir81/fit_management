import bcrypt from "bcryptjs";
import { dbConnect } from "./mongodb";
import {
  User,
  Program,
  DietTarget,
  WorkoutLog,
  BodyEntry,
  DietLog,
} from "./models";
import { SEED_PROGRAM_DAYS } from "./program-data";
import { clamp } from "./utils";

let seedPromise: Promise<void> | null = null;

/** Eren kullanıcısını + programını + diyet hedefini oluşturur.
 *  startDayIndex: programın başlayacağı gün (0 = 1. gün ... 6 = 7. gün). */
async function createEren(startDayIndex = 0) {
  const passwordHash = await bcrypt.hash("Asd*123", 10);
  const index = clamp(Math.round(startDayIndex), 0, 6);

  const user = await User.create({
    username: "eren",
    displayName: "Eren",
    passwordHash,
    gender: "male",
    heightCm: 178,
  });

  await Program.create({
    userId: user._id,
    name: "Haftalık Split",
    days: SEED_PROGRAM_DAYS,
    currentIndex: index,
    weekNumber: 1,
    startedAt: new Date(),
    lastActionAt: new Date(),
  });

  await DietTarget.create({
    userId: user._id,
    calories: 2500,
    protein: 175,
    carbs: 260,
    fat: 75,
  });

  return user;
}

async function doSeed() {
  await dbConnect();
  const existing = await User.findOne({ username: "eren" });
  if (existing) return;
  try {
    await createEren(0);
  } catch (e: any) {
    // yarış durumu: başka istek aynı anda oluşturmuş olabilir
    if (e?.code === 11000) return;
    throw e;
  }
}

/** İlk kullanıcı (Eren) ve programı yoksa oluşturur. Idempotent. */
export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = doSeed().catch((e) => {
      seedPromise = null; // tekrar denenebilsin
      throw e;
    });
  }
  return seedPromise;
}

/**
 * Eren'e ait TÜM veriyi siler (program, antrenman kayıtları, vücut ölçümleri,
 * diyet) ve sıfırdan yeniden oluşturur.
 * startDayIndex ile programın hangi günden başlayacağını belirler (0..6).
 * Döndürür: { startDay, dayTitle }.
 */
export async function resetSeed(
  startDayIndex = 0
): Promise<{ startDay: number; dayTitle: string }> {
  await dbConnect();
  const index = clamp(Math.round(startDayIndex), 0, 6);

  const user = await User.findOne({ username: "eren" });
  if (user) {
    const uid = user._id;
    await Promise.all([
      Program.deleteMany({ userId: uid }),
      WorkoutLog.deleteMany({ userId: uid }),
      BodyEntry.deleteMany({ userId: uid }),
      DietTarget.deleteMany({ userId: uid }),
      DietLog.deleteMany({ userId: uid }),
    ]);
    await User.deleteOne({ _id: uid });
  }

  // lazy seed kilidini sıfırla ki ensureSeeded yeniden çalışabilsin
  seedPromise = null;

  await createEren(index);
  return { startDay: index + 1, dayTitle: SEED_PROGRAM_DAYS[index].title };
}
