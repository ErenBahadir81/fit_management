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
