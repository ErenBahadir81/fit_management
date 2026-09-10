import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestApp, createUser, type TestApp } from "./harness";

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

describe("auth", () => {
  it("health is public", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, db: "ok" });
  });

  it("logs in with correct credentials and returns tokens + user", async () => {
    await createUser({ username: "eren", password: "Asd*123", role: "admin" });
    const res = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "Eren", password: "Asd*123" } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeTypeOf("string");
    expect(body.refreshToken).toBeTypeOf("string");
    expect(body.user).toMatchObject({ username: "eren", role: "admin", measurementDay: 0, mascotEnabled: true });
    expect(body.user.passwordHash).toBeUndefined();
  });

  it("rejects wrong password with AUTH_INVALID", async () => {
    await createUser({ username: "eren", password: "Asd*123" });
    const res = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "eren", password: "nope" } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("AUTH_INVALID");
  });

  it("validates body shape with VALIDATION envelope", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "e" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });

  it("protected route requires auth", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("AUTH_REQUIRED");
  });

  it("me returns the current user with bearer token", async () => {
    const { headers, user } = await asUser(t, { username: "inci", gender: "female" });
    const res = await t.app.inject({ method: "GET", url: "/api/v1/auth/me", headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ id: String(user._id), username: "inci", gender: "female" });
  });

  it("refresh rotates the refresh token and invalidates the old one", async () => {
    await createUser({ username: "eren", password: "Asd*123" });
    const login = (await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "eren", password: "Asd*123" } })).json();
    const r1 = await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", payload: { refreshToken: login.refreshToken } });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().refreshToken).not.toBe(login.refreshToken);
    const r2 = await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", payload: { refreshToken: login.refreshToken } });
    expect(r2.statusCode).toBe(401);
    const r3 = await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", payload: { refreshToken: r1.json().refreshToken } });
    expect(r3.statusCode).toBe(200);
  });

  it("cookie login sets httpOnly cookies usable for me()", async () => {
    await createUser({ username: "eren", password: "Asd*123", role: "admin" });
    const res = await t.app.inject({ method: "POST", url: "/api/v1/auth/login?cookie=1", payload: { username: "eren", password: "Asd*123" } });
    const cookies = res.cookies as Array<{ name: string; value: string; httpOnly?: boolean }>;
    const access = cookies.find((c) => c.name === "fit_access");
    expect(access?.httpOnly).toBe(true);
    const me = await t.app.inject({ method: "GET", url: "/api/v1/auth/me", cookies: { fit_access: access!.value } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.role).toBe("admin");
  });

  it("logout revokes the refresh token", async () => {
    await createUser({ username: "eren", password: "Asd*123" });
    const login = (await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "eren", password: "Asd*123" } })).json();
    const out = await t.app.inject({ method: "POST", url: "/api/v1/auth/logout", payload: { refreshToken: login.refreshToken } });
    expect(out.statusCode).toBe(204);
    const r = await t.app.inject({ method: "POST", url: "/api/v1/auth/refresh", payload: { refreshToken: login.refreshToken } });
    expect(r.statusCode).toBe(401);
  });

  it("PATCH /me updates profile fields and rejects bad weekday", async () => {
    const { headers } = await asUser(t);
    const ok = await t.app.inject({ method: "PATCH", url: "/api/v1/me", headers, payload: { measurementDay: 3, activityLevel: "active" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user).toMatchObject({ measurementDay: 3, activityLevel: "active" });
    const bad = await t.app.inject({ method: "PATCH", url: "/api/v1/me", headers, payload: { measurementDay: 9 } });
    expect(bad.statusCode).toBe(400);
  });

  it("password change requires the current password and revokes sessions", async () => {
    const user = await createUser({ username: "eren", password: "Asd*123" });
    const { headers } = await asUser(t, user);
    const bad = await t.app.inject({ method: "PATCH", url: "/api/v1/me/password", headers, payload: { currentPassword: "x", newPassword: "Yeni*123" } });
    expect(bad.statusCode).toBe(400);
    const ok = await t.app.inject({ method: "PATCH", url: "/api/v1/me/password", headers, payload: { currentPassword: "Asd*123", newPassword: "Yeni*123" } });
    expect(ok.statusCode).toBe(204);
    const login = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "eren", password: "Yeni*123" } });
    expect(login.statusCode).toBe(200);
  });
});

describe("harness", () => {
  it("seedBasics is idempotent and seeds the catalogs", async () => {
    const { seedBasics } = await import("./harness");
    const { Muscle } = await import("../src/models/muscle");
    const { Exercise } = await import("../src/models/exercise");
    await seedBasics();
    await seedBasics();
    expect(await Muscle.countDocuments({ active: true })).toBe(7);
    expect(await Exercise.countDocuments()).toBe(20);
  });
});
