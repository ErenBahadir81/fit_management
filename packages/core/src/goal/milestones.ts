/**
 * C4 — the goal plan in plain Turkish. `estimatedWeeks` and `targetDate` are accurate but mute:
 * they never say *when you get where*. These pure helpers turn the roadmap into four checkpoints
 * and one sentence a person can read out loud.
 */
import type { GoalDirection, GoalMilestone, GoalPlan, RoadmapWeek } from "../schemas/goal";
import { formatDayMonthLocativeTr } from "../time/index";
import { round } from "../utils/index";

/** Weeks per month, so "13 hafta sonra" can become the "3 ay sonra" a person would say. */
const WEEKS_PER_MONTH = 4.345;
/** Past this, counting weeks stops being how anyone talks about a date. */
const MAX_WEEKS_SPOKEN = 12;

/** "bu hafta" · "2 hafta sonra" · "3 ay sonra". Garbage in still gets a sane sentence out. */
export function etaLabelTr(weeksFromNow: number): string {
  const weeks = Number.isFinite(weeksFromNow) ? Math.max(0, Math.round(weeksFromNow)) : 0;
  if (weeks === 0) return "bu hafta";
  if (weeks <= MAX_WEEKS_SPOKEN) return `${weeks} hafta sonra`;
  return `${Math.max(2, Math.round(weeks / WEEKS_PER_MONTH))} ay sonra`;
}

/** 1850 → "1.850", 12.4 → "12,4". Deterministic, so it works the same everywhere the app runs. */
export function formatTrNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const negative = n < 0;
  const [whole, fraction] = Math.abs(n).toString().split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped}${fraction ? `,${fraction}` : ""}`;
}

/** The quarter points of the journey. */
const FRACTIONS = [0.25, 0.5, 0.75, 1] as const;

/**
 * How far along the journey a week's end is, in the unit the direction moves: kg lost (cut),
 * kg gained (bulk) or body-fat points lost (recomp, whose weight barely moves).
 */
function progressAt(direction: GoalDirection, first: RoadmapWeek, w: RoadmapWeek): number {
  if (direction === "bulk") return w.endWeightKg - first.startWeightKg;
  if (direction === "recomp") return first.startBfPct - w.endBfPct;
  return first.startWeightKg - w.endWeightKg;
}

/**
 * One checkpoint per quarter of the journey, dated on the roadmap week that reaches it. Short
 * plans naturally collapse several quarters onto the same week — those are merged, so a
 * three-week plan reports three distinct dates rather than four rows saying the same thing.
 * `total` is in the direction's unit (see `progressAt`); for a cut it is the total weight to lose.
 */
export function goalMilestones(roadmap: readonly RoadmapWeek[], total: number, direction: GoalDirection = "cut"): GoalMilestone[] {
  if (roadmap.length === 0 || total <= 0.0005) return [];
  const first = roadmap[0];

  const byDate = new Map<string, GoalMilestone>();
  for (const fraction of FRACTIONS) {
    const wanted = total * fraction;
    const week = roadmap.find((w) => progressAt(direction, first, w) >= wanted - 0.0005) ?? roadmap[roadmap.length - 1];
    // Later fractions overwrite earlier ones on a shared week: the most advanced statement that
    // is true on that date is the one worth showing.
    byDate.set(week.endKey, {
      fraction,
      dateKey: week.endKey,
      weightKg: round(week.endWeightKg, 1),
      bodyFatPct: round(week.endBfPct, 1),
      etaLabelTr: etaLabelTr(week.weekIndex),
    });
  }
  return [...byDate.values()].sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
}

/**
 * "17 Ocak'ta ~78 kg ve %12 yağ oranındasın — 14 hafta, günde 1.850 kcal."
 * Someone already at their target gets told that, not a date.
 */
export function goalSummaryTr(plan: Omit<GoalPlan, "milestones" | "summaryTr">): string {
  const kcal = formatTrNumber(Math.round(plan.initialDailyCalorieTarget));
  const last = plan.roadmap[plan.roadmap.length - 1];
  if (!last || plan.estimatedWeeks === 0) {
    if (plan.direction === "bulk") return `Bu hedef için plan çıkmadı — günde yaklaşık ${kcal} kcal ile koruma kalorisindesin.`;
    return `Şu an zaten hedefindesin — günde yaklaşık ${kcal} kcal ile buradasın.`;
  }
  const when = formatDayMonthLocativeTr(last.endKey);
  const kg = Math.round(last.endWeightKg);
  const bf = formatTrNumber(round(last.endBfPct, 1));
  if (plan.direction === "bulk" || plan.direction === "recomp") {
    const lean = formatTrNumber(round(Math.max(0, plan.leanGainKg ?? 0), 1));
    return plan.direction === "bulk"
      ? `${when} ~${kg} kg, +${lean} kg kas ve %${bf} yağ oranındasın — ${plan.estimatedWeeks} hafta, günde ${kcal} kcal.`
      : `${when} %${bf} yağ oranında ve +${lean} kg kasla ~${kg} kg'dasın — ${plan.estimatedWeeks} hafta, günde ${kcal} kcal.`;
  }
  return `${when} ~${kg} kg ve %${bf} yağ oranındasın — ${plan.estimatedWeeks} hafta, günde ${kcal} kcal.`;
}
