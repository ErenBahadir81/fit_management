import { describe, expect, it } from "vitest";
import { DEFAULT_MASCOT_MESSAGES } from "../mascot/catalog";
import { homeMascotKey, moodForScore, reportMascotKey, selectMascotMessage, type HomeMascotState, type ReportForMascot } from "./mascot";

describe("selectMascotMessage", () => {
  it("renders a catalog variant with placeholders filled", () => {
    const m = selectMascotMessage("home.caloriesLeft", DEFAULT_MASCOT_MESSAGES, { kcal: 640 }, "u1|2026-09-10");
    expect(m.key).toBe("home.caloriesLeft");
    expect(m.mood).toBe("happy");
    expect(m.text).toContain("640");
    expect(m.text).not.toContain("{");
  });

  it("is stable for the same seed and varies across seeds", () => {
    const a = selectMascotMessage("home.morning", DEFAULT_MASCOT_MESSAGES, { name: "Eren" }, "u1|2026-09-10");
    const b = selectMascotMessage("home.morning", DEFAULT_MASCOT_MESSAGES, { name: "Eren" }, "u1|2026-09-10");
    expect(a.text).toBe(b.text);
    const variants = new Set(
      Array.from({ length: 20 }, (_, i) => selectMascotMessage("home.morning", DEFAULT_MASCOT_MESSAGES, { name: "Eren" }, `u${i}`).text)
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  it("prefers the admin catalog and falls back to the defaults", () => {
    const custom = [{ key: "home.morning" as const, mood: "flex" as const, variants: ["Kalk {name}!"] }];
    expect(selectMascotMessage("home.morning", custom, { name: "İnci" }, "s")).toMatchObject({ mood: "flex", text: "Kalk İnci!" });
    expect(selectMascotMessage("report.empty", custom, {}, "s").text.length).toBeGreaterThan(0);
  });

  it("never throws on an unknown key", () => {
    const m = selectMascotMessage("home.morning", [], {}, "s");
    expect(m.text.length).toBeGreaterThan(0);
  });
});

describe("moodForScore", () => {
  it("maps score bands", () => {
    expect(moodForScore(95)).toBe("cheer");
    expect(moodForScore(80)).toBe("cheer");
    expect(moodForScore(70)).toBe("happy");
    expect(moodForScore(45)).toBe("think");
    expect(moodForScore(10)).toBe("worried");
  });
});

describe("homeMascotKey", () => {
  const base: HomeMascotState = {
    hasAnyData: true,
    workoutDone: false,
    isRestDay: false,
    workoutDue: false,
    caloriesRemaining: null,
    caloriesEaten: 0,
    hourTR: 9,
  };
  it("prioritises today's events over the clock", () => {
    expect(homeMascotKey({ ...base, hasAnyData: false })).toBe("home.noData");
    expect(homeMascotKey({ ...base, workoutDone: true })).toBe("home.workoutDone");
    expect(homeMascotKey({ ...base, isRestDay: true })).toBe("home.restDay");
    expect(homeMascotKey({ ...base, workoutDue: true })).toBe("home.workoutDue");
    expect(homeMascotKey({ ...base, caloriesRemaining: -220, caloriesEaten: 2500 })).toBe("home.caloriesOver");
    expect(homeMascotKey({ ...base, caloriesRemaining: 500, caloriesEaten: 1200 })).toBe("home.caloriesLeft");
  });
  it("falls back to the time of day", () => {
    expect(homeMascotKey({ ...base, hourTR: 7 })).toBe("home.morning");
    expect(homeMascotKey({ ...base, hourTR: 15 })).toBe("home.afternoon");
    expect(homeMascotKey({ ...base, hourTR: 21 })).toBe("home.evening");
  });
});

describe("reportMascotKey", () => {
  const empty = {
    score: 0,
    nutrition: { daysLogged: 0 },
    training: { sessions: 0 },
    body: { weighInDays: 0, hasMeasurement: false },
    goalDistance: null,
    goal: null,
  } as unknown as ReportForMascot;

  it("empty week", () => expect(reportMascotKey(empty)).toBe("report.empty"));

  it("no goal → nudges to set one", () => {
    const r = { ...empty, nutrition: { daysLogged: 3 }, score: 50 } as unknown as ReportForMascot;
    expect(reportMascotKey(r)).toBe("goal.none");
  });

  it("maps the on-track verdict and celebrates a perfect week", () => {
    const withGoal = (onTrack: string, score: number) =>
      ({
        ...empty,
        score,
        nutrition: { daysLogged: 7 },
        training: { sessions: 4 },
        body: { weighInDays: 7, hasMeasurement: true },
        goal: { targetBodyFatPct: 12 },
        goalDistance: { onTrack },
      }) as unknown as ReportForMascot;
    expect(reportMascotKey(withGoal("onTrack", 70))).toBe("report.onTrack");
    expect(reportMascotKey(withGoal("ahead", 70))).toBe("report.ahead");
    expect(reportMascotKey(withGoal("behind", 50))).toBe("report.behind");
    expect(reportMascotKey(withGoal("stalled", 50))).toBe("report.stalled");
    expect(reportMascotKey(withGoal("onTrack", 95))).toBe("report.perfectWeek");
  });
});
