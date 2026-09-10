import { describe, expect, it } from "vitest";
import { computeWeekScore, SCORE_WEIGHTS } from "./score";

const perfect = {
  deficitBankedKcal: 4000,
  deficitPlannedKcal: 4000,
  daysLogged: 7,
  daysElapsed: 7,
  sessions: 4,
  plannedSessions: 4,
  weighInDays: 7,
};

describe("computeWeekScore", () => {
  it("weights sum to 100", () => {
    expect(SCORE_WEIGHTS.deficit + SCORE_WEIGHTS.logging + SCORE_WEIGHTS.training + SCORE_WEIGHTS.weighIn).toBe(100);
  });

  it("a perfect week scores 100", () => {
    expect(computeWeekScore(perfect).score).toBe(100);
  });

  it("an empty week scores 0", () => {
    expect(
      computeWeekScore({ deficitBankedKcal: 0, deficitPlannedKcal: 4000, daysLogged: 0, daysElapsed: 7, sessions: 0, plannedSessions: 4, weighInDays: 0 })
        .score
    ).toBe(0);
  });

  it("a week that has not started yet scores 0", () => {
    expect(computeWeekScore({ ...perfect, daysElapsed: 0 }).score).toBe(0);
  });

  it("clamps over-achievement to the weight", () => {
    const s = computeWeekScore({ ...perfect, deficitBankedKcal: 12000, sessions: 9 });
    expect(s.parts.deficit).toBe(40);
    expect(s.parts.training).toBe(25);
    expect(s.score).toBe(100);
  });

  it("never goes below zero when the user ate over the target", () => {
    const s = computeWeekScore({ ...perfect, deficitBankedKcal: -9000 });
    expect(s.parts.deficit).toBe(0);
    expect(s.score).toBe(60);
  });

  it("scales the denominators with the elapsed part of a live week", () => {
    const s = computeWeekScore({
      deficitBankedKcal: 1500,
      deficitPlannedKcal: 1500,
      daysLogged: 3,
      daysElapsed: 3,
      sessions: 2,
      plannedSessions: 2,
      weighInDays: 3,
    });
    expect(s.score).toBe(100);
  });

  it("redistributes the deficit weight when there is no goal", () => {
    const s = computeWeekScore({ ...perfect, deficitBankedKcal: 0, deficitPlannedKcal: 0 });
    expect(s.parts.deficit).toBe(0);
    expect(s.score).toBe(100);
    const half = computeWeekScore({ ...perfect, deficitBankedKcal: 0, deficitPlannedKcal: 0, daysLogged: 0, weighInDays: 0 });
    expect(half.score).toBe(Math.round((25 / 60) * 100));
  });

  it("counts a session as full credit when nothing was planned", () => {
    const s = computeWeekScore({ ...perfect, plannedSessions: 0 });
    expect(s.parts.training).toBe(25);
    expect(computeWeekScore({ ...perfect, plannedSessions: 0, sessions: 0 }).parts.training).toBe(0);
  });
});
