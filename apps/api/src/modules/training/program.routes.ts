import type { FastifyInstance } from "fastify";
import type { HydratedDocument } from "mongoose";
import { z } from "zod";
import {
  buildSchedule,
  currentIndexFor,
  dayOfLog,
  isValidIndex,
  jumpTransition,
  logDayTransition,
  nextCardioTarget,
  normalizeProgramInput,
  pointerOf,
  programMode,
  programVolume,
  reconcilePointer,
  shiftKey,
  trDateKey,
  undoTransition,
  weeklyCycleNumber,
  weeklyVolume,
  zCompleteWorkoutInput,
  zDayId,
  zLogDayInput,
  zProgramInput,
  type CompleteWorkoutInput,
  type DayDTO,
  type LogDayInput,
  type ProgramInput,
  type ProgramView,
  type WorkoutLogDTO,
} from "@fitfloow/core";
import type { AppContext } from "../../context";
import { AppError } from "../../lib/errors";
import { toProgramDTO, type ProgramDoc } from "../../models/program";
import { invalidateAllWeeklyReports } from "../../models/goal";
import { WorkoutLog, toWorkoutLogDTO, type WorkoutLogDoc } from "../../models/workoutLog";
import { listActiveMuscles } from "../../models/muscle";
import { isDuplicateKeyError } from "../platform/users.service";
import {
  assertHasDays,
  buildCardio,
  buildStrengthEntries,
  catalogFor,
  fullCatalog,
  invalidateWeeks,
  loadProgram,
  measurementDayOf,
  setPointer,
  todayLogDoc,
} from "./service";

/** `dayId` (3.0) or the legacy `index`. */
const zJumpInput = z.union([z.object({ dayId: zDayId }), z.object({ index: z.number().int().min(0) })]);
const zSkipInput = z.object({ reason: z.string().max(200).nullish() }).default({});

type ProgramDocument = HydratedDocument<ProgramDoc>;

/** Weekly programs count weeks by the calendar; cycles count completed passes. */
function cycleNumberOn(program: ProgramDoc, dateKey: string, cyclePass: number): number {
  return programMode(program) === "weekly" ? weeklyCycleNumber(trDateKey(program.startedAt ?? new Date()), dateKey) : cyclePass;
}

