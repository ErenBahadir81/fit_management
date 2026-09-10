/**
 * `GET /mascot/message` — Floo's line for a screen the composites do not already cover.
 */
import { daysBetween, trDateKey, type MascotKey, type MascotMessage } from "@fitfloow/core";
import type { AppContext } from "../../context";
import { BodyEntry, WeighIn, type BodyEntryDoc } from "../../models/body";
import { Goal, type GoalDoc } from "../../models/goal";
import { WorkoutLog, type WorkoutLogDoc } from "../../models/workoutLog";
import { homeView, weeklyReport } from "./reports.service";
import { loadUser, mascotCatalog, mascotFor } from "./shared";

export type MascotContext = "home" | "report" | "scan" | "workout" | "body" | "goal";

export async function mascotMessage(ctx: AppContext, userId: string, context: MascotContext): Promise<MascotMessage> {
  if (context === "home") return (await homeView(ctx, userId)).mascot;
  if (context === "report") return (await weeklyReport(ctx, userId)).mascot;

  const user = await loadUser(userId);
  const todayKey = trDateKey(ctx.now());
  const catalog = await mascotCatalog();

  let key: MascotKey = "home.morning";
  const vars: Record<string, string | number> = { name: user.displayName };

  if (context === "scan") {
    key = "scan.start";
  } else if (context === "workout") {
    const log = await WorkoutLog.findOne({ userId: user._id, dateKey: todayKey }).lean<WorkoutLogDoc>();
    key = log ? (log.isOffDay ? "workout.skipped" : "workout.finished") : "workout.start";
  } else if (context === "body") {
    const [entry, weighIns] = await Promise.all([
      BodyEntry.findOne({ userId: user._id }).sort({ date: -1 }).lean<BodyEntryDoc>(),
      WeighIn.find({ userId: user._id }).sort({ dateKey: -1 }).limit(30).lean(),
    ]);
    let streak = 0;
    for (let i = weighIns.some((w) => w.dateKey === todayKey) ? 0 : 1; i < 30; i++) {
      const target = weighIns.find((w) => daysBetween(w.dateKey, todayKey) === i);
      if (!target) break;
      streak++;
    }
    vars.streak = streak;
    if (!entry || daysBetween(entry.dateKey, todayKey) >= 7) key = "body.noMeasurement7d";
    else if (entry.dateKey === todayKey) {
      key = "body.newMeasurement";
      vars.pct = entry.bodyFatPct;
    } else key = streak > 1 ? "body.weighInStreak" : "body.newMeasurement";
    if (entry) vars.pct = entry.bodyFatPct;
  } else {
    const goal = await Goal.findOne({ userId: user._id, status: "active" }).lean<GoalDoc>();
    if (!goal) key = "goal.none";
    else {
      key = goal.tdeeOverride ? "goal.recalibrated" : "goal.created";
      vars.pct = goal.targetBodyFatPct;
      vars.weeks = goal.plan.estimatedWeeks;
      vars.kg = goal.plan.totalLossKg;
      vars.kcal = goal.plan.initialDailyCalorieTarget;
    }
  }
  return mascotFor(key, catalog, vars, String(user._id), todayKey, user.mascotEnabled);
}
