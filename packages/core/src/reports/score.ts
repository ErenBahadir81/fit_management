/**
 * Weekly score (06-weekly-report.md): deficit adherence 40, nutrition logging 20,
 * training 25, weigh-ins 15. Denominators scale with the elapsed part of the week so a
 * live report is never punished for days that have not happened yet.
 */
import { clamp, round } from "../utils/index";

export const SCORE_WEIGHTS = { deficit: 40, logging: 20, training: 25, weighIn: 15 } as const;

export interface WeekScoreInput {
  deficitBankedKcal: number;
  /** 0 when the user has no goal — the weight is then spread over the other three parts. */
  deficitPlannedKcal: number;
  daysLogged: number;
  /** 1..7 for a live week, 7 for a finished one, 0 for a week that has not started. */
  daysElapsed: number;
  sessions: number;
  /** Planned sessions for the elapsed part of the week. */
  plannedSessions: number;
  weighInDays: number;
}

export interface WeekScore {
  score: number;
  parts: { deficit: number; logging: number; training: number; weighIn: number };
}

export function computeWeekScore(input: WeekScoreInput): WeekScore {
  const { deficitBankedKcal, deficitPlannedKcal, daysLogged, daysElapsed, sessions, plannedSessions, weighInDays } = input;
  if (daysElapsed <= 0) return { score: 0, parts: { deficit: 0, logging: 0, training: 0, weighIn: 0 } };

  const hasDeficitTarget = deficitPlannedKcal > 0;
  const ratios = {
    deficit: hasDeficitTarget ? clamp(deficitBankedKcal / deficitPlannedKcal, 0, 1) : 0,
    logging: clamp(daysLogged / daysElapsed, 0, 1),
    training: plannedSessions > 0 ? clamp(sessions / plannedSessions, 0, 1) : sessions > 0 ? 1 : 0,
    weighIn: clamp(weighInDays / daysElapsed, 0, 1),
  };

  // Without a goal there is nothing to adhere to; give that weight to the parts we can measure.
  const rest = SCORE_WEIGHTS.logging + SCORE_WEIGHTS.training + SCORE_WEIGHTS.weighIn;
  const boost = hasDeficitTarget ? 1 : (rest + SCORE_WEIGHTS.deficit) / rest;
  const parts = {
    deficit: hasDeficitTarget ? ratios.deficit * SCORE_WEIGHTS.deficit : 0,
    logging: ratios.logging * SCORE_WEIGHTS.logging * boost,
    training: ratios.training * SCORE_WEIGHTS.training * boost,
    weighIn: ratios.weighIn * SCORE_WEIGHTS.weighIn * boost,
  };
  const score = clamp(parts.deficit + parts.logging + parts.training + parts.weighIn, 0, 100);
  return {
    score: round(score, 0),
    parts: { deficit: round(parts.deficit, 1), logging: round(parts.logging, 1), training: round(parts.training, 1), weighIn: round(parts.weighIn, 1) },
  };
}
