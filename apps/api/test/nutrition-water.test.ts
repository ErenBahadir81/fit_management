import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BodyEntry } from "../src/models/body";
import { asUser, createTestApp, seedBasics, type TestApp } from "./harness";

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

const url = "/api/v1/nutrition/water";

describe("/nutrition/water", () => {
  it("starts the day at zero with the default 2.5 L goal", async () => {
    const { headers } = await asUser(t);
    const res = await t.app.inject({ method: "GET", url, headers });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ dateKey: "2026-09-10", totalMl: 0, goalMl: 2500, count: 0 });
  });

  it("adds glasses, sets the goal from body weight, and undoes the newest", async () => {
    const { user, headers } = await asUser(t);
    await BodyEntry.create({
      userId: user._id,
      date: new Date("2026-09-09T09:00:00.000Z"),
      dateKey: "2026-09-09",
      gender: "male",
      heightCm: 178,
      neckCm: 39,
      waistCm: 92,
      weightKg: 80,
      bodyFatPct: 20,
      fatMassKg: 16,
      leanMassKg: 64,
    });
    const a = await t.app.inject({ method: "POST", url, headers, payload: { ml: 250 } });
    expect(a.statusCode).toBe(201);
    const b = (await t.app.inject({ method: "POST", url, headers, payload: { ml: 500 } })).json();
    expect(b).toEqual({ dateKey: "2026-09-10", totalMl: 750, goalMl: 2750, count: 2 });

    const undone = (await t.app.inject({ method: "DELETE", url: `${url}/last`, headers })).json();
    expect(undone).toMatchObject({ totalMl: 250, count: 1 });
    await t.app.inject({ method: "DELETE", url: `${url}/last`, headers });
    const empty = (await t.app.inject({ method: "DELETE", url: `${url}/last`, headers })).json();
    expect(empty).toMatchObject({ totalMl: 0, count: 0 });
  });

  it("keeps days and users apart and rejects silly amounts", async () => {
    const a = await asUser(t);
    const b = await asUser(t);
    await t.app.inject({ method: "POST", url, headers: a.headers, payload: { ml: 250, dateKey: "2026-09-09" } });
    expect((await t.app.inject({ method: "GET", url, headers: a.headers })).json().totalMl).toBe(0);
    expect((await t.app.inject({ method: "GET", url: `${url}?date=2026-09-09`, headers: a.headers })).json().totalMl).toBe(250);
    expect((await t.app.inject({ method: "GET", url: `${url}?date=2026-09-09`, headers: b.headers })).json().totalMl).toBe(0);
    const bad = await t.app.inject({ method: "POST", url, headers: a.headers, payload: { ml: 0 } });
    expect(bad.statusCode).toBe(400);
  });

  it("requires auth", async () => {
    expect((await t.app.inject({ method: "GET", url })).statusCode).toBe(401);
  });
});
