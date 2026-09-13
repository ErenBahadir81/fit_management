import { zBodyTrends, zBodySummary, zDayView, zGoalView, zHome, zLoginResponse, zProgramView, zRecoveryView, zUser, zWeeklyReport, zWeekNutrition, zMascotMessage, zFoodSearchResponse, zTrainingStats, zEnergy } from "@fitfloow/core";
import { ApiClientError } from "@fitfloow/api-client";
import { createFakeApi, FAKE_CREDENTIALS } from "../../src/lib/fake";

describe("FakeApi (EXPO_PUBLIC_API_FAKE=1)", () => {
  test("login with the demo credentials returns tokens + a valid user; wrong password → 401 AUTH_INVALID", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const res = await api.auth.login(FAKE_CREDENTIALS.username, FAKE_CREDENTIALS.password);
    expect(() => zLoginResponse.parse(res)).not.toThrow();
    expect(res.user.username).toBe("eren");
    await expect(api.auth.login("eren", "nope")).rejects.toMatchObject({ status: 401, code: "AUTH_INVALID" });
  });

  test("protected routes without a session → 401 AUTH_REQUIRED, unknown route → 404", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    await expect(api.reports.home()).rejects.toMatchObject({ status: 401 });
    const signed = createFakeApi({ latencyMs: 0, signedIn: true });
    await expect(signed.transport.request("/nope")).rejects.toBeInstanceOf(ApiClientError);
    await expect(signed.transport.request("/nope")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  test("every composite the foundation screens use parses against the core schemas", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    expect(() => zHome.parse(undefined)).toThrow();
    const home = await api.reports.home();
    expect(() => zHome.parse(home)).not.toThrow();
    expect(home.user.displayName.length).toBeGreaterThan(0);
    expect(home.today.calories.target).toBeGreaterThan(0);
    expect(home.recovery.top.length).toBeGreaterThan(0);
    const checks: Array<[{ parse: (v: unknown) => unknown }, unknown]> = [
      [zUser, (await api.auth.me()).user],
      [zMascotMessage, await api.mascot.message("home")],
      [zWeeklyReport, await api.reports.weekly()],
      [zBodyTrends, await api.body.trends(90)],
      [zBodySummary, await api.body.summary()],
      [zGoalView, await api.goals.current()],
      [zProgramView, await api.training.program()],
      [zRecoveryView, await api.training.recovery()],
      [zTrainingStats, await api.training.stats()],
      [zDayView, await api.nutrition.day()],
      [zWeekNutrition, await api.nutrition.week()],
      [zFoodSearchResponse, await api.nutrition.search("yumurta")],
    ];
    for (const [schema, value] of checks) expect(() => schema.parse(value)).not.toThrow();
  });

  test("PATCH /me persists into the fake state", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    const { user } = await api.me.update({ measurementDay: 3, heightCm: 181 });
    expect(user.measurementDay).toBe(3);
    const me = await api.auth.me();
    expect(me.user.heightCm).toBe(181);
  });

  test("weigh-in upsert updates the home composite (weighedIn) and trends", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    const before = await api.reports.home();
    expect(before.today.weighedIn).toBe(false);
    await api.body.createWeighIn({ weightKg: 79.4 });
    const after = await api.reports.home();
    expect(after.today.weighedIn).toBe(true);
  });

  test("logout invalidates the session", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    await api.auth.logout();
    await expect(api.auth.me()).rejects.toMatchObject({ status: 401 });
  });

  /* ------------------------- C1: set weight (kg) ------------------------- */

  test("last performance returns the most recent loaded sets, and an empty answer for a new movement", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    const bench = await api.training.lastPerformance("Bench Press");
    expect(bench.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(bench.sets.length).toBeGreaterThan(0);
    expect(bench.sets[0].weightKg).toBeGreaterThan(0);

    // Bodyweight work has no load, and that must read as null rather than 0 kg.
    const pullups = await api.training.lastPerformance("Pull-up");
    expect(pullups.sets[0].weightKg).toBeNull();

    expect(await api.training.lastPerformance("Hiç Yapılmadı")).toEqual({ dateKey: null, sets: [] });
  });

  /* ------------------- C3: register, onboarding, energy ------------------ */

  test("register signs in a genuinely new account: no history, onboarding not done", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    const res = await api.auth.register({ username: "Yeni", password: "coksaglam", displayName: "Yeni Kullanıcı", email: "Yeni@Example.com" });
    expect(() => zLoginResponse.parse(res)).not.toThrow();
    expect(res.user).toMatchObject({ username: "yeni", onboardingCompleted: false, email: "yeni@example.com", heightCm: null });

    const goal = await api.goals.current();
    expect(goal.goal).toBeNull();
    expect((await api.training.workouts()).logs).toEqual([]);
  });

  test("register rejects a short password and a taken username", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    await expect(api.auth.register({ username: "kisa", password: "1234567", displayName: "K" })).rejects.toMatchObject({ status: 400 });
    await expect(api.auth.register({ username: "eren", password: "coksaglam", displayName: "E" })).rejects.toMatchObject({ status: 409 });
  });

  test("onboarding writes the profile, the first measurement and the goal, and is safe to call twice", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    await api.auth.register({ username: "yeni", password: "coksaglam", displayName: "Yeni" });
    const body = {
      profile: { gender: "male", birthDate: "1996-04-12", heightCm: 180, activityLevel: "moderate", measurementDay: 3 },
      measurement: { weightKg: 88, neckCm: 39, waistCm: 96 },
      goal: { targetBodyFatPct: 15, profile: "optimal" },
    } as const;

    const first = await api.onboarding.complete(body);
    expect(first.user).toMatchObject({ onboardingCompleted: true, heightCm: 180, measurementDay: 3 });
    expect(first.bodyEntry.bodyFatPct).toBeGreaterThan(0);
    expect(first.goal?.plan.estimatedWeeks).toBeGreaterThan(0);
    expect(first.goal?.plan.summaryTr).toContain("kcal");
    expect(first.goal?.plan.milestones.length).toBeGreaterThan(0);

    const second = await api.onboarding.complete({ ...body, measurement: { ...body.measurement, waistCm: 94 } });
    expect(second.goal?.id).toBe(first.goal?.id);
    expect((await api.body.entries()).entries).toHaveLength(1);
    expect(second.bodyEntry.waistCm).toBe(94);
  });

  test("onboarding asks women for the hip measurement", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    await expect(
      api.onboarding.complete({
        profile: { gender: "female", birthDate: "1998-01-01", heightCm: 166, activityLevel: "light", measurementDay: 1 },
        measurement: { weightKg: 62, neckCm: 31, waistCm: 72 },
        goal: null,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  test("energy reports the deficit the plan implies, and claims none without a measurement", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    const e = await api.me.energy();
    expect(() => zEnergy.parse(e)).not.toThrow();
    expect(e.leanMassKg).toBeGreaterThan(0);
    expect(e.dailyDeficit).toBe(e.maintenanceCalories - e.targetCalories);

    const fresh = createFakeApi({ latencyMs: 0 });
    await fresh.auth.register({ username: "bos", password: "coksaglam", displayName: "Boş" });
    const none = await fresh.me.energy();
    expect(none).toMatchObject({ derivedFrom: "default", leanMassKg: null, bmr: 0, dailyDeficit: 0 });
  });
});
