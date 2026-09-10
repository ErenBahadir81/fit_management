/**
 * reports domain — weekly report, score, highlights and mascot selection. Pure, no I/O.
 */
export { buildWeeklyReport, buildHighlights, summarizeWeeklyReport } from "./weekly";
export type { WeeklyReportContext, ReportWorkoutLog, ReportStrengthEntry, ReportMuscle } from "./weekly";
export { computeWeekScore, SCORE_WEIGHTS } from "./score";
export type { WeekScoreInput, WeekScore } from "./score";
export { selectMascotMessage, moodForScore, homeMascotKey, reportMascotKey } from "./mascot";
export type { MascotVars, HomeMascotState, ReportForMascot } from "./mascot";
