import { dbConnect } from "@/lib/mongodb";
import { Program, WorkoutLog } from "@/lib/models";
import { requireUser, json, badRequest, serverError } from "@/lib/http";
import { clamp } from "@/lib/utils";
import type { StrengthEntryDTO } from "@/lib/types";
import {
  dayBounds,
  progressedRunTargetMin,
  runTotals,
  sanitizeSegments,
  sanitizeStrengthEntries,
  toProgramDTO,
  toWorkoutLogDTO,
} from "../../_lib/program-util";

export const dynamic = "force-dynamic";

interface CompleteBody {
  strength?: StrengthEntryDTO[];
  run?: { segments?: { km: number; min: number }[] };
}

export async function POST(req: Request) {
  const auth = requireUser();
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as CompleteBody;

    await dbConnect();
    const program = await Program.findOne({ userId: auth.userId });
    if (!program) return badRequest("Program bulunamadı");

    const currentIndex: number = program.currentIndex ?? 0;
    const day = program.days?.[currentIndex];
    if (!day) return badRequest("Gün bulunamadı");

    const strength = sanitizeStrengthEntries(body?.strength);
    const segments = day.run ? sanitizeSegments(body?.run?.segments) : [];
    const { totalKm, totalMin } = runTotals(segments);

    const targetKm: number = day.run?.targetKm ?? 0;
    const targetMin: number = day.run?.targetMin ?? 0;

    const runEntry = day.run
      ? { segments, totalKm, totalMin, targetKm, targetMin }
      : null;

    const { start, end } = dayBounds(new Date());
    const existing = await WorkoutLog.findOne({
      userId: auth.userId,
      date: { $gte: start, $lt: end },
    });

    // Bugün zaten tamamlanmışsa (dinlenme değil) -> sadece güncelle, ilerleme yok.
    if (existing && !existing.isOffDay) {
      existing.strength = strength;
      existing.run = runEntry;
      await existing.save();
      return json({
        program: toProgramDTO(program),
        log: toWorkoutLogDTO(existing),
      });
    }

    // İlk kez tamamlama (veya bugünkü dinlenme kaydını eziyoruz) -> kaydet + ilerlet.
    const now = new Date();
    const logData = {
      userId: auth.userId,
      programId: program._id,
      date: now,
      dayOrder: day.order,
      weekNumber: program.weekNumber ?? 1,
      title: day.title,
      kind: day.kind,
      isOffDay: false,
      strength,
      run: runEntry,
    };

    let savedLog;
    if (existing) {
      existing.set(logData);
      savedLog = await existing.save();
    } else {
      savedLog = await WorkoutLog.create(logData);
    }

    // Koşu ilerlemesi: en iyi tempoya göre bir sonraki hafta hedefini düşür.
    if (day.run && totalKm > 0 && totalMin > 0) {
      const newMin = progressedRunTargetMin(segments, targetKm, targetMin);
      program.days[currentIndex].run.targetMin = clamp(newMin, 0, 1000);
    }

    // Pointer ilerlet; 7. günden sonra hafta artar (şablon kopyalanır).
    const newIndex = (currentIndex + 1) % 7;
    if (currentIndex === 6) program.weekNumber = (program.weekNumber ?? 1) + 1;
    program.currentIndex = newIndex;
    program.lastActionAt = now;
    program.markModified("days");
    await program.save();

    return json({
      program: toProgramDTO(program),
      log: toWorkoutLogDTO(savedLog),
    });
  } catch (e: any) {
    return serverError(e?.message);
  }
}
