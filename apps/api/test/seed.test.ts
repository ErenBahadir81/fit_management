import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { DEFAULT_MASCOT_MESSAGES } from "@fitfloow/core";
import { createTestApp, type TestApp } from "./harness";
import { runSeed, seedOptionsFromConfig } from "../src/seed/index";
import { SEED_EXERCISES, SEED_MUSCLES, SEED_TEMPLATES } from "../src/seed/data/index";
import { User } from "../src/models/user";
import { Muscle } from "../src/models/muscle";
import { Exercise } from "../src/models/exercise";
import { Program, ProgramTemplate } from "../src/models/program";
import { WorkoutLog } from "../src/models/workoutLog";
import { BodyEntry } from "../src/models/body";
import { DietTarget } from "../src/models/nutrition";
import { MascotMessage } from "../src/models/mascot";
import { Settings, getSettings } from "../src/models/settings";
import { hashPassword } from "../src/modules/platform/auth.service";
import { LEGACY_V1_EXERCISE_MUSCLES } from "../src/seed/catalogActivationV1";

const DEV_SEED = { adminPassword: "Asd*123", userPassword: "Asd*123" };

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.reset();
});

async function counts() {
  return {
    users: await User.countDocuments(),
    muscles: await Muscle.countDocuments(),
    exercises: await Exercise.countDocuments(),
    templates: await ProgramTemplate.countDocuments(),
    programs: await Program.countDocuments(),
    mascot: await MascotMessage.countDocuments(),
    settings: await Settings.countDocuments(),
  };
}

describe("runSeed", () => {
  it("creates the full baseline on an empty database", async () => {
    await runSeed(DEV_SEED);
    expect(await counts()).toEqual({
      users: 2,
      muscles: SEED_MUSCLES.length,
      exercises: SEED_EXERCISES.length,
      templates: SEED_TEMPLATES.length,
      programs: 2,
      mascot: DEFAULT_MASCOT_MESSAGES.length,
      settings: 1,
    });

    const eren = await User.findOne({ username: "eren" }).lean();
    expect(eren).toMatchObject({ role: "admin", gender: "male", heightCm: 178, activityLevel: "moderate", measurementDay: 0, mascotEnabled: true });
    const inci = await User.findOne({ username: "inci" }).lean();
    expect(inci).toMatchObject({ role: "user", gender: "female" });

    const login = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "eren", password: "Asd*123" } });
    expect(login.statusCode).toBe(200);

    const erenProgram = await Program.findOne({ userId: eren!._id }).lean();
    expect(erenProgram!.days).toHaveLength(7);
    expect(erenProgram!.sourceTemplateId).toBeTruthy();
    expect((await Program.findOne({ userId: inci!._id }).lean())!.days).toHaveLength(4);

    const exercise = await Exercise.findOne({ name: "Squat" }).lean();
    expect(exercise!.nameKey).toBe("squat");
    expect((await getSettings()).goal.kcalPerKgFat).toBe(7700);
  });

  it("is idempotent: running twice changes nothing", async () => {
    await runSeed(DEV_SEED);
    const first = await counts();
    const erenBefore = await User.findOne({ username: "eren" }).lean();
    const programBefore = await Program.findOne({ userId: erenBefore!._id }).lean();

    await runSeed(DEV_SEED);
    expect(await counts()).toEqual(first);
    const erenAfter = await User.findOne({ username: "eren" }).lean();
    expect(erenAfter!.passwordHash).toBe(erenBefore!.passwordHash);
    expect(String((await Program.findOne({ userId: erenAfter!._id }).lean())!._id)).toBe(String(programBefore!._id));
  });

  it("never touches an existing user beyond backfilling defaults and dropping passwordPlain", async () => {
    const existing = await User.collection.insertOne({
      username: "eren",
      displayName: "Eski Eren",
      passwordHash: await hashPassword("Baska*123"),
      passwordPlain: "Baska*123",
      role: "admin",
      gender: "male",
      heightCm: 180,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-01T00:00:00Z"),
    });

    await runSeed(DEV_SEED);

    const eren = await User.collection.findOne({ _id: existing.insertedId });
    expect(eren!.displayName).toBe("Eski Eren");
    expect(eren!.heightCm).toBe(180);
    expect(eren!.passwordPlain).toBeUndefined();
    expect(eren!.activityLevel).toBe("moderate");
    expect(eren!.measurementDay).toBe(0);
    expect(eren!.mascotEnabled).toBe(true);
    const login = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "eren", password: "Baska*123" } });
    expect(login.statusCode).toBe(200);
    expect(await User.countDocuments({ username: "eren" })).toBe(1);
  });

  it("keeps an existing program instead of overwriting it", async () => {
    await runSeed(DEV_SEED);
    const eren = await User.findOne({ username: "eren" }).lean();
    await Program.updateOne({ userId: eren!._id }, { $set: { currentIndex: 3, name: "Kendi Programım" } });
    await runSeed(DEV_SEED);
    const program = await Program.findOne({ userId: eren!._id }).lean();
    expect(program).toMatchObject({ currentIndex: 3, name: "Kendi Programım" });
    expect(await Program.countDocuments()).toBe(2);
  });

  it("does not resurrect catalog rows an admin deleted (layered, insert-only-when-empty)", async () => {
    await runSeed(DEV_SEED);
    await Muscle.deleteOne({ key: "forearms" });
    await Exercise.deleteOne({ nameKey: "plank" });
    await runSeed(DEV_SEED);
    expect(await Muscle.countDocuments()).toBe(SEED_MUSCLES.length - 1);
    expect(await Exercise.countDocuments()).toBe(SEED_EXERCISES.length - 1);
  });
});