export async function programRoutes(app: FastifyInstance, ctx: AppContext) {
  const auth = { preHandler: [app.authenticate] };

  /**
   * "Today I did `dayId`" — the single pointer-moving write (complete, rest day, other day).
   * One log per Türkiye day (B9): logging again today *replaces* today's log, and the pointer is
   * first taken back from the log being replaced, so it can never advance twice (B3).
   */
  async function logDay(userId: string, input: LogDayInput): Promise<{ log: WorkoutLogDTO; program: ReturnType<typeof toProgramDTO> }> {
    const now = ctx.now();
    const todayKey = trDateKey(now);
    const program = await loadProgram(userId);
    assertHasDays(program);
    const days = program.days as DayDTO[];
    const existing = await todayLogDoc(userId, now);

    // Same day logged again → edit in place: the pointer and the cardio targets never move twice.
    if (existing && !toWorkoutLogDTO(existing).isBreak && existing.dayId === input.dayId) {
      const day = days.find((d) => d.id === input.dayId) ?? null;
      const catalog = await catalogFor(input.strength.map((e) => e.name));
      existing.set({
        strength: buildStrengthEntries(input.strength, day, catalog, existing.strength),
        run: buildCardio(input.run, day?.run ?? existing.run),
        swim: buildCardio(input.swim, day?.swim ?? existing.swim),
        durationMin: input.durationMin,
        notes: input.notes,
        rpe: input.rpe,
      });
      existing.markModified("strength");
      await existing.save();
      await invalidateWeeks(userId, [existing.dateKey], await measurementDayOf(userId));
      return { log: toWorkoutLogDTO(existing), program: toProgramDTO(program) };
    }

    // Replacing today's log (a break, or a different day): take its pointer move back first.
    const base = existing ? undoTransition(program, existing) : pointerOf(program);
    const t = logDayTransition({ mode: program.mode, days, currentDayId: base.currentDayId, cycleNumber: base.cycleNumber }, input.dayId, {
      resumePlanned: input.resumePlanned,
    });
    if (!t) throw AppError.validation("Bu gün programda yok");
    const day = days[t.dayIndex];

    const catalog = await catalogFor(input.strength.map((e) => e.name));
    const strength = buildStrengthEntries(input.strength, day, catalog);
    const run = buildCardio(input.run, day.run);
    const swim = buildCardio(input.swim, day.swim);
    const cycleNumber = cycleNumberOn(program, todayKey, t.before.cycleNumber);

    const logData = {
      userId,
      programId: program._id,
      date: now,
      dateKey: todayKey,
      dayId: day.id,
      dayOrder: day.order,
      weekNumber: cycleNumber,
      title: day.title,
      kind: day.kind,
      isOffDay: day.kind === "rest",
      isBreak: false,
      strength,
      run,
      swim,
      durationMin: input.durationMin,
      notes: input.notes,
      rpe: input.rpe,
      pointerBefore: t.before.currentIndex,
      pointerBeforeId: t.before.currentDayId,
      pointerAfterId: t.after.currentDayId,
      cycleBefore: t.before.cycleNumber,
    };
    let log: HydratedDocument<WorkoutLogDoc>;
    if (existing) {
      existing.set(logData);
      existing.markModified("strength");
      log = await existing.save();
    } else {
      try {
        log = await WorkoutLog.create(logData);
      } catch (e) {
        // Two taps racing on the same day: the unique (userId, dateKey) index let one through.
        if (isDuplicateKeyError(e)) throw AppError.conflict("Bugünün kaydı az önce yazıldı, sayfayı yenile");
        throw e;
      }
    }

    // Next time this day comes around, aim for the pace that was just achieved.
    if (day.run && run) program.days[t.dayIndex].run = nextCardioTarget(day.run, run);
    if (day.swim && swim) program.days[t.dayIndex].swim = nextCardioTarget(day.swim, swim);
    setPointer(program, { ...t.after, cycleNumber: programMode(program) === "weekly" ? cycleNumber : t.after.cycleNumber });
    program.lastActionAt = now;
    program.markModified("days");
    await program.save();

    await invalidateWeeks(userId, [todayKey], await measurementDayOf(userId));
    return { log: toWorkoutLogDTO(log), program: toProgramDTO(program) };
  }

  /** The day `complete`/`skip` mean when the client doesn't name one. */
  async function plannedDayFor(program: ProgramDocument, todayLog: WorkoutLogDoc | null): Promise<DayDTO> {
    const days = program.days as DayDTO[];
    // B3: re-completing today edits the day actually done, not the one the pointer moved on to.
    if (todayLog && !toWorkoutLogDTO(todayLog).isBreak) {
      const done = dayOfLog(days, toWorkoutLogDTO(todayLog));
      if (done) return done;
    }
    return days[currentIndexFor(program, trDateKey(ctx.now()), false)];
  }

  /** Composite screen endpoint: program + today + the 7-day strip + done and planned volume. */
  app.get("/program", auth, async (req): Promise<ProgramView> => {
    const userId = req.auth.id;
    const now = ctx.now();
    const todayKey = trDateKey(now);

    const [programDoc, muscles, catalog] = await Promise.all([loadProgram(userId), listActiveMuscles(), fullCatalog()]);
    const program = toProgramDTO(programDoc);
    if (program.mode === "weekly") {
      program.cycleNumber = cycleNumberOn(programDoc, todayKey, program.cycleNumber);
      program.weekNumber = program.cycleNumber;
    }

    const logs = (
      await WorkoutLog.find({ userId, dateKey: { $gte: shiftKey(todayKey, -6) } })
        .sort({ date: -1 })
        .lean<WorkoutLogDoc[]>()
    ).map(toWorkoutLogDTO);
    const todayLog = logs.find((l) => l.dateKey === todayKey) ?? null;
    if (program.days.length === 0) throw new AppError(409, "CONFLICT", "Program boş, önce günleri ekle");
    const index = currentIndexFor(program, todayKey, Boolean(todayLog));

    return {
      program,
      current: { index, day: program.days[index] },
      todayLog,
      schedule: buildSchedule(program, logs, todayKey),
      weeklyVolume: weeklyVolume(logs, muscles, now),
      plannedVolume: programVolume(program.days, muscles, { mode: program.mode, catalog }),
    };
  });

  /**
   * Replace the days (and optionally the mode). Days keep their ids, so the pointer stays on
   * the same day however they were reordered (B5). Muscles/metric resolve from the catalog.
   */
  app.put("/program", { ...auth, schema: { body: zProgramInput } }, async (req) => {
    const input = req.body as ProgramInput;
    const program = await loadProgram(req.auth.id);
    const mode = input.mode ?? programMode(program);
    const { days, errors } = normalizeProgramInput(input.days, await fullCatalog(), {
      mode,
      existingIds: (program.days as DayDTO[]).map((d) => d.id),
    });
    if (errors.length > 0) throw AppError.validation(errors[0], errors);

    const pointer = reconcilePointer(program, days);
    program.days = days;
    program.mode = mode;
    setPointer(program, pointer);
    if (input.name) program.name = input.name;
    program.lastActionAt = ctx.now();
    program.markModified("days");
    await program.save();
    // The cycle drives `plannedSessions`, which every cached report already baked into its score.
    await invalidateAllWeeklyReports(req.auth.id);
    return { program: toProgramDTO(program) };
  });

  /** "Continue from here": move the pointer, log nothing. */
  app.post("/program/jump", { ...auth, schema: { body: zJumpInput } }, async (req) => {
    const body = req.body as z.infer<typeof zJumpInput>;
    const program = await loadProgram(req.auth.id);
    const days = program.days as DayDTO[];
    let dayId: string;
    if ("dayId" in body) dayId = body.dayId;
    else {
      if (!isValidIndex(body.index, days.length)) throw AppError.validation(`Gün 0..${days.length - 1} arasında olmalı`);
      dayId = days[body.index].id;
    }
    const next = jumpTransition(program, dayId);
    if (!next) throw AppError.validation("Bu gün programda yok");
    setPointer(program, next);
    program.lastActionAt = ctx.now();
    await program.save();
    return { program: toProgramDTO(program) };
  });

  /** The one write behind every "I did this day today" — see `logDay`. */
  app.post("/program/log-day", { ...auth, schema: { body: zLogDayInput } }, async (req) => logDay(req.auth.id, req.body as LogDayInput));

  /** Finish today's planned day (or edit the day already done today). */
  app.post("/program/complete", { ...auth, schema: { body: zCompleteWorkoutInput } }, async (req) => {
    const input = req.body as CompleteWorkoutInput;
    const program = await loadProgram(req.auth.id);
    assertHasDays(program);
    const day = await plannedDayFor(program, await todayLogDoc(req.auth.id, ctx.now()));
    return logDay(req.auth.id, { ...input, dayId: day.id, resumePlanned: false });
  });

  /**
   * "Dinlendim" / "bugün ara". On a rest day this *does* the rest day and the cycle moves on
   * (B1). On any other day it is a break: an off-day log, the pointer stays so the planned day
   * is still next. Idempotent per Türkiye day.
   */
  app.post("/program/skip", { ...auth, schema: { body: zSkipInput } }, async (req) => {
    const { reason } = (req.body ?? {}) as z.infer<typeof zSkipInput>;
    const userId = req.auth.id;
    const now = ctx.now();
    const todayKey = trDateKey(now);

    const program = await loadProgram(userId);
    assertHasDays(program);
    const existing = await todayLogDoc(userId, now);
    if (existing) {
      const dto = toWorkoutLogDTO(existing);
      if (!dto.isBreak && dto.kind !== "rest") throw AppError.conflict("Bugün zaten tamamlandı");
      return { log: dto, program: toProgramDTO(program) };
    }

    const days = program.days as DayDTO[];
    const planned = days[currentIndexFor(program, todayKey, false)];
    if (planned.kind === "rest") {
      return logDay(userId, { dayId: planned.id, resumePlanned: false, strength: [], run: null, swim: null, durationMin: null, notes: reason ?? null, rpe: null });
    }

    const pointer = pointerOf(program);
    let log: HydratedDocument<WorkoutLogDoc>;
    try {
      log = await WorkoutLog.create({
        userId,
        programId: program._id,
        date: now,
        dateKey: todayKey,
        dayId: null,
        dayOrder: planned.order,
        weekNumber: cycleNumberOn(program, todayKey, pointer.cycleNumber),
        title: "Ara",
        kind: "rest",
        isOffDay: true,
        isBreak: true,
        strength: [],
        run: null,
        swim: null,
        notes: reason ?? null,
        pointerBefore: pointer.currentIndex,
        pointerBeforeId: pointer.currentDayId,
        pointerAfterId: pointer.currentDayId,
        cycleBefore: pointer.cycleNumber,
      });
    } catch (e) {
      if (isDuplicateKeyError(e)) throw AppError.conflict("Bugünün kaydı az önce yazıldı, sayfayı yenile");
      throw e;
    }
    program.lastActionAt = now;
    await program.save();
    await invalidateWeeks(userId, [todayKey], await measurementDayOf(userId));
    return { log: toWorkoutLogDTO(log), program: toProgramDTO(program) };
  });

  /** Undo today's log: delete it and put the pointer back where it was (by id). */
  app.post("/program/undo-last", auth, async (req) => {
    const userId = req.auth.id;
    const now = ctx.now();
    const todayKey = trDateKey(now);

    const program = await loadProgram(userId);
    const last = await WorkoutLog.findOne({ userId, dateKey: todayKey }).sort({ date: -1, _id: -1 });
    if (!last) throw new AppError(404, "NOT_FOUND", "Geri alınacak bugüne ait kayıt yok");

    await last.deleteOne();
    setPointer(program, undoTransition(program, last));
    program.lastActionAt = now;
    await program.save();
    await invalidateWeeks(userId, [last.dateKey], await measurementDayOf(userId));

    return { program: toProgramDTO(program), deletedLogId: String(last._id) };
  });
}
