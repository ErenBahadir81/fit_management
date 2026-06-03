import { dbConnect } from "@/lib/mongodb";
import { Program, WorkoutLog } from "@/lib/models";
import { requireUser, json, badRequest, serverError } from "@/lib/http";
import {
  dayBounds,
  toProgramDTO,
  toWorkoutLogDTO,
} from "../../_lib/program-util";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = requireUser();
  if ("response" in auth) return auth.response;

  try {
    await dbConnect();
    const program = await Program.findOne({ userId: auth.userId });
    if (!program) return badRequest("Program bulunamadı");

    const currentIndex: number = program.currentIndex ?? 0;
    const day = program.days?.[currentIndex];
    if (!day) return badRequest("Gün bulunamadı");

    const { start, end } = dayBounds(new Date());
    const existing = await WorkoutLog.findOne({
      userId: auth.userId,
      date: { $gte: start, $lt: end },
    });

    // Bugün tamamlanmış (dinlenme olmayan) bir kayıt varsa atlamaya izin verme.
    if (existing && !existing.isOffDay) {
      return badRequest("Bugün zaten tamamlandı");
    }

    const now = new Date();
    const logData = {
      userId: auth.userId,
      programId: program._id,
      date: now,
      dayOrder: day.order,
      weekNumber: program.weekNumber ?? 1,
      title: "Dinlenme",
      kind: day.kind,
      isOffDay: true,
      strength: [],
      run: null,
    };

    let savedLog;
    if (existing) {
      existing.set(logData);
      savedLog = await existing.save();
    } else {
      savedLog = await WorkoutLog.create(logData);
    }

    // Atlamak pointer'ı ilerletmez -> takvim kayar.
    program.lastActionAt = now;
    await program.save();

    return json({
      program: toProgramDTO(program),
      log: toWorkoutLogDTO(savedLog),
    });
  } catch (e: any) {
    return serverError(e?.message);
  }
}
