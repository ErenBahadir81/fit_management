import mongoose from "mongoose";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { loadConfig, type AppConfig } from "../src/config";
import { buildApp } from "../src/app";
import { FakeHttpClient } from "../src/lib/http";
import type { HydratedDocument } from "mongoose";
import { User, type UserDoc } from "../src/models/user";
import { hashPassword } from "../src/modules/platform/auth.service";

export interface TestApp {
  app: FastifyInstance;
  http: FakeHttpClient;
  config: AppConfig;
  /** Mutable clock for deterministic time-dependent logic. */
  clock: { now: Date };
  close(): Promise<void>;
  reset(): Promise<void>;
}

/**
 * Builds a Fastify app bound to a fresh database on the shared in-memory mongod
 * (started by test/global-setup.ts). Call `reset()` in beforeEach to wipe collections.
 */
export async function createTestApp(overrides: Partial<Record<string, string>> = {}): Promise<TestApp> {
  const base = process.env.MONGO_TEST_URI;
  if (!base) throw new Error("MONGO_TEST_URI missing — is test/global-setup.ts configured?");
  const dbName = `t_${randomUUID().slice(0, 8)}`;
  const uri = base.replace(/\/?(\?.*)?$/, `/${dbName}$1`);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(uri);
  const config = loadConfig({ ...process.env, NODE_ENV: "test", MONGO_URI: uri, VISION_MOCK: "1", ...overrides });
  const http = new FakeHttpClient();
  const clock = { now: new Date("2026-09-10T09:00:00.000Z") };
  const app = await buildApp({ config, http, now: () => clock.now });
  await app.ready();
  return {
    app,
    http,
    config,
    clock,
    async reset() {
      const cols = await mongoose.connection.db!.collections();
      await Promise.all(cols.map((c) => c.deleteMany({})));
    },
    async close() {
      await app.close();
      await mongoose.connection.db?.dropDatabase();
      await mongoose.disconnect();
    },
  };
}

export interface TestUserOpts {
  username?: string;
  password?: string;
  role?: "admin" | "user";
  gender?: "male" | "female";
  heightCm?: number | null;
  measurementDay?: number;
  activityLevel?: UserDoc["activityLevel"];
  birthDate?: string | null;
}

export type TestUser = HydratedDocument<UserDoc>;

export async function createUser(opts: TestUserOpts = {}): Promise<TestUser> {
  const username = opts.username ?? `user_${randomUUID().slice(0, 6)}`;
  return User.create({
    username,
    displayName: username,
    passwordHash: await hashPassword(opts.password ?? "Asd*123"),
    role: opts.role ?? "user",
    gender: opts.gender ?? "male",
    heightCm: opts.heightCm === undefined ? 178 : opts.heightCm,
    measurementDay: opts.measurementDay ?? 0,
    activityLevel: opts.activityLevel ?? "moderate",
    birthDate: opts.birthDate ?? null,
  });
}

/** Returns auth headers for `user` (creates one if omitted). */
export async function asUser(t: TestApp, opts: TestUserOpts | TestUser = {}) {
  const user = "passwordHash" in opts ? (opts as TestUser) : await createUser(opts as TestUserOpts);
  const accessToken = t.app.signAccessToken({ id: String(user._id), role: user.role });
  return { user, headers: { authorization: `Bearer ${accessToken}` }, token: accessToken };
}

export async function asAdmin(t: TestApp, opts: TestUserOpts = {}) {
  return asUser(t, { ...opts, role: "admin" });
}

/* ------------------------------ basics seed ------------------------------ */
import { DEFAULT_MASCOT_MESSAGES, DEFAULT_SETTINGS } from "@fitfloow/core";
import { Muscle } from "../src/models/muscle";
import { Exercise } from "../src/models/exercise";
import { Settings } from "../src/models/settings";
import { MascotMessage } from "../src/models/mascot";
import { ProgramTemplate } from "../src/models/program";
import { SEED_EXERCISES, SEED_MUSCLES, SEED_TEMPLATES } from "../src/seed/data/index";

/** Inserts muscles, exercises, program templates, settings and mascot messages (idempotent). Use in beforeEach after reset(). */
export async function seedBasics(): Promise<void> {
  if ((await Muscle.countDocuments()) === 0) await Muscle.insertMany(SEED_MUSCLES);
  if ((await Exercise.countDocuments()) === 0)
    await Exercise.insertMany(SEED_EXERCISES.map((e) => ({ ...e, nameKey: e.name.toLowerCase() })));
  if ((await ProgramTemplate.countDocuments()) === 0) await ProgramTemplate.insertMany(SEED_TEMPLATES);
  await Settings.updateOne({ _id: "global" }, { $setOnInsert: { data: DEFAULT_SETTINGS } }, { upsert: true });
  if ((await MascotMessage.countDocuments()) === 0)
    await MascotMessage.insertMany(DEFAULT_MASCOT_MESSAGES.map((m) => ({ ...m, active: true })));
}
