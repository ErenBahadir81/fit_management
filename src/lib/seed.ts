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
import { SEED_PROGRAM_DAYS, SEED_INCI_PROGRAM_DAYS } from "./program-data";
import { clamp } from "./utils";

let seedPromise: Promise<void> | null = null;

/** Seed kullanıcılarının varsayılan şifresi (yönetim panelinde de gösterilir). */
const DEFAULT_PASSWORD = "Asd*123";

/* ------------------------------ kullanıcılar ----------------------------- */

/** Eren — 7 günlük split. */
async function createEren(startDayIndex = 0) {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const index = clamp(Math.round(startDayIndex), 0, SEED_PROGRAM_DAYS.length - 1);

  const user = await User.create({
    username: "eren",
    displayName: "Eren",
    passwordHash,
    passwordPlain: DEFAULT_PASSWORD,
    role: "admin",
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

/** İnci — 4 günlük döngü (Squat → Handstand → Leg Raises → Stretch). */
async function createInci(startDayIndex = 0) {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const index = clamp(
    Math.round(startDayIndex),
    0,
    SEED_INCI_PROGRAM_DAYS.length - 1
  );

  const user = await User.create({
    username: "inci",
    displayName: "İnci",
    passwordHash,
    passwordPlain: DEFAULT_PASSWORD,
    role: "user",
    gender: "female",
    heightCm: null,
  });

  await Program.create({
    userId: user._id,
    name: "İnci Programı",
    days: SEED_INCI_PROGRAM_DAYS,
    currentIndex: index,
    weekNumber: 1,
    startedAt: new Date(),
    lastActionAt: new Date(),
  });

  await DietTarget.create({
    userId: user._id,
    calories: 1900,
    protein: 120,
    carbs: 190,
    fat: 60,
  });

  return user;
}

/* ------------------------- katmanlı, izole adımlar ----------------------- */

/** Kullanıcı yoksa oluşturur; varsa ASLA dokunmaz. */
async function ensureUser(
  username: string,
  create: () => Promise<unknown>
): Promise<void> {
  const existing = await User.findOne({ username });
  if (existing) return;
  try {
    await create();
  } catch (e: any) {
    if (e?.code === 11000) return; // yarış durumu — başkası oluşturdu
    throw e;
  }
}

/**
 * Migration: kimseyi bozmadan eksik alanları güvenli şekilde doldurur.
 * - program egzersizlerinde eksik `metric` -> "reps"
 * - antrenman kayıtlarında eksik `metric` -> "reps"
 * - eren/inci hesaplarında eksik `role` / `passwordPlain` -> seed varsayılanları
 * Sadece değişiklik varsa kaydeder; tamamen idempotent. Hata olursa yutulur
 * (kullanıcı girişini bloklamaz; bir sonraki deployda tekrar denenir).
 */
async function migrate(): Promise<void> {
  try {
    const users = await User.find({});
    for (const u of users) {
      let changed = false;
      if (u.role == null) {
        u.role = u.username === "eren" ? "admin" : "user";
        changed = true;
      }
      if (
        u.passwordPlain == null &&
        (u.username === "eren" || u.username === "inci")
      ) {
        u.passwordPlain = DEFAULT_PASSWORD;
        changed = true;
      }
      if (changed) await u.save();
    }

    const programs = await Program.find({});
    for (const p of programs) {
      let changed = false;
      for (const d of p.days ?? []) {
        for (const e of d.exercises ?? []) {
          if (e.metric == null) {
            e.metric = "reps";
            changed = true;
          }
        }
      }
      if (changed) {
        p.markModified("days");
        await p.save();
      }
    }

    const logs = await WorkoutLog.find({ "strength.0": { $exists: true } });
    for (const l of logs) {
      let changed = false;
      for (const e of l.strength ?? []) {
        if (e.metric == null) {
          e.metric = "reps";
          changed = true;
        }
      }
      if (changed) {
        l.markModified("strength");
        await l.save();
      }
    }
  } catch (e) {
    console.error("[seed] migrate hatası (yok sayıldı):", e);
  }
}

async function doSeed() {
  await dbConnect();
  // 1) genel/migration verileri (kimseyi etkilemez)
  await migrate();
  // 2) kullanıcı bazlı seed'ler — her biri eksikse oluşur, diğerini etkilemez
  await ensureUser("eren", () => createEren(0));
  await ensureUser("inci", () => createInci(0));
}

/** Eksik olan her şeyi (migration + Eren + İnci) idempotent kurar. */
export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = doSeed().catch((e) => {
      seedPromise = null; // tekrar denenebilsin
      throw e;
    });
  }
  return seedPromise;
}

/* -------------------------------- reset --------------------------------- */

/**
 * Bir kullanıcının (eren|inci) TÜM verisini siler ve sıfırdan oluşturur.
 * Diğer kullanıcıyı ETKİLEMEZ. startDayIndex programın başlangıç günü.
 */
export async function resetSeed(
  username = "eren",
  startDayIndex = 0
): Promise<{ user: string; startDay: number; dayTitle: string }> {
  await dbConnect();
  const uname = String(username).toLowerCase() === "inci" ? "inci" : "eren";
  const days = uname === "inci" ? SEED_INCI_PROGRAM_DAYS : SEED_PROGRAM_DAYS;
  const index = clamp(Math.round(startDayIndex), 0, days.length - 1);

  const user = await User.findOne({ username: uname });
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

  seedPromise = null; // lazy seed kilidini sıfırla

  if (uname === "inci") await createInci(index);
  else await createEren(index);

  return { user: uname, startDay: index + 1, dayTitle: days[index].title };
}
