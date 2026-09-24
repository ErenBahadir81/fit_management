/**
 * THE PLAN, PRESENTED — labels and projections for the program tab (pure).
 *
 * - The pass counter is `cycleNumber`: a week in weekly mode, a cycle in cycle mode.
 * - Weekly programs are read as a calendar week (Monday … Sunday, with what was done this week);
 *   cycle programs as "the next 7 days" walked forward from the pointer.
 * - "Bugün başka bir şey yaptım" lists the program's days; in cycle mode it can also keep the
 *   planned day next in line (`resumePlanned`).
 */
import {
  WEEKDAY_TITLES_TR,
  buildSchedule,
  cycleNumberOf,
  programMode,
  weekdaySlot,
  type DayDTO,
  type ProgramDTO,
  type ProgramView,
  type ScheduleEntry,
  type WorkoutLogLike,
} from "@fitfloow/core";

type ProgramLike = Pick<ProgramDTO, "mode" | "days"> & Partial<Pick<ProgramDTO, "cycleNumber" | "weekNumber" | "currentDayId" | "currentIndex">>;

/** "4. hafta" (weekly) / "3. döngü" (cycle). */
export function passLabel(program: ProgramLike): string {
  const n = cycleNumberOf(program);
  return programMode(program) === "weekly" ? `${n}. hafta` : `${n}. döngü`;
}

/**
 * The small line above today's title: where in the program this day sits.
 * Weekly: "Perşembe · 4. hafta"; cycle: "3. döngü · 2/6. gün".
 */
export function dayEyebrow(program: ProgramLike, day: Pick<DayDTO, "id"> | null, todayKey: string): string {
  if (programMode(program) === "weekly") return `${WEEKDAY_TITLES_TR[weekdaySlot(todayKey)]} · ${passLabel(program)}`;
  const index = day ? program.days.findIndex((d) => d.id === day.id) : -1;
  return index >= 0 ? `${passLabel(program)} · ${index + 1}/${program.days.length}. gün` : passLabel(program);
}

/**
 * The days under today's card.
 * - weekly: this calendar week, Monday first — past days show what was logged (or nothing).
 * - cycle: today and the six days after it, walked forward from the pointer (the server's strip).
 * `logs` = the history the screen already has; today's log comes from the view.
 */
export function upcomingDays(view: ProgramView, logs: readonly WorkoutLogLike[], todayKey: string): ScheduleEntry[] {
  if (programMode(view.program) !== "weekly") return view.schedule;
  const all: WorkoutLogLike[] = logs.filter((l) => (l.dateKey ?? "") !== todayKey);
  if (view.todayLog) all.push(view.todayLog);
  return buildSchedule(view.program, all, todayKey, { count: 7, daysBefore: weekdaySlot(todayKey) });
}

/** "Önümüzdeki 7 gün" / "Bu hafta". */
export function upcomingTitle(program: ProgramLike): string {
  return programMode(program) === "weekly" ? "Bu hafta" : "Önümüzdeki 7 gün";
}

export interface DayChoice {
  day: DayDTO;
  /** 1-based position in the cycle / the weekday in weekly mode. */
  position: string;
  /** The day the plan had for today. */
  planned: boolean;
}

/** Every day of the program, for "Bugün başka bir şey yaptım". */
export function dayChoices(program: Pick<ProgramDTO, "mode" | "days">, plannedDayId: string | null): DayChoice[] {
  const weekly = programMode(program) === "weekly";
  return program.days.map((day, i) => ({
    day,
    position: weekly ? (WEEKDAY_TITLES_TR[i] ?? `${i + 1}. gün`) : `${i + 1}. gün`,
    planned: day.id === plannedDayId,
  }));
}

/**
 * Can "İdmanı kaçırdım, sıraya geri koy" apply? Only in a cycle (weekly lets the calendar decide
 * tomorrow) and only when the chosen day is not the planned one, and the planned one is a real
 * session — there is nothing to miss about a rest day.
 */
export function canResumePlanned(program: Pick<ProgramDTO, "mode" | "days">, plannedDayId: string | null, chosenId: string | null): boolean {
  if (programMode(program) !== "cycle" || !plannedDayId || !chosenId || plannedDayId === chosenId) return false;
  const planned = program.days.find((d) => d.id === plannedDayId);
  return Boolean(planned && planned.kind !== "rest");
}
