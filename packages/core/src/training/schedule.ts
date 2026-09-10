/**
 * SCHEDULE STRIP — the next 7 calendar days mapped onto a variable-length program cycle.
 *
 * The cycle is *not* pinned to weekdays: day N of the cycle simply lands on the next calendar
 * day the user trains. So the strip walks forward from the pointer (`% days.length`), and when
 * today is already finished the pointer has moved on — today then shows what was actually done
 * and tomorrow gets the day the pointer now sits on.
 */
import { keyWeekday, shiftKey, trDateKey, daysBetween } from "../time/index";
import type { DayDTO, ScheduleEntry } from "../schemas/index";
import { normalizeIndex } from "./program";
import { toMs, type ProgramLike, type WorkoutLogLike } from "./types";

export interface ScheduleOptions {
  /** Total number of entries (default 7). */
  count?: number;
  /** How many of them are before today (default 0 → the strip starts today). */
  daysBefore?: number;
}

function logKey(log: WorkoutLogLike): string {
  return log.dateKey ?? trDateKey(new Date(toMs(log.date)));
}

/** One log per day; a real session always wins over an off-day marker. */
export function logsByDateKey(logs: readonly WorkoutLogLike[]): Map<string, WorkoutLogLike> {
  const map = new Map<string, WorkoutLogLike>();
  for (const log of logs ?? []) {
    if (!log) continue;
    const key = logKey(log);
    const prev = map.get(key);
    if (!prev || (prev.isOffDay && !log.isOffDay)) map.set(key, log);
  }
  return map;
}

export function buildSchedule(
  program: ProgramLike<DayDTO>,
  logs: readonly WorkoutLogLike[],
  todayKey: string,
  opts: ScheduleOptions = {}
): ScheduleEntry[] {
  const count = Math.max(1, Math.trunc(opts.count ?? 7));
  const daysBefore = Math.max(0, Math.trunc(opts.daysBefore ?? 0));
  const days = program?.days ?? [];
  const len = days.length;
  const byKey = logsByDateKey(logs);
  const byOrder = new Map<number, DayDTO>();
  for (const d of days) if (!byOrder.has(d.order)) byOrder.set(d.order, d);

  const todayLog = byKey.get(todayKey);
  // Once today carries a log the pointer no longer belongs to today: a completed day advanced it,
  // a skipped day left the pending cycle day for tomorrow. Either way the forward walk starts then.
  const consumed = todayLog ? 1 : 0;
  const pointer = normalizeIndex(program?.currentIndex ?? 0, len);

  const out: ScheduleEntry[] = [];
  for (let i = 0; i < count; i++) {
    const dateKey = shiftKey(todayKey, i - daysBefore);
    const offset = daysBetween(todayKey, dateKey);
    const log = byKey.get(dateKey);
    const fromLog = log && log.dayOrder !== undefined ? (byOrder.get(log.dayOrder) ?? null) : null;
    let projected: DayDTO | null = null;
    if (len > 0 && offset >= 0) {
      const cycleIndex =
        offset === 0
          ? todayLog
            ? todayLog.isOffDay
              ? pointer // skipped → that cycle day is still pending
              : normalizeIndex(pointer - 1, len) // completed → the pointer already moved on
            : pointer
          : normalizeIndex(pointer + offset - consumed, len);
      projected = days[cycleIndex] ?? null;
    }
    const status: ScheduleEntry["status"] = log
      ? log.isOffDay
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
