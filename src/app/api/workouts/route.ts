import { dbConnect } from "@/lib/mongodb";
import { WorkoutLog } from "@/lib/models";
import { requireUser, json, serverError } from "@/lib/http";
import type { WorkoutLogDTO } from "@/lib/types";
import { toWorkoutLogDTO } from "../_lib/program-util";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = requireUser();
  if ("response" in auth) return auth.response;

  try {
    await dbConnect();
    const docs = await WorkoutLog.find({ userId: auth.userId })
      .sort({ date: -1 })
      .limit(30)
      .lean();

    const logs: WorkoutLogDTO[] = docs.map((d) => toWorkoutLogDTO(d));
    return json({ logs });
  } catch (e: any) {
    return serverError(e?.message);
  }
}