describe("legacy migration", () => {
  it("converts v1 string[] muscles, backfills dateKeys and dietTarget modes", async () => {
    const userId = new Types.ObjectId();
    await Program.collection.insertOne({
      userId,
      name: "v1 program",
      currentIndex: 0,
      weekNumber: 1,
      days: [
        {
          order: 1,
          title: "Push A",
          kind: "strength",
          exercises: [
            { name: "Push-up", muscles: ["chest", "frontDelt"], targetSets: 5, targetReps: 12 },
            { name: "DB Fly", muscles: [{ key: "chest", load: 0.5 }], targetSets: 4, targetReps: 12 },
          ],
          run: null,
          swim: null,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await WorkoutLog.collection.insertOne({
      userId,
      date: new Date("2026-03-01T22:30:00.000Z"), // 2026-03-02 01:30 in Türkiye
      title: "v1 log",
      strength: [{ name: "Push-up", muscles: ["chest"], sets: [{ reps: 10, rir: 2 }] }],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await BodyEntry.collection.insertOne({
      userId,
      date: new Date("2026-03-01T22:30:00.000Z"),
      gender: "male",
      heightCm: 178,
      neckCm: 38,
      waistCm: 84,
      weightKg: 80,
      bodyFatPct: 18,
      fatMassKg: 14.4,
      leanMassKg: 65.6,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await DietTarget.collection.insertOne({ userId, calories: 2500, protein: 175, carbs: 260, fat: 75, createdAt: new Date(), updatedAt: new Date() });

    await runSeed(DEV_SEED);

    const program = await Program.collection.findOne({ userId });
    expect(program!.days[0].exercises[0].muscles).toEqual([
      { key: "chest", load: 1 },
      { key: "frontDelt", load: 1 },
    ]);
    expect(program!.days[0].exercises[1].muscles).toEqual([{ key: "chest", load: 0.5 }]);

    const log = await WorkoutLog.collection.findOne({ userId });
    expect(log!.strength[0].muscles).toEqual([{ key: "chest", load: 1 }]);
    expect(log!.dateKey).toBe("2026-03-02");

    expect((await BodyEntry.collection.findOne({ userId }))!.dateKey).toBe("2026-03-02");
    expect((await DietTarget.collection.findOne({ userId }))!.mode).toBe("manual");
  });

  it("leaves already migrated documents alone and is safe to re-run", async () => {
    const userId = new Types.ObjectId();
    await WorkoutLog.collection.insertOne({
      userId,
      date: new Date("2026-03-01T22:30:00.000Z"),
      dateKey: "2020-01-01",
      title: "elle girilmiş",
      strength: [{ name: "Push-up", muscles: [{ key: "chest", load: 0.25 }], sets: [] }],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await DietTarget.collection.insertOne({ userId, mode: "auto", calories: 2000, protein: 1, carbs: 1, fat: 1, createdAt: new Date(), updatedAt: new Date() });

    await runSeed(DEV_SEED);
    await runSeed(DEV_SEED);

    const log = await WorkoutLog.collection.findOne({ userId });
    expect(log!.dateKey).toBe("2020-01-01");
    expect(log!.strength[0].muscles).toEqual([{ key: "chest", load: 0.25 }]);
    expect((await DietTarget.collection.findOne({ userId }))!.mode).toBe("auto");
  });

  it("reports what it migrated", async () => {
    const userId = new Types.ObjectId();
    await WorkoutLog.collection.insertOne({
      userId,
      date: new Date("2026-03-01T22:30:00.000Z"),
      title: "v1",
      strength: [{ name: "Push-up", muscles: ["chest"], sets: [] }],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const report = await runSeed(DEV_SEED);
    expect(report.migrated.workoutLogMuscles).toBe(1);
    expect(report.migrated.workoutLogDateKeys).toBe(1);
    expect(report.created.users).toBe(2);
    const second = await runSeed(DEV_SEED);
    expect(second.migrated.workoutLogMuscles).toBe(0);
    expect(second.created.users).toBe(0);
  });
});

describe("runSeed accounts (production safety)", () => {
  const prod = { isProd: true, SEED_ADMIN_PASSWORD: undefined, SEED_USER_PASSWORD: undefined };

  it("creates no seed accounts in production without SEED_*_PASSWORD, but still seeds catalogs", async () => {
    const report = await runSeed(seedOptionsFromConfig(prod));
    expect(await User.countDocuments()).toBe(0);
    expect(await Program.countDocuments()).toBe(0);
    expect(report.skippedUsers).toEqual(["eren", "inci"]);
    expect(await Muscle.countDocuments()).toBe(SEED_MUSCLES.length);
    const login = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "eren", password: "Asd*123" } });
    expect(login.statusCode).toBe(401);
  });

  it("creates only the accounts whose password is provided, with that password", async () => {
    const report = await runSeed(seedOptionsFromConfig({ ...prod, SEED_ADMIN_PASSWORD: "a-long-admin-secret" }));
    expect(report.created.users).toBe(1);
    expect(report.skippedUsers).toEqual(["inci"]);
    const bad = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "eren", password: "Asd*123" } });
    expect(bad.statusCode).toBe(401);
    const ok = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "eren", password: "a-long-admin-secret" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.role).toBe("admin");
  });

  it("creates no accounts when called without options", async () => {
    const report = await runSeed();
    expect(await User.countDocuments()).toBe(0);
    expect(report.skippedUsers).toEqual(["eren", "inci"]);
  });

  it("falls back to the dev default outside production only", () => {
    expect(seedOptionsFromConfig({ isProd: false, SEED_ADMIN_PASSWORD: undefined, SEED_USER_PASSWORD: undefined }).adminPassword).toBe("Asd*123");
    expect(seedOptionsFromConfig(prod).adminPassword).toBeUndefined();
  });

  it("warns in production when an existing account still accepts the dev default password", async () => {
    await User.create({ username: "eren", displayName: "Eren", passwordHash: await hashPassword("Asd*123"), role: "admin" });
    await User.create({ username: "inci", displayName: "İnci", passwordHash: await hashPassword("changed-already"), role: "user" });
    const report = await runSeed(seedOptionsFromConfig(prod));
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain("eren");
    expect((await runSeed(DEV_SEED)).warnings).toEqual([]);
  });
});

/* ------------------------------------------------------------------------------------------------
 * Exercise catalog sync (activation v1): an existing database gets the 143-exercise catalog once.
 * ---------------------------------------------------------------------------------------------- */

/** What a pre-3.0 database holds: the 20 legacy exercises with every load at 1 (the v1 seed). */
async function givenLegacyCatalog(overrides: Record<string, Array<{ key: string; load: number }>> = {}) {
  const now = new Date("2026-01-01T00:00:00Z");
  await Exercise.collection.insertMany(
    Object.entries(LEGACY_V1_EXERCISE_MUSCLES).map(([name, keys]) => ({
      name,
      nameKey: name.toLowerCase(),
      muscles: overrides[name] ?? keys.map((key) => ({ key, load: 1 })),
      defaultSets: 3,
      defaultReps: 10,
      metric: "reps",
      kind: keys.length ? "strength" : "mobility",
      equipment: [],
      instructions: "eski",
      active: true,
      createdAt: now,
      updatedAt: now,
    }))
  );
}

const musclesOf = async (name: string) =>
  (await Exercise.findOne({ name }).lean())?.muscles.map((m) => ({ key: m.key, load: m.load }));
const seedMuscles = (name: string) => SEED_EXERCISES.find((e) => e.name === name)!.muscles;

describe("exercise catalog sync (activation v1)", () => {
  it("seeds the full 143-exercise catalog on an empty database, each row linked by slug", async () => {
    const report = await runSeed(DEV_SEED);
    expect(report.created.exercises).toBe(143);
    expect(await Exercise.countDocuments()).toBe(143);
    expect(await Exercise.countDocuments({ slug: { $type: "string" } })).toBe(143);
    expect(await Exercise.countDocuments({ "muscles.key": "legs" })).toBe(0);
    expect(await musclesOf("Barbell Bench Press")).toEqual(seedMuscles("Barbell Bench Press"));
    expect((await runSeed(DEV_SEED)).created.exercises).toBe(0);
  });

  it("adds the missing exercises and upgrades only untouched legacy loads on a pre-3.0 database", async () => {
    await givenLegacyCatalog({
      "Push-up": [{ key: "chest", load: 0.8 }], // admin edited a load → kept
      Dips: [{ key: "chest", load: 1 }], // admin dropped keys but left load 1 → not the legacy set, kept
    });
    await Exercise.create({ name: "Face Pull", nameKey: "face pull", muscles: [{ key: "rearDelt", load: 1 }], defaultSets: 3, defaultReps: 15 });
    await Exercise.create({ name: "Kendi Hareketim", nameKey: "kendi hareketim", muscles: [{ key: "chest", load: 1 }], defaultSets: 3, defaultReps: 10 });

    const report = await runSeed(DEV_SEED);

    expect(await Exercise.countDocuments()).toBe(143 + 1);
    expect(report.created.exercises).toBe(143 - 20 - 1);
    // 20 legacy rows − 2 edited − Stretch/Mobility (no muscles to upgrade) = 16
    expect(report.migrated.exerciseLoads).toBe(16);
    expect(await musclesOf("Squat")).toEqual(seedMuscles("Squat"));
    expect(await musclesOf("Wall Sit")).toEqual(seedMuscles("Wall Sit"));
    expect(await Exercise.countDocuments({ "muscles.key": "legs" })).toBe(0);
    expect(await musclesOf("Push-up")).toEqual([{ key: "chest", load: 0.8 }]);
    expect(await musclesOf("Dips")).toEqual([{ key: "chest", load: 1 }]);
    expect(await musclesOf("Face Pull")).toEqual([{ key: "rearDelt", load: 1 }]);
    expect(await musclesOf("Kendi Hareketim")).toEqual([{ key: "chest", load: 1 }]);
    // Legacy rows keep everything but their loads; matches get linked to their catalog row.
    expect(await Exercise.findOne({ name: "Squat" }).lean()).toMatchObject({ instructions: "eski", slug: "squat" });
    expect((await Exercise.findOne({ name: "Face Pull" }).lean())!.slug).toBe("face-pull");
    expect((await Exercise.findOne({ name: "Kendi Hareketim" }).lean())!.slug ?? null).toBeNull();
  });

  it("upgrades a legacy row whose muscles are still v1 strings", async () => {
    await givenLegacyCatalog();
    await Exercise.collection.updateOne({ name: "Squat" }, { $set: { muscles: ["legs"] } });
    await runSeed(DEV_SEED);
    expect(await musclesOf("Squat")).toEqual(seedMuscles("Squat"));
  });

  it("runs once: later admin edits, deletions and renames are never undone", async () => {
    await givenLegacyCatalog();
    await runSeed(DEV_SEED);
    const total = await Exercise.countDocuments();

    await Exercise.updateOne({ name: "Squat" }, { $set: { muscles: [{ key: "quads", load: 1 }] } });
    await Exercise.updateOne({ name: "Lunge" }, { $set: { muscles: [{ key: "legs", load: 1 }] } }); // looks legacy again
    await Exercise.deleteOne({ name: "Plank" });
    await Exercise.updateOne({ name: "Push-up" }, { $set: { name: "Şınav", nameKey: "şınav" } });

    const report = await runSeed(DEV_SEED);
    expect(report.created.exercises).toBe(0);
    expect(report.migrated.exerciseLoads).toBe(0);
    expect(await Exercise.countDocuments()).toBe(total - 1);
    expect(await Exercise.exists({ name: "Plank" })).toBeNull();
    expect(await Exercise.exists({ name: "Push-up" })).toBeNull();
    expect(await musclesOf("Squat")).toEqual([{ key: "quads", load: 1 }]);
    expect(await musclesOf("Lunge")).toEqual([{ key: "legs", load: 1 }]);
  });

  it("refreshes untouched legacy snapshots in templates and programs, keeps edited ones", async () => {
    await givenLegacyCatalog();
    const userId = new Types.ObjectId();
    const legacyDay = {
      id: "d1",
      order: 1,
      title: "Bacak",
      focus: "",
      kind: "strength",
      exercises: [
        { name: "Squat", muscles: [{ key: "legs", load: 1 }], targetSets: 4, targetReps: 12, targetRIR: 2, metric: "reps" },
        { name: "Lunge", muscles: [{ key: "quads", load: 0.7 }], targetSets: 3, targetReps: 12, targetRIR: 2, metric: "reps" },
        { name: "Uydurma", muscles: [{ key: "legs", load: 1 }], targetSets: 3, targetReps: 10, targetRIR: null, metric: "reps" },
        { name: "pistol squat", muscles: ["legs"], targetSets: 3, targetReps: 8, targetRIR: 2, metric: "reps" }, // v1 strings, other case
      ],
      run: null,
      swim: null,
    };
    const now = new Date();
    await ProgramTemplate.collection.insertOne({ name: "Eski Şablon", description: "", days: [legacyDay], tags: [], createdAt: now, updatedAt: now });
    await Program.collection.insertOne({
      userId,
      name: "Eski",
      mode: "cycle",
      days: [legacyDay],
      currentDayId: "d1",
      currentIndex: 0,
      weekNumber: 1,
      cycleNumber: 1,
      createdAt: now,
      updatedAt: now,
    });

    const report = await runSeed(DEV_SEED);
    expect(report.migrated.snapshotLoads).toBe(2);

    const docs = [await ProgramTemplate.collection.findOne({ name: "Eski Şablon" }), await Program.collection.findOne({ userId })];
    for (const doc of docs) {
      const [squat, lunge, custom, pistol] = doc!.days[0].exercises;
      expect(squat.muscles).toEqual(seedMuscles("Squat"));
      expect(pistol).toMatchObject({ name: "pistol squat", muscles: seedMuscles("Pistol Squat") });
      expect(squat).toMatchObject({ targetSets: 4, targetReps: 12 });
      expect(lunge.muscles).toEqual([{ key: "quads", load: 0.7 }]);
      expect(custom.muscles).toEqual([{ key: "legs", load: 1 }]); // ad-hoc exercise: not ours to change
    }
    expect((await runSeed(DEV_SEED)).migrated.snapshotLoads).toBe(0);
  });

  it("gives refreshed snapshots the admin's catalog value where the admin had already edited the row", async () => {
    await givenLegacyCatalog({ Squat: [{ key: "quads", load: 1 }, { key: "glutes", load: 0.5 }] });
    const userId = new Types.ObjectId();
    const now = new Date();
    await Program.collection.insertOne({
      userId,
      name: "Eski",
      mode: "cycle",
      days: [{ id: "d1", order: 1, title: "Bacak", focus: "", kind: "strength", exercises: [{ name: "Squat", muscles: ["legs"], targetSets: 4, targetReps: 12 }], run: null, swim: null }],
      currentDayId: "d1",
      currentIndex: 0,
      weekNumber: 1,
      cycleNumber: 1,
      createdAt: now,
      updatedAt: now,
    });
    await runSeed(DEV_SEED);
    expect(await musclesOf("Squat")).toEqual([{ key: "quads", load: 1 }, { key: "glutes", load: 0.5 }]);
    expect((await Program.collection.findOne({ userId }))!.days[0].exercises[0].muscles).toEqual([
      { key: "quads", load: 1 },
      { key: "glutes", load: 0.5 },
    ]);
  });
});
