import { zGoalView, zGoalPreview, zWeeklyReport, zWeeklyReportSummary, zGoalRecalibrateResponse, DEFAULT_GOAL_SETTINGS, computeGoalPlan, shiftKey } from "@fitfloow/core";
import { createFakeApi } from "../../src/lib/fake";
import { dayIntakeFrom, goalFor, planFor } from "../../src/lib/fake/domain";
import * as fx from "../../src/lib/fake/fixtures";

const TODAY = "2026-09-10";

describe("FakeApi domain (core-backed goal / report fixtures)", () => {
  test("the seeded goal is a real core plan: roadmap monotonic, target reached, started 4 weeks ago", () => {
    const user = fx.makeUser();
    const weighIns = fx.makeWeighIns(TODAY);
    const entries = fx.makeBodyEntries(TODAY, weighIns);
    const goal = goalFor(TODAY, user, entries);
    expect(goal.status).toBe("active");
    expect(goal.start.dateKey).toBe(shiftKey(TODAY, -28));
    expect(goal.plan.roadmap.length).toBeGreaterThan(3);
    for (let i = 1; i < goal.plan.roadmap.length; i++) {
      expect(goal.plan.roadmap[i].endWeightKg).toBeLessThan(goal.plan.roadmap[i - 1].endWeightKg);
    }
    const last = goal.plan.roadmap[goal.plan.roadmap.length - 1];
    expect(last.endBfPct).toBeLessThanOrEqual(goal.targetBodyFatPct + 0.05);
    // same engine as the client-side instant preview → identical numbers
    const again = computeGoalPlan({
      sex: user.gender,
      weightKg: goal.start.weightKg,
      bodyFatPct: goal.start.bodyFatPct,
      heightCm: user.heightCm ?? 180,
      age: 30,
      activityLevel: user.activityLevel,
      targetBodyFatPct: goal.targetBodyFatPct,
      profile: goal.profile,
      startDate: goal.start.dateKey,
      settings: DEFAULT_GOAL_SETTINGS,
    });
    expect(again.fatToLoseKg).toBe(goal.plan.fatToLoseKg);
  });

  test("planFor uses the user's age when a birth date exists (Mifflin blend)", () => {
    const user = fx.makeUser();
    const entry = fx.makeBodyEntries(TODAY, fx.makeWeighIns(TODAY))[3];
    const withAge = planFor(user, entry, 15, "optimal", TODAY);
    const noAge = planFor({ ...user, birthDate: null }, entry, 15, "optimal", TODAY);
    expect(withAge.bmrMifflin).not.toBeNull();
    expect(noAge.bmrMifflin).toBeNull();
  });

  test("dayIntakeFrom groups meal entries per day with entry counts", () => {
    const entries = fx.makeMealEntries(TODAY);
    const intake = dayIntakeFrom(entries);
    const today = intake.find((d) => d.dateKey === TODAY)!;
    expect(today.entries).toBe(6);
    expect(today.kcal).toBeGreaterThan(500);
    expect(intake.every((d) => (d.entries ?? 0) > 0)).toBe(true);
  });

  test("goals.current / preview / recalibrate and reports parse against the core schemas", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true, today: () => TODAY });
    const view = await api.goals.current();
    expect(() => zGoalView.parse(view)).not.toThrow();
    expect(view.progress?.onTrack).toBe("onTrack");
    expect(view.progress?.percentComplete).toBeGreaterThan(20);

    const preview = await api.goals.preview({ targetBodyFatPct: 12, profile: "aggressive" });
    expect(() => zGoalPreview.parse(preview)).not.toThrow();
    expect(preview.plan.profile).toBe("aggressive");
    expect(preview.plan.roadmap.length).toBeGreaterThan(0);

    const above = await api.goals.preview({ targetBodyFatPct: 40, profile: "optimal" });
    expect(above.warnings).toContain("TARGET_ABOVE_CURRENT");

    const rec = await api.goals.recalibrate();
    expect(() => zGoalRecalibrateResponse.parse(rec)).not.toThrow();
    expect(rec.recalibration.applied).toBe(true);
    expect(rec.goal.tdeeOverride).toBe(rec.recalibration.tdeeUsed);
  });

  test("weekly reports are built by core: highlights, a mascot line and three data-rich past weeks", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true, today: () => TODAY });
    const current = await api.reports.weekly();
    expect(() => zWeeklyReport.parse(current)).not.toThrow();
    expect(current.isCurrent).toBe(true);
    expect(current.mascot.text.length).toBeGreaterThan(0);
    expect(current.highlights.length).toBeGreaterThan(0);

    const { weeks } = await api.reports.history(12);
    expect(weeks).toHaveLength(12);
    for (const w of weeks) expect(() => zWeeklyReportSummary.parse(w)).not.toThrow();
    const past3 = weeks.slice(0, 3);
    for (const w of past3) {
      expect(w.daysLogged).toBeGreaterThan(0);
      expect(w.sessions).toBeGreaterThan(0);
      expect(w.score).toBeGreaterThan(0);
    }
    const past = await api.reports.weekly(past3[0].weekKey);
    expect(past.isCurrent).toBe(false);
    expect(past.nutrition.days).toHaveLength(7);
    expect(past.body.ewmaDelta).not.toBeNull();
  });

  test("a weigh-in today shows up in trends and moves the goal progress", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true, today: () => TODAY });
    const before = await api.goals.current();
    await api.body.createWeighIn({ weightKg: 78.6 });
    const after = await api.goals.current();
    expect(after.progress!.actualWeightKg!).toBeLessThan(before.progress!.actualWeightKg!);
    const trends = await api.body.trends(30);
    expect(trends.points.at(-1)?.dateKey).toBe(TODAY);
  });
});
