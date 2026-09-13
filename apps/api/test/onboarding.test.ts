/**
 * C3 — sign-up, the one-time onboarding questionnaire, and the energy card behind it.
 *
 * Until now an account could only be minted by an admin, so there was no way into the app at all.
 * `/onboarding` deliberately goes through body.service and goals.service rather than writing its
 * own documents: the Navy body-fat maths and the goal engine must produce exactly what they
 * produce for a normal measurement.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestApp, createUser, seedBasics, type TestApp } from "./harness";
import { BodyEntry } from "../src/models/body";
import { Goal } from "../src/models/goal";
import { User } from "../src/models/user";
import { REGISTER_RATE_LIMIT } from "../src/modules/platform/auth.routes";
import { zEnergy, zOnboardingResponse, zUser } from "@fitfloow/core";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.reset();
  await seedBasics();
  t.clock.now = new Date("2026-09-10T09:00:00.000Z");
});

const TODAY = "2026-09-10";
const post = (url: string, payload: unknown, headers?: Record<string, string>) =>
  t.app.inject({ method: "POST", url: `/api/v1${url}`, payload: payload as object, headers });

const ONBOARDING = {
  profile: { gender: "male", birthDate: "1996-04-12", heightCm: 180, activityLevel: "moderate", measurementDay: 3 },
  measurement: { weightKg: 88, neckCm: 39, waistCm: 96 },
  goal: { targetBodyFatPct: 15, profile: "optimal" },
};

describe("POST /auth/register", () => {
  it("creates the account and signs the user straight in", async () => {
    const res = await post("/auth/register", { username: "Yeni", password: "coksaglam", displayName: "Yeni Kullanıcı" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeTypeOf("string");
    expect(body.refreshToken).toBeTypeOf("string");
    expect(() => zUser.parse(body.user)).not.toThrow();
    expect(body.user).toMatchObject({ username: "yeni", displayName: "Yeni Kullanıcı", role: "user", onboardingCompleted: false, email: null });
    expect(body.user.passwordHash).toBeUndefined();

    const me = await t.app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { authorization: `Bearer ${body.accessToken}` } });
    expect(me.json().user.username).toBe("yeni");
  });

  it("stores an optional email, lowercased", async () => {
    const res = await post("/auth/register", { username: "eposta", password: "coksaglam", displayName: "E", email: "Eren@Example.COM" });
    expect(res.json().user.email).toBe("eren@example.com");
  });

  it("lets the new account log in with the password it chose", async () => {
    await post("/auth/register", { username: "girisyap", password: "coksaglam", displayName: "G" });
    const login = await post("/auth/login", { username: "girisyap", password: "coksaglam" });
    expect(login.statusCode).toBe(200);
  });

  it("answers a taken username with a clean 409, not a duplicate-key stack", async () => {
    await createUser({ username: "dolu" });
    const res = await post("/auth/register", { username: "Dolu", password: "coksaglam", displayName: "D" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
    expect(res.json().error.message).toBe("Bu kullanıcı adı alınmış");
    expect(JSON.stringify(res.json())).not.toMatch(/E11000|duplicate|MongoServerError/i);
  });

  it("wants a password of at least 8 characters", async () => {
    const res = await post("/auth/register", { username: "kisa", password: "1234567", displayName: "K" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
    expect(await User.countDocuments({ username: "kisa" })).toBe(0);
  });

  it("is rate limited per IP, from req.ip and never a client header", () => {
    expect(REGISTER_RATE_LIMIT.max).toBe(20);
    expect(REGISTER_RATE_LIMIT.keyGenerator({ ip: "1.2.3.4" } as never)).toBe("register:1.2.3.4");
  });
});

describe("POST /onboarding", () => {
  it("requires auth", async () => {
    expect((await post("/onboarding", ONBOARDING)).statusCode).toBe(401);
  });

  it("writes the profile, the first measurement and the goal in one call", async () => {
    const { user, headers } = await asUser(t, { heightCm: null, measurementDay: 0 });
    const res = await post("/onboarding", ONBOARDING, headers);
    expect(res.statusCode).toBe(200);
    expect(() => zOnboardingResponse.parse(res.json())).not.toThrow();

    const body = res.json();
    expect(body.user).toMatchObject({ heightCm: 180, birthDate: "1996-04-12", measurementDay: 3, activityLevel: "moderate", onboardingCompleted: true });
    // Navy body fat computed by body.service, exactly as a normal measurement would be.
    expect(body.bodyEntry.dateKey).toBe(TODAY);
    expect(body.bodyEntry.bodyFatPct).toBeGreaterThan(15);
    expect(body.bodyEntry.bodyFatPct).toBeLessThan(35);
    expect(body.bodyEntry.leanMassKg).toBeCloseTo(88 - body.bodyEntry.fatMassKg, 1);
    // Goal computed by the real engine.
    expect(body.goal.targetBodyFatPct).toBe(15);
    expect(body.goal.plan.estimatedWeeks).toBeGreaterThan(0);
    expect(body.goal.plan.roadmap.length).toBe(body.goal.plan.estimatedWeeks);

    const stored = await User.findById(user._id).lean();
    expect(stored?.onboardingCompleted).toBe(true);
    expect(await BodyEntry.countDocuments({ userId: user._id })).toBe(1);
    expect(await Goal.countDocuments({ userId: user._id, status: "active" })).toBe(1);
  });

  it("is idempotent: a second call makes no second measurement and no second active goal", async () => {
    const { user, headers } = await asUser(t);
    const first = await post("/onboarding", ONBOARDING, headers);
    const second = await post("/onboarding", { ...ONBOARDING, measurement: { ...ONBOARDING.measurement, waistCm: 94 } }, headers);
    expect(second.statusCode).toBe(200);

    expect(await BodyEntry.countDocuments({ userId: user._id })).toBe(1);
    expect(await Goal.countDocuments({ userId: user._id, status: "active" })).toBe(1);
    expect(second.json().goal.id).toBe(first.json().goal.id);
    // The re-sent measurement updates the existing day rather than stacking a second one.
    expect(second.json().bodyEntry.waistCm).toBe(94);
  });

  it("accepts 'no goal yet' and still records the profile and measurement", async () => {
    const { user, headers } = await asUser(t);
    const res = await post("/onboarding", { ...ONBOARDING, goal: null }, headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().goal).toBeNull();
    expect(res.json().user.onboardingCompleted).toBe(true);
    expect(await BodyEntry.countDocuments({ userId: user._id })).toBe(1);
    expect(await Goal.countDocuments({ userId: user._id })).toBe(0);
  });

  it("asks women for the hip measurement the Navy formula needs", async () => {
    const { headers } = await asUser(t, { gender: "female" });
    const res = await post("/onboarding", { ...ONBOARDING, profile: { ...ONBOARDING.profile, gender: "female" } }, headers);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe("Kadınlar için kalça ölçüsü gerekli");
  });

  it("rejects a body that is missing the measurement block", async () => {
    const { headers } = await asUser(t);
    const res = await post("/onboarding", { profile: ONBOARDING.profile }, headers);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });
});

describe("GET /me/energy", () => {
  const energy = (headers: Record<string, string>) => t.app.inject({ method: "GET", url: "/api/v1/me/energy", headers });

  it("requires auth", async () => {
    expect((await t.app.inject({ method: "GET", url: "/api/v1/me/energy" })).statusCode).toBe(401);
  });

  it("claims no deficit at all before there is any measurement", async () => {
    const { headers } = await asUser(t);
    const res = await energy(headers);
    expect(res.statusCode).toBe(200);
    expect(() => zEnergy.parse(res.json())).not.toThrow();
    const e = res.json();
    // Without a measurement there is no lean mass, so there is no honest maintenance figure —
    // and therefore no deficit to report.
    expect(e).toMatchObject({ derivedFrom: "default", leanMassKg: null, bmr: 0, tdee: 0, dailyDeficit: 0 });
    expect(e.maintenanceCalories).toBe(e.targetCalories);
  });

  it("uses lean mass and the activity multiplier once a measurement exists", async () => {
    const { headers } = await asUser(t, { activityLevel: "active" });
    await post("/onboarding", { ...ONBOARDING, profile: { ...ONBOARDING.profile, activityLevel: "active" }, goal: null }, headers);
    const e = (await energy(headers)).json();
    expect(e.derivedFrom).toBe("maintenance");
    expect(e.activityLevel).toBe("active");
    expect(e.activityMultiplier).toBeGreaterThan(1.5);
    expect(e.leanMassKg).toBeGreaterThan(50);
    expect(e.bmr).toBeGreaterThan(1200);
    expect(e.bmr).toBeLessThan(2500);
    expect(Math.abs(e.tdee - e.bmr * e.activityMultiplier)).toBeLessThan(2); // whole-kcal rounding
    expect(e.maintenanceCalories).toBe(e.tdee);
    expect(e.dailyDeficit).toBe(e.maintenanceCalories - e.targetCalories);
  });

  it("reports the goal's daily target and the deficit it implies", async () => {
    const { headers } = await asUser(t);
    await post("/onboarding", ONBOARDING, headers);
    const e = (await energy(headers)).json();
    expect(e.derivedFrom).toBe("goal");
    expect(e.targetCalories).toBeLessThan(e.maintenanceCalories);
    expect(e.dailyDeficit).toBe(e.maintenanceCalories - e.targetCalories);
    expect(e.dailyDeficit).toBeGreaterThan(0);
  });
});
