/**
 * SCHEDULE STRIP — calendar days mapped onto the program.
 *
 * A logged date shows the day that was actually done (by `dayId`, legacy logs by `dayOrder`).
 * Upcoming dates are projected: in cycle mode by walking forward from the pointer — once today
 * carries a log the pointer already stands on tomorrow's day — and in weekly mode by weekday.
 */
import { keyWeekday, shiftKey, trDateKey, daysBetween } from "../time/index";
import type { DayDTO, ScheduleEntry } from "../schemas/index";
import { dayIndexOf, normalizeIndex, pointerIndex, programMode, weekdaySlot, type PointerProgramLike } from "./program";
import { toMs, type WorkoutLogLike } from "./types";

export interface ScheduleOptions {
  /** Total number of entries (default 7). */
  count?: number;
  /** How many of them are before today (default 0 → the strip starts today). */
  daysBefore?: number;
}

function logKey(log: WorkoutLogLike): string {
  return log.dateKey ?? trDateKey(new Date(toMs(log.date)));
}

/** A break (day off outside the plan). Pre-3.0 off-day logs were all breaks. */
export function isBreakLog(log: Pick<WorkoutLogLike, "isBreak" | "isOffDay" | "dayId"> | null | undefined): boolean {
  if (!log) return false;
  if (typeof log.isBreak === "boolean") return log.isBreak;
  return log.isOffDay === true && !log.dayId;
}

/** One log per day; a real session always wins over a break. */
export function logsByDateKey(logs: readonly WorkoutLogLike[]): Map<string, WorkoutLogLike> {
  const map = new Map<string, WorkoutLogLike>();
  for (const log of logs ?? []) {
    if (!log) continue;
    const key = logKey(log);
    const prev = map.get(key);
    if (!prev || (isBreakLog(prev) && !isBreakLog(log))) map.set(key, log);
  }
  return map;
}

/** The program day a log refers to (id first, then the legacy order), or `null`. */
export function dayOfLog<TDay extends DayDTO>(days: ReadonlyArray<TDay>, log: WorkoutLogLike | null | undefined): TDay | null {
  if (!log) return null;
  const byId = dayIndexOf(days, log.dayId);
  if (byId >= 0) return days[byId];
  if (log.dayOrder === undefined) return null;
  return days.find((d) => d.order === log.dayOrder) ?? null;
}

export function buildSchedule(
  program: PointerProgramLike<DayDTO>,
  logs: readonly WorkoutLogLike[],
  todayKey: string,
  opts: ScheduleOptions = {}
): ScheduleEntry[] {
  const count = Math.max(1, Math.trunc(opts.count ?? 7));
  const daysBefore = Math.max(0, Math.trunc(opts.daysBefore ?? 0));
  const days = program?.days ?? [];
  const len = days.length;
  const weekly = programMode(program) === "weekly";
  const byKey = logsByDateKey(logs);

  const todayLog = byKey.get(todayKey);
  // Once today carries a log the pointer no longer belongs to today: a done day advanced it,
  // a break left the pending day for tomorrow. Either way the forward walk starts tomorrow.
  const consumed = todayLog ? 1 : 0;
  const pointer = pointerIndex(program);

  const out: ScheduleEntry[] = [];
  for (let i = 0; i < count; i++) {
    const dateKey = shiftKey(todayKey, i - daysBefore);
    const offset = daysBetween(todayKey, dateKey);
    const log = byKey.get(dateKey);
    const fromLog = dayOfLog(days, log);
    let projected: DayDTO | null = null;
    if (len > 0 && weekly) {
      projected = days[normalizeIndex(weekdaySlot(dateKey), len)] ?? null;
    } else if (len > 0 && offset >= 0) {
      const cycleIndex =
        offset === 0
          ? todayLog
            ? isBreakLog(todayLog)
              ? pointer // break → that cycle day is still pending
              : normalizeIndex(pointer - 1, len) // done → the pointer already moved on
            : pointer
          : normalizeIndex(pointer + offset - consumed, len);
      projected = days[cycleIndex] ?? null;
    }
    const status: ScheduleEntry["status"] = log
      ? isBreakLog(log)
        ? "skipped"
        : "done"
      : offset === 0
        ? "today"
        : offset < 0
          ? "past"
          : "upcoming";
    out.push({
      dateKey,
      weekday: keyWeekday(dateKey),
      isToday: offset === 0,
      day: fromLog ?? projected,
      status,
      logId: log?.id ?? null,
    });
  }
  return out;
}
