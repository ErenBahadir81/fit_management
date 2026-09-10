import type { FastifyInstance } from "fastify";
import { TR_TZ, keyRange, keyToStart, shiftKey, trDateKey, type DashboardDTO } from "@fitfloow/core";
import { User } from "../../models/user";
import { WorkoutLog } from "../../models/workoutLog";
import { MealEntry, Scan } from "../../models/nutrition";
import { Goal } from "../../models/goal";
import type { AppContext } from "../../context";

const SERIES_DAYS = 14;

type Bucket = { _id: string; n: number };

function toMap(rows: Bucket[]): Map<string, number> {
  return new Map(rows.map((r) => [r._id, r.n]));
}

export async function adminDashboardRoutes(app: FastifyInstance, opts: { ctx: AppContext }) {
  const { ctx } = opts;
  const admin = { preHandler: [app.requireAdmin] };

  app.get("/admin/dashboard", admin, async (): Promise<DashboardDTO> => {
    const today = trDateKey(ctx.now());
    const seriesFrom = shiftKey(today, -(SERIES_DAYS - 1));
    const weekFrom = shiftKey(today, -6);
    const weekStart = keyToStart(weekFrom);
    const seriesStart = keyToStart(seriesFrom);

    // One aggregation (or count) per collection — never per day.
    const [users, activeUsers7d, workouts7d, meals7d, scans7d, goalsActive, workoutRows, mealRows, scanRows] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastSeenAt: { $gte: weekStart } }),
      WorkoutLog.countDocuments({ dateKey: { $gte: weekFrom, $lte: today } }),
      MealEntry.countDocuments({ dateKey: { $gte: weekFrom, $lte: today } }),
      Scan.countDocuments({ createdAt: { $gte: weekStart } }),
      Goal.countDocuments({ status: "active" }),
      WorkoutLog.aggregate<Bucket>([
        { $match: { dateKey: { $gte: seriesFrom, $lte: today } } },
        { $group: { _id: "$dateKey", n: { $sum: 1 } } },
      ]),
      MealEntry.aggregate<Bucket>([
        { $match: { dateKey: { $gte: seriesFrom, $lte: today } } },
        { $group: { _id: "$dateKey", n: { $sum: 1 } } },
      ]),
      Scan.aggregate<Bucket>([
        { $match: { createdAt: { $gte: seriesStart } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TR_TZ } }, n: { $sum: 1 } } },
      ]),
    ]);

    const workoutMap = toMap(workoutRows);
    const mealMap = toMap(mealRows);
    const scanMap = toMap(scanRows);

    return {
      users,
      activeUsers7d,
      workouts7d,
      meals7d,
      scans7d,
      goalsActive,
      series: keyRange(seriesFrom, today).map((dateKey) => ({
        dateKey,
        workouts: workoutMap.get(dateKey) ?? 0,
        meals: mealMap.get(dateKey) ?? 0,
        scans: scanMap.get(dateKey) ?? 0,
      })),
    };
  });
}
