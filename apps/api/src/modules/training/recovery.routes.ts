import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  buildTrainingStats,
  computeRecovery,
  shiftKey,
  trDateKey,
  weekKeyFor,
  type RecoveryView,
  type TrainingStats,
} from "@fitfloow/core";
import type { AppContext } from "../../context";
import { WorkoutLog, toWorkoutLogDTO, type WorkoutLogDoc } from "../../models/workoutLog";
import { listActiveMuscles } from "../../models/muscle";
import { measurementDayOf } from "./service";

const zStatsQuery = z.object({ weeks: z.coerce.number().int().min(1).max(52).default(8) });

/** A week of logs is always needed for weekly sets; longer when an admin configures slower recovery. */
const MIN_WINDOW_HOURS = 7 * 24;

export async function recoveryRoutes(app: FastifyInstance, ctx: AppContext) {
  const auth = { preHandler: [app.authenticate] };

  app.get("/recovery", auth, async (req): Promise<RecoveryView> => {
    const now = ctx.now();
    const muscles = await listActiveMuscles();
    const hours = Math.max(MIN_WINDOW_HOURS, ...muscles.map((m) => m.fullRecoveryHours));
    const since = new Date(now.getTime() - hours * 3_600_000);
    const logs = await WorkoutLog.find({ userId: req.auth.id, isOffDay: false, date: { $gte: since } })
      .sort({ date: 1 })
      .lean<WorkoutLogDoc[]>();
    return computeRecovery(logs.map(toWorkoutLogDTO), muscles, now);
  });

  app.get("/training/stats", { ...auth, schema: { querystring: zStatsQuery } }, async (req): Promise<TrainingStats> => {
    const { weeks } = req.query as z.infer<typeof zStatsQuery>;
    const userId = req.auth.id;
    const now = ctx.now();
    const todayKey = trDateKey(now);
    const [muscles, measurementDay] = await Promise.all([listActiveMuscles(), measurementDayOf(userId)]);
    const fromKey = shiftKey(weekKeyFor(todayKey, measurementDay), -7 * (weeks - 1));

    const logs = await WorkoutLog.find({ userId, isOffDay: false, dateKey: { $gte: fromKey } })
      .sort({ date: 1 })
      .lean<WorkoutLogDoc[]>();
    const stats = buildTrainingStats({ logs: logs.map(toWorkoutLogDTO), muscles, weeks, measurementDay, todayKey });
    return { ...stats, totalSessions: await WorkoutLog.countDocuments({ userId, isOffDay: false }) };
  });
}
