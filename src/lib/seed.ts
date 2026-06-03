import bcrypt from "bcryptjs";
import { dbConnect } from "./mongodb";
import { User, Program, DietTarget } from "./models";
import { SEED_PROGRAM_DAYS } from "./program-data";

let seedPromise: Promise<void> | null = null;

async function doSeed() {
  await dbConnect();
  const existing = await User.findOne({ username: "eren" });
  if (existing) return;

  const passwordHash = await bcrypt.hash("Asd*123", 10);
  let user;
  try {
    user = await User.create({
      username: "eren",
      displayName: "Eren",
      passwordHash,
      gender: "male",
      heightCm: 178,
    });
  } catch (e: any) {
    // yarış durumu: başka istek aynı anda oluşturmuş olabilir
    if (e?.code === 11000) return;
    throw e;
  }

  await Program.create({
    userId: user._id,
    name: "Haftalık Split",
    days: SEED_PROGRAM_DAYS,
    currentIndex: 0,
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
