import { dbConnect } from "@/lib/mongodb";
import { Program, WorkoutLog } from "@/lib/models";
import { requireUser, json, badRequest, serverError } from "@/lib/http";
import { clamp } from "@/lib/utils";
import type { StrengthEntryDTO } from "@/lib/types";
import {
  buildRunEntry,
  dayBounds,
  progressedRunTargetMin,
  sanitizeSegments,
  sanitizeStrengthEntries,
  toProgramDTO,
  toWorkoutLogDTO,
} from "../../_lib/program-util";

export const dynamic = "force-dynamic";

interface CardioBody {
  segments?: { km: number; min: number }[];
}
interface CompleteBody {
  strength?: StrengthEntryDTO[];
  run?: CardioBody | null;
  swim?: CardioBody | null;
}

export async function POST(req: Request) {
  const auth = requireUser();
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as CompleteBody;

    await dbConnect();
    const program = await Program.findOne({ userId: auth.userId });
    if (!program) return badRequest("Program bulunamadı");

    const len = program.days?.length || 0;
    if (len === 0) return badRequest("Program boş");
    const currentIndex = clamp(program.currentIndex ?? 0, 0, len - 1);
    const day = program.days[currentIndex];
    if (!day) return badRequest("Gün bulunamadı");

    // Tamamen kendine yeten seans (kaslar/metric payload'dan gelir; işaretçi karışmaz).
    const strength = sanitizeStrengthEntries(body?.strength);

    // Koşu & yüzme: planlı olmasa bile o güne özel girilebilir.
    const runSegs = sanitizeSegments(body?.run?.segments);
    const runEntry = buildRunEntry(runSegs, day.run?.targetKm ?? 0, day.run?.targetMin ?? 0);
    const swimSegs = sanitizeSegments(body?.swim?.segments);
    const swimEntry = buildRunEntry(swimSegs, day.swim?.targetKm ?? 0, day.swim?.targetMin ?? 0);

    const { start, end } = dayBounds(new Date());
    const existing = await WorkoutLog.findOne({
      userId: auth.userId,
      date: { $gte: start, $lt: end },
    });

    // Bugün zaten tamamlanmışsa (dinlenme değil) -> sadece güncelle, ilerleme yok.
    if (existing && !existing.isOffDay) {
      existing.strength = strength;
      existing.run = runEntry;
      existing.swim = swimEntry;
      await existing.save();
      return json({
        program: toProgramDTO(program),
        log: toWorkoutLogDTO(existing),
      });
    }

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
      swim: swimEntry,
    };

    let savedLog;
    if (existing) {
      existing.set(logData);
      savedLog = await existing.save();
    } else {
      savedLog = await WorkoutLog.create(logData);
    }

    // Kardiyo ilerlemesi: SADECE planlı koşu/yüzme günlerinde (o güne özel ilerletmez).
    if (day.run && runEntry) {
      program.days[currentIndex].run.targetMin = clamp(
        progressedRunTargetMin(runSegs, day.run.targetKm, day.run.targetMin),
        0,
        1000
      );
    }
    if (day.swim && swimEntry) {
      program.days[currentIndex].swim.targetMin = clamp(
        progressedRunTargetMin(swimSegs, day.swim.targetKm, day.swim.targetMin),
        0,
        1000
      );
    }

    // Pointer ilerlet; döngü sonunda hafta artar (şablon korunur = kopya).
    // Döngü uzunluğu sabit değil: % days.length (İnci 4, Eren 7).
    const newIndex = (currentIndex + 1) % len;
    if (currentIndex === len - 1) program.weekNumber = (program.weekNumber ?? 1) + 1;
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
