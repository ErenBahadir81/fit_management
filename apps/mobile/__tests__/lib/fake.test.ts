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
    expect(() => zUser.parse((await api.auth.me()).user)).not.toThrow();
    expect(() => zMascotMessage.parse(await api.mascot.message("home"))).not.toThrow();
    expect(() => zWeeklyReport.parse(await api.reports.weekly())).not.toThrow();
    expect(() => zBodyTrends.parse(await api.body.trends(90))).not.toThrow();
    expect(() => zBodySummary.parse(await api.body.summary())).not.toThrow();
    expect(() => zGoalView.parse(await api.goals.current())).not.toThrow();
    expect(() => zProgramView.parse(await api.training.program())).not.toThrow();
    expect(() => zRecoveryView.parse(await api.training.recovery())).not.toThrow();
    expect(() => zTrainingStats.parse(await api.training.stats())).not.toThrow();
    expect(() => zDayView.parse(await api.nutrition.day())).not.toThrow();
    expect(() => zWeekNutrition.parse(await api.nutrition.week())).not.toThrow();
    expect(() => zFoodSearchResponse.parse(await api.nutrition.search("yumurta"))).not.toThrow();
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
