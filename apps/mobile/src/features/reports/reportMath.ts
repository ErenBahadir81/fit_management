/**
 * Pure helpers for the weekly report page. Tested directly.
 */
import { shiftKey, WEEKDAYS_TR, WEEKDAYS_TR_SHORT, weekKeyFor, weekRange, type Weekday, type WeeklyReportDTO, type WeeklyReportSummary } from "@fitfloow/core";
import { fmtDate } from "../../lib/format";
import type { Tone } from "../../theme/tokens";

/** Score bands (06-weekly-report.md): ≥80 great, 60–79 good, 40–59 meh, <40 rough — never shaming. */
export function scoreTone(score: number): Tone {
  if (score >= 80) return "success";
  if (score >= 60) return "primary";
  if (score >= 40) return "warning";
  return "danger";
}

export function scoreWord(score: number): string {
  if (score >= 90) return "Mükemmel hafta";
  if (score >= 80) return "Çok iyi hafta";
  if (score >= 60) return "İyi hafta";
  if (score >= 40) return "Karışık hafta";
  return "Zor hafta";
}

export interface DeficitBar {
  dateKey: string;
  label: string;
  /** kcal below (positive) or above (negative) the TDEE the plan used. */
  deficit: number;
  logged: boolean;
  isToday: boolean;
  /** Day has not happened yet (current week). */
  future: boolean;
}

/** Per-day deficit bars against the planned daily deficit line. */
export function deficitBars(report: WeeklyReportDTO): { bars: DeficitBar[]; plannedPerDay: number } {
  const todayIndex = report.dayIndexToday;
  const bars = report.nutrition.days.map((d, i) => ({
    dateKey: d.dateKey,
    label: WEEKDAYS_TR_SHORT[((report.measurementDay + i) % 7) as Weekday],
    deficit: d.deficit,
    logged: d.logged,
    isToday: todayIndex === i,
    future: todayIndex !== null && i > todayIndex,
  }));
  const plannedPerDay = report.goal ? report.goal.plannedWeeklyDeficit / 7 : 0;
  return { bars, plannedPerDay };
}

/** "Bu hafta 3.200 kcal ekside kaldın ≈ 0,42 kg yağ" — or the honest over-target sentence. */
export function deficitSentence(report: WeeklyReportDTO, fmtKcal: (n: number) => string, fmtKg: (n: number, d?: number) => string): string {
  const banked = report.nutrition.deficitBankedKcal;
  if (report.nutrition.daysLogged === 0) return "Bu hafta henüz beslenme kaydı yok.";
  if (banked > 0) return `${report.isCurrent ? "Bu hafta" : "O hafta"} ${fmtKcal(banked)} ekside kaldın ≈ ${fmtKg(report.nutrition.fatEquivalentKg, 2)} yağ`;
  if (banked < 0) return `${report.isCurrent ? "Bu hafta" : "O hafta"} hedefin ${fmtKcal(Math.abs(banked))} üstünde kaldın`;
  return "Bu hafta enerji dengesi başa baş.";
}

/** "Paz 6 Eyl – Cmt 12 Eyl". */
export function weekLabel(weekKey: string): string {
  const { startKey, endKey } = weekRange(weekKey);
  return `${fmtDate(startKey, "short")} – ${fmtDate(endKey, "short")}`;
}

export function measurementDayLabel(measurementDay: Weekday): string {
  return `${WEEKDAYS_TR[measurementDay]} başlangıçlı hafta`;
}

/** Week keys for the switcher: previous and next (null when `weekKey` is the current week). */
export function adjacentWeeks(weekKey: string, todayKey: string, measurementDay: Weekday): { prev: string; next: string | null } {
  const current = weekKeyFor(todayKey, measurementDay);
  const next = shiftKey(weekKey, 7);
  return { prev: shiftKey(weekKey, -7), next: next <= current ? next : null };
}

/** Oldest → newest score series for the history sparkline. */
export function historyScores(weeks: WeeklyReportSummary[]): number[] {
  return [...weeks].sort((a, b) => (a.weekKey < b.weekKey ? -1 : 1)).map((w) => w.score);
}

/** Sessions / planned as 0..1 (1 when nothing was planned but something was done). */
export function trainingRatio(training: WeeklyReportDTO["training"]): number {
  if (training.plannedSessions <= 0) return training.sessions > 0 ? 1 : 0;
  return Math.min(1, training.sessions / training.plannedSessions);
}
