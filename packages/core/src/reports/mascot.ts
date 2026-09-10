/**
 * Which sentence Floo says, and in what mood (docs/plan/09-mascot.md).
 * Selection is a pure function of state so the same user sees the same line all day.
 */
import { DEFAULT_MASCOT_MESSAGES, findTemplate, pickVariant, renderTemplate, type MascotTemplate } from "../mascot/catalog";
import type { Mood } from "../schemas/common";
import type { MascotKey } from "../schemas/mascot";
import type { MascotMessage, WeeklyReportDTO } from "../schemas/report";

export type MascotVars = Record<string, string | number | null | undefined>;

/**
 * Picks a variant deterministically from `seed` (caller passes e.g. `userId|dateKey`) and fills
 * placeholders. Falls back to the built-in catalog when the admin catalog lacks the key.
 */
export function selectMascotMessage(key: MascotKey, catalog: MascotTemplate[], vars: MascotVars = {}, seed = ""): MascotMessage {
  const template = findTemplate(key, catalog) ?? findTemplate(key, DEFAULT_MASCOT_MESSAGES);
  if (!template || template.variants.length === 0) return { key, mood: "happy", text: "" };
  const text = renderTemplate(pickVariant(template.variants, `${seed}|${key}`), vars);
  return { key, mood: template.mood, text };
}

/** Score bands → mood (06-weekly-report.md): never shaming, only softer. */
export function moodForScore(score: number): Mood {
  if (score >= 80) return "cheer";
  if (score >= 60) return "happy";
  if (score >= 40) return "think";
  return "worried";
}

export interface HomeMascotState {
  /** false when the user has no measurement, no log and no meal at all. */
  hasAnyData: boolean;
  workoutDone: boolean;
  isRestDay: boolean;
  workoutDue: boolean;
  /** null when no calorie target is known. */
  caloriesRemaining: number | null;
  caloriesEaten: number;
  /** Türkiye local hour 0..23. */
  hourTR: number;
}

/** Most specific state first: what happened today beats the time of day. */
export function homeMascotKey(state: HomeMascotState): MascotKey {
  if (!state.hasAnyData) return "home.noData";
  if (state.workoutDone) return "home.workoutDone";
  if (state.isRestDay) return "home.restDay";
  if (state.workoutDue) return "home.workoutDue";
  if (state.caloriesRemaining !== null && state.caloriesRemaining < 0) return "home.caloriesOver";
  if (state.caloriesRemaining !== null && state.caloriesEaten > 0) return "home.caloriesLeft";
  if (state.hourTR < 12) return "home.morning";
  if (state.hourTR < 18) return "home.afternoon";
  return "home.evening";
}

export type ReportForMascot = Pick<WeeklyReportDTO, "score" | "nutrition" | "training" | "body" | "goalDistance" | "goal">;

/** Empty week → sleepy; no goal → nudge to set one; otherwise the on-track verdict. */
export function reportMascotKey(report: ReportForMascot): MascotKey {
  const empty =
    report.nutrition.daysLogged === 0 && report.training.sessions === 0 && report.body.weighInDays === 0 && !report.body.hasMeasurement;
  if (empty) return "report.empty";
  if (!report.goal || !report.goalDistance) return "goal.none";
  if (report.score >= 90) return "report.perfectWeek";
  switch (report.goalDistance.onTrack) {
    case "ahead":
      return "report.ahead";
    case "behind":
      return "report.behind";
    case "stalled":
      return "report.stalled";
    default:
      return "report.onTrack";
  }
}
