import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { DEFAULT_MASCOT_MESSAGES } from "@fitfloow/core";
import { createTestApp, type TestApp } from "./harness";
import { runSeed } from "../src/seed/index";
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
    await runSeed();
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
    await runSeed();
    const first = await counts();
    const erenBefore = await User.findOne({ username: "eren" }).lean();
    const programBefore = await Program.findOne({ userId: erenBefore!._id }).lean();

    await runSeed();
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

    await runSeed();

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
    await runSeed();
    const eren = await User.findOne({ username: "eren" }).lean();
    await Program.updateOne({ userId: eren!._id }, { $set: { currentIndex: 3, name: "Kendi Programım" } });
    await runSeed();
    const program = await Program.findOne({ userId: eren!._id }).lean();
    expect(program).toMatchObject({ currentIndex: 3, name: "Kendi Programım" });
    expect(await Program.countDocuments()).toBe(2);
  });

  it("does not resurrect catalog rows an admin deleted (layered, insert-only-when-empty)", async () => {
    await runSeed();
    await Muscle.deleteOne({ key: "forearms" });
    await Exercise.deleteOne({ nameKey: "plank" });
    await runSeed();
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

    await runSeed();

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

    await runSeed();
    await runSeed();

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
    const report = await runSeed();
    expect(report.migrated.workoutLogMuscles).toBe(1);
    expect(report.migrated.workoutLogDateKeys).toBe(1);
    expect(report.created.users).toBe(2);
    const second = await runSeed();
    expect(second.migrated.workoutLogMuscles).toBe(0);
    expect(second.created.users).toBe(0);
  });
});
