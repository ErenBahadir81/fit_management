import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  advancePointer,
  buildSchedule,
  isValidIndex,
  jumpTo,
  nextCardioTarget,
  normalizeIndex,
  normalizeProgramInput,
  rewindPointer,
  shiftKey,
  trDateKey,
  weeklyVolume,
  zCompleteWorkoutInput,
  zProgramInput,
  type CompleteWorkoutInput,
  type ProgramInput,
  type ProgramView,
  type WorkoutLogDTO,
} from "@fitfloow/core";
import type { AppContext } from "../../context";
import { AppError } from "../../lib/errors";
import { Program, toProgramDTO, type ProgramDoc } from "../../models/program";
import { WorkoutLog, toWorkoutLogDTO, type WorkoutLogDoc } from "../../models/workoutLog";
import { listActiveMuscles } from "../../models/muscle";
import {
  buildCardio,
  buildStrengthEntries,
  catalogFor,
  fullCatalog,
  invalidateWeeks,
  loadProgram,
  measurementDayOf,
  pointerDay,
  PROGRAM_MISSING,
  todayLogDoc,
} from "./service";

const zJumpInput = z.object({ index: z.number().int().min(0) });
const zSkipInput = z.object({ reason: z.string().max(200).nullish() }).default({});

export async function programRoutes(app: FastifyInstance, ctx: AppContext) {
  const auth = { preHandler: [app.authenticate] };

  /** Composite screen endpoint: program + today + the 7-day strip + weekly volume. */
  app.get("/program", auth, async (req): Promise<ProgramView> => {
    const userId = req.auth.id;
    const now = ctx.now();
    const todayKey = trDateKey(now);

    const [programDoc, muscles] = await Promise.all([
      Program.findOne({ userId }).lean<ProgramDoc | null>(),
      listActiveMuscles(),
    ]);
    if (!programDoc) throw new AppError(404, "NOT_FOUND", PROGRAM_MISSING);
    const { index, day } = pointerDay(programDoc);

    const logs = (
      await WorkoutLog.find({ userId, dateKey: { $gte: shiftKey(todayKey, -6) } })
        .sort({ date: -1 })
        .lean<WorkoutLogDoc[]>()
    ).map(toWorkoutLogDTO);

    const program = toProgramDTO(programDoc);
    program.currentIndex = index;
    return {
      program,
      current: { index, day },
      todayLog: logs.find((l) => l.dateKey === todayKey) ?? null,
      schedule: buildSchedule({ days: program.days, currentIndex: index, weekNumber: program.weekNumber }, logs, todayKey),
      weeklyVolume: weeklyVolume(logs, muscles, now),
    };
  });

  /** Replace the cycle. Muscles/metric are resolved from the catalog; the pointer stays in range. */
  app.put("/program", { ...auth, schema: { body: zProgramInput } }, async (req) => {
    const input = req.body as ProgramInput;
    const program = await loadProgram(req.auth.id);
    const { days, errors } = normalizeProgramInput(input.days, await fullCatalog());
    if (errors.length > 0) throw AppError.validation(errors[0], errors);

    program.days = days;
    program.currentIndex = normalizeIndex(program.currentIndex, days.length);
    if (input.name) program.name = input.name;
    program.lastActionAt = ctx.now();
    program.markModified("days");
    await program.save();
    return { program: toProgramDTO(program) };
  });

  app.post("/program/jump", { ...auth, schema: { body: zJumpInput } }, async (req) => {
    const { index } = req.body as z.infer<typeof zJumpInput>;
    const program = await loadProgram(req.auth.id);
    if (!isValidIndex(index, program.days.length)) throw AppError.validation(`Gün 0..${program.days.length - 1} arasında olmalı`);
    const next = jumpTo(program, index);
    program.currentIndex = next.currentIndex;
    program.lastActionAt = ctx.now();
    await program.save();
    return { program: toProgramDTO(program) };
  });

  /** Finish today's session: write the log, progress cardio targets, advance the pointer. */
  app.post("/program/complete", { ...auth, schema: { body: zCompleteWorkoutInput } }, async (req) => {
    const input = req.body as CompleteWorkoutInput;
    const userId = req.auth.id;
    const now = ctx.now();
    const todayKey = trDateKey(now);

    const program = await loadProgram(userId);
    const { index, day } = pointerDay(program);
    const catalog = await catalogFor(input.strength.map((e) => e.name));
    const strength = buildStrengthEntries(input.strength, day, catalog);
    const run = buildCardio(input.run, day.run);
    const swim = buildCardio(input.swim, day.swim);
    const existing = await todayLogDoc(userId, now);

    // Already completed today → edit in place; the pointer and the targets never move twice.
    if (existing && !existing.isOffDay) {
      existing.set({ strength, run, swim, durationMin: input.durationMin, notes: input.notes, rpe: input.rpe });
      existing.markModified("strength");
      await existing.save();
      await invalidateWeeks(userId, [existing.dateKey], await measurementDayOf(userId));
      return { log: toWorkoutLogDTO(existing), program: toProgramDTO(program) };
    }

    const logData = {
      userId,
      programId: program._id,
      date: now,
      dateKey: todayKey,
      dayOrder: day.order,
      weekNumber: program.weekNumber,
      title: day.title,
      kind: day.kind,
      isOffDay: false,
      strength,
      run,
      swim,
      durationMin: input.durationMin,
      notes: input.notes,
      rpe: input.rpe,
      pointerBefore: index,
    };
    let log;
    if (existing) {
      existing.set(logData);
      existing.markModified("strength");
      log = await existing.save();
    } else {
      log = await WorkoutLog.create(logData);
    }

    // Next time this day comes around, aim for the pace that was just achieved.
    if (day.run && run) program.days[index].run = nextCardioTarget(day.run, run);
    if (day.swim && swim) program.days[index].swim = nextCardioTarget(day.swim, swim);
    const next = advancePointer(program);
    program.currentIndex = next.currentIndex;
    program.weekNumber = next.weekNumber;
    program.lastActionAt = now;
    program.markModified("days");
    await program.save();

    await invalidateWeeks(userId, [todayKey], await measurementDayOf(userId));
    return { log: toWorkoutLogDTO(log), program: toProgramDTO(program) };
  });

  /** Rest day: an off-day log, pointer untouched, idempotent per Türkiye day. */
  app.post("/program/skip", { ...auth, schema: { body: zSkipInput } }, async (req) => {
    const { reason } = (req.body ?? {}) as z.infer<typeof zSkipInput>;
    const userId = req.auth.id;
    const now = ctx.now();
    const todayKey = trDateKey(now);

    const program = await loadProgram(userId);
    const { index, day } = pointerDay(program);
    const existing = await todayLogDoc(userId, now);
    if (existing) {
      if (!existing.isOffDay) throw AppError.conflict("Bugün zaten tamamlandı");
      return { log: toWorkoutLogDTO(existing), program: toProgramDTO(program) };
    }

    const log = await WorkoutLog.create({
      userId,
      programId: program._id,
      date: now,
      dateKey: todayKey,
      dayOrder: day.order,
      weekNumber: program.weekNumber,
      title: "Dinlenme",
      kind: day.kind,
      isOffDay: true,
      strength: [],
      run: null,
      swim: null,
      notes: reason ?? null,
      pointerBefore: index,
    });
    program.lastActionAt = now;
    await program.save();
    await invalidateWeeks(userId, [todayKey], await measurementDayOf(userId));
    return { log: toWorkoutLogDTO(log), program: toProgramDTO(program) };
  });

  /** Undo today's complete/skip: delete the log and put the pointer back. */
  app.post("/program/undo-last", auth, async (req) => {
    const userId = req.auth.id;
    const now = ctx.now();
    const todayKey = trDateKey(now);

    const program = await loadProgram(userId);
    const last = await WorkoutLog.findOne({ userId }).sort({ date: -1, _id: -1 });
    if (!last || last.dateKey !== todayKey) throw new AppError(404, "NOT_FOUND", "Geri alınacak bugüne ait kayıt yok");

    await last.deleteOne();
    if (!last.isOffDay) {
      const back = rewindPointer(program, last.pointerBefore);
      program.currentIndex = back.currentIndex;
      program.weekNumber = back.weekNumber;
    }
    program.lastActionAt = now;
    await program.save();
    await invalidateWeeks(userId, [last.dateKey], await measurementDayOf(userId));

    const deleted: WorkoutLogDTO = toWorkoutLogDTO(last);
    return { program: toProgramDTO(program), deletedLogId: deleted.id };
  });
}
