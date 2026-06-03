import { dbConnect } from "@/lib/mongodb";
import { WorkoutLog } from "@/lib/models";
import { requireUser, json, serverError } from "@/lib/http";
import { readinessFromLogs } from "@/lib/services/fatigue";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = requireUser();
  if ("response" in auth) return auth.response;

  try {
    await dbConnect();

    // Son 7 gün yeterli: haftalık set istatistiği + en uzun yenilenme penceresi (48s).
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - 7);

    const logs = await WorkoutLog.find({
      userId: auth.userId,
      isOffDay: false,
      date: { $gte: since },
    })
      .sort({ date: 1 })
      .lean();

    const muscles = readinessFromLogs(logs as any[]);

    return json({ muscles, generatedAt: new Date().toISOString() });
  } catch (e: any) {
    return serverError(e?.message);
  }
}
