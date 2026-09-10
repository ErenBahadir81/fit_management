import type { WeeklyReportDTO } from "@fitfloow/core";
import { adjacentWeeks, deficitBars, deficitSentence, historyScores, scoreTone, scoreWord, trainingRatio, weekLabel } from "../../../src/features/reports/reportMath";
import { fmtKcal, fmtKg } from "../../../src/lib/format";
import { createFakeApi } from "../../../src/lib/fake";

const TODAY = "2026-09-10"; // Thursday; measurement day Sunday → week 2026-09-06 … 09-12

describe("score bands", () => {
  test("tone + word follow the 06 bands", () => {
    expect(scoreTone(92)).toBe("success");
    expect(scoreTone(80)).toBe("success");
    expect(scoreTone(65)).toBe("primary");
    expect(scoreTone(45)).toBe("warning");
    expect(scoreTone(12)).toBe("danger");
    expect(scoreWord(95)).toMatch(/Mükemmel/);
    expect(scoreWord(20)).toMatch(/Zor/);
  });
});

describe("deficit bars / sentence / weeks", () => {
  let report: WeeklyReportDTO;
  beforeAll(async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true, today: () => TODAY });
    report = await api.reports.weekly();
  });

  test("seven bars labelled from the measurement day; today flagged; future days flagged", () => {
    const { bars, plannedPerDay } = deficitBars(report);
    expect(bars.map((b) => b.label)).toEqual(["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"]);
    expect(bars.filter((b) => b.isToday)).toHaveLength(1);
    expect(bars[4].isToday).toBe(true);
    expect(bars.slice(5).every((b) => b.future)).toBe(true);
    expect(bars.slice(0, 5).every((b) => !b.future)).toBe(true);
    expect(plannedPerDay).toBeCloseTo(report.goal!.plannedWeeklyDeficit / 7, 5);
  });

  test("sentence: banked deficit → kcal ≈ kg fat; over target → honest copy; nothing logged → neutral", () => {
    expect(deficitSentence(report, fmtKcal, fmtKg)).toBe(`Bu hafta ${fmtKcal(report.nutrition.deficitBankedKcal)} ekside kaldın ≈ ${fmtKg(report.nutrition.fatEquivalentKg, 2)} yağ`);
    const over = { ...report, isCurrent: false, nutrition: { ...report.nutrition, deficitBankedKcal: -900 } };
    expect(deficitSentence(over, fmtKcal, fmtKg)).toBe(`O hafta hedefin ${fmtKcal(900)} üstünde kaldın`);
    const empty = { ...report, nutrition: { ...report.nutrition, daysLogged: 0 } };
    expect(deficitSentence(empty, fmtKcal, fmtKg)).toMatch(/henüz beslenme kaydı yok/);
  });

  test("week label + adjacent weeks (no next beyond the live week)", () => {
    expect(weekLabel("2026-09-06")).toBe("6 Eyl – 12 Eyl");
    expect(adjacentWeeks("2026-09-06", TODAY, 0)).toEqual({ prev: "2026-08-30", next: null });
    expect(adjacentWeeks("2026-08-23", TODAY, 0)).toEqual({ prev: "2026-08-16", next: "2026-08-30" });
  });

  test("history scores are oldest → newest; training ratio clamps", () => {
    expect(historyScores([{ weekKey: "2026-09-06", score: 70 } as never, { weekKey: "2026-08-30", score: 50 } as never])).toEqual([50, 70]);
    expect(trainingRatio({ sessions: 5, plannedSessions: 4 } as WeeklyReportDTO["training"])).toBe(1);
    expect(trainingRatio({ sessions: 2, plannedSessions: 4 } as WeeklyReportDTO["training"])).toBe(0.5);
    expect(trainingRatio({ sessions: 1, plannedSessions: 0 } as WeeklyReportDTO["training"])).toBe(1);
    expect(trainingRatio({ sessions: 0, plannedSessions: 0 } as WeeklyReportDTO["training"])).toBe(0);
  });
});
