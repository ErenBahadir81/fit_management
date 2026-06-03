import { dbConnect } from "@/lib/mongodb";
import { WorkoutLog } from "@/lib/models";
import { requireUser, json, serverError } from "@/lib/http";
import { MUSCLE_ORDER, MuscleKey } from "@/lib/muscles";
import { computeReadiness, MuscleHit } from "@/lib/recovery";

export const dynamic = "force-dynamic";

const MUSCLE_SET = new Set<MuscleKey>(MUSCLE_ORDER);

export async function GET() {
  const auth = requireUser();
  if ("response" in auth) return auth.response;

  try {
    await dbConnect();

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - 3); // son 4 gün (bugün dahil)

    const logs = await WorkoutLog.find({
      userId: auth.userId,
      isOffDay: false,
      date: { $gte: since },
    }).lean();

    const hits: MuscleHit[] = [];
    for (const log of logs) {
      const at = new Date(log.date as any).getTime();
      for (const entry of (log.strength ?? []) as any[]) {
        const sets = entry?.sets?.length || entry?.plannedSets || 0;
        if (sets <= 0) continue;
        for (const m of (entry?.muscles ?? []) as string[]) {
          if (MUSCLE_SET.has(m as MuscleKey)) {
            hits.push({ muscle: m as MuscleKey, sets, at });
          }
        }
      }
    }

    const r = computeReadiness(hits);

    return json({
      muscles: MUSCLE_ORDER.map((k) => r[k]),
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return serverError(e?.message);
  }
}
