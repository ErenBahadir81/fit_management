import { z } from "zod";
import { zIso } from "./common";

export const zDashboard = z.object({
  users: z.number().int(),
  activeUsers7d: z.number().int(),
  workouts7d: z.number().int(),
  meals7d: z.number().int(),
  scans7d: z.number().int(),
  goalsActive: z.number().int(),
  series: z.array(z.object({ dateKey: z.string(), workouts: z.number().int(), meals: z.number().int(), scans: z.number().int() })),
});
export type DashboardDTO = z.infer<typeof zDashboard>;

export const zSystemHealth = z.object({
  db: z.enum(["ok", "down"]),
  vision: z.object({
    ok: z.boolean(),
    mock: z.boolean(),
    modelVersion: z.string().nullable(),
    latencyMs: z.number().nullable(),
    url: z.string().nullable(),
  }),
  version: z.string(),
  uptimeSec: z.number(),
  checkedAt: zIso,
});
export type SystemHealth = z.infer<typeof zSystemHealth>;
