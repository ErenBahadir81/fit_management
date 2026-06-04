import { dbConnect } from "@/lib/mongodb";
import { Program, WorkoutLog } from "@/lib/models";
import { requireUser, json, badRequest, serverError } from "@/lib/http";
import { WEEKDAYS_TR, WEEKDAYS_TR_LONG } from "@/lib/utils";
import { trStartOfDay, trAddDays, trMondayIndex } from "@/lib/time";
import type { DayDTO, WorkoutLogDTO } from "@/lib/types";
import {
  sanitizeDay,
  toProgramDTO,
  toWorkoutLogDTO,
  dayBounds,
} from "../_lib/program-util";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = requireUser();
  if ("response" in auth) return auth.response;

  try {
    await dbConnect();
    const program = await Program.findOne({ userId: auth.userId });
    if (!program) return badRequest("Program bulunamadı");

    const dto = toProgramDTO(program);
    const index = dto.currentIndex;
    const day = dto.days[index];

    const { start, end } = dayBounds(new Date());
    const logDoc = await WorkoutLog.findOne({
      userId: auth.userId,
      date: { $gte: start, $lt: end },
    }).lean();
    const todayLog: WorkoutLogDTO | null = logDoc
      ? toWorkoutLogDTO(logDoc)
      : null;

    const today = trStartOfDay();
    const schedule = Array.from({ length: 7 }).map((_, i) => {
      const d = dto.days[(index + i) % 7];
      const date = trAddDays(today, i);
      const wi = trMondayIndex(date);
      return {
        dateISO: date.toISOString(),
        weekdayShort: WEEKDAYS_TR[wi],
        weekdayLong: WEEKDAYS_TR_LONG[wi],
        offset: i,
        dayOrder: d.order,
        title: d.title,
        focus: d.focus,
        kind: d.kind,
      };
    });

    return json({
      program: dto,
      current: { index, day },
      todayLog,
      schedule,
    });
  } catch (e: any) {
    return serverError(e?.message);
  }
}

export async function PUT(req: Request) {
  const auth = requireUser();
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json()) as { dayIndex?: number; day?: DayDTO };
    const dayIndex = Number(body?.dayIndex);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
      return badRequest("Geçersiz gün");
    }
    if (!body?.day) return badRequest("Gün verisi eksik");

    await dbConnect();
    const program = await Program.findOne({ userId: auth.userId });
    if (!program) return badRequest("Program bulunamadı");
    if (!program.days?.[dayIndex]) return badRequest("Gün bulunamadı");

    program.days[dayIndex] = sanitizeDay(body.day, dayIndex);
    program.markModified("days");
    await program.save();

    return json({ program: toProgramDTO(program) });
  } catch (e: any) {
    return serverError(e?.message);
  }
}
