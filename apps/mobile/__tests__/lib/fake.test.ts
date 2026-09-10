import { zBodyTrends, zBodySummary, zDayView, zGoalView, zHome, zLoginResponse, zProgramView, zRecoveryView, zUser, zWeeklyReport, zWeekNutrition, zMascotMessage, zFoodSearchResponse, zTrainingStats } from "@fitfloow/core";
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
});
