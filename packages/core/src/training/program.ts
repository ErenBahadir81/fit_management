/**
 * PROGRAM — the cycle pointer and program input normalization (pure). The ONLY place the
 * pointer is computed: the API, the admin panel and the mobile optimistic cache all call these (B7).
 *
 * Two modes, one engine:
 * - `cycle`  — N days repeat independently of the calendar (idman · koşu · mola …).
 * - `weekly` — exactly 7 days, Monday first; the calendar picks the day.
 *
 * The rule: **the next day is the one after the day you actually did.** The pointer is held by
 * day *id*, never by position, so reordering, inserting or deleting days can't move "today"
 * to another day (B5), and undo/delete restore the exact id that was there before (B4).
 * Every pointer move goes through `logDayTransition` (did a day), `jumpTransition` (continue
 * from here, nothing done) or `undoTransition` (took a log back).
 */
import { clamp } from "../utils/index";
import { daysBetween, keyWeekday, shiftKey } from "../time/index";
import type { CardioTargetDTO, DayDTO, DayKind, ExerciseMetric, ExerciseTargetDTO, ProgramMode } from "../schemas/index";
import { normalizeMuscleLoads } from "./types";

const DAY_KINDS: readonly DayKind[] = ["strength", "run", "swim", "stretch", "rest"];
const METRICS: readonly ExerciseMetric[] = ["reps", "time", "stretch"];
const DAY_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** A weekly program has one day per weekday, Monday first. */
export const WEEKLY_DAY_COUNT = 7;
export const WEEKDAY_TITLES_TR = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"] as const;

/* ------------------------------ names (B8) -------------------------------- */

/**
 * The one exercise-name key, identical in core, API and admin (B8). Folds every Turkish/English
 * i variant (I, İ, ı, i) to `i` so "Incline", "İncline" and "ıncline" are one exercise whatever
 * the device locale, and collapses whitespace.
 */
export function exerciseNameKey(name: string | null | undefined): string {
  return String(name ?? "")
    .normalize("NFC")
    .replace(/[\u0130I\u0131]/g, "i") // İ, I, ı → i
    .replace(/i\u0307/g, "i") // a decomposed İ that was already lower-cased
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------ day identity ----------------------------- */

export interface DayRefLike {
  id?: string | null;
  order?: number;
  kind?: string;
}

/** Safe modulo — negative and out-of-range indexes fold back into `[0, length)`. */
export function normalizeIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || length <= 0) return 0;
  const i = Math.trunc(index);
  return ((i % length) + length) % length;
}

/** Is `index` a real day of this program? */
export function isValidIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length;
}

export function isDayId(id: unknown): id is string {
  return typeof id === "string" && DAY_ID_RE.test(id);
}

/** A fresh id that none of `taken` uses: `d<n>` with n one above the largest `d<number>`. */
export function freshDayId(taken: Iterable<string>): string {
  let max = 0;
  const set = new Set<string>();
  for (const id of taken) {
    set.add(id);
    const m = /^d(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  let n = max + 1;
  while (set.has(`d${n}`)) n++;
  return `d${n}`;
}

/**
 * Gives every day a valid, unique id — keeps the ones it already has, fills the rest. Pre-3.0
 * programs have no ids at all; they get `d1…dN` in their stored order, which is also how
 * their logs (`dayOrder`) are mapped, so history and pointer stay on the same days.
 */
export function ensureDayIds<T extends DayRefLike>(days: ReadonlyArray<T>): Array<T & { id: string }> {
  const list = days ?? [];
  const seen = new Set<string>();
  const keep = list.map((d) => {
    const id = d?.id;
    if (isDayId(id) && !seen.has(id)) {
      seen.add(id);
      return id;
    }
    return null;
  });
  // Legacy days get `d<order>` when that is free, so a migrated program reads naturally.
  return list.map((d, i) => {
    let id = keep[i];
    if (!id) {
      const legacy = `d${Number.isInteger(d?.order) && (d!.order as number) > 0 ? d!.order : i + 1}`;
      id = seen.has(legacy) ? freshDayId(seen) : legacy;
      seen.add(id);
    }
    return { ...d, id };
  });
}

export function dayIndexOf(days: ReadonlyArray<DayRefLike>, id: string | null | undefined): number {
  if (!id) return -1;
  return (days ?? []).findIndex((d) => d?.id === id);
}

/* ------------------------------ the pointer ------------------------------ */

export interface PointerProgramLike<TDay extends DayRefLike = DayRefLike> {
  mode?: ProgramMode | string | null;
  days: ReadonlyArray<TDay>;
  currentDayId?: string | null;
  /** Legacy (pre-3.0) pointer; only read when `currentDayId` is missing or unknown. */
  currentIndex?: number;
  cycleNumber?: number;
  /** Legacy name of `cycleNumber`. */
  weekNumber?: number;
}

export interface PointerState {
  currentDayId: string | null;
  currentIndex: number;
  cycleNumber: number;
  /** This move completed a pass through the cycle. */
  wrapped: boolean;
}

export function programMode(program: { mode?: string | null } | null | undefined): ProgramMode {
  return program?.mode === "weekly" ? "weekly" : "cycle";
}

export function cycleNumberOf(program: Pick<PointerProgramLike, "cycleNumber" | "weekNumber"> | null | undefined): number {
  const raw = program?.cycleNumber ?? program?.weekNumber ?? 1;
  return Math.max(1, Math.trunc(Number.isFinite(raw) ? raw : 1));
}

/** Where the pointer is: the id when it is a real day, else the legacy index, else day 1. */
export function pointerIndex(program: PointerProgramLike): number {
  const days = program?.days ?? [];
  if (days.length === 0) return 0;
  const byId = dayIndexOf(days, program.currentDayId);
  if (byId >= 0) return byId;
  return normalizeIndex(program.currentIndex ?? 0, days.length);
}

/** The full pointer state of a stored program (normalizes legacy documents). */
export function pointerOf(program: PointerProgramLike): PointerState {
  const days = program?.days ?? [];
  const index = pointerIndex(program);
  return { currentDayId: days[index]?.id ?? null, currentIndex: index, cycleNumber: cycleNumberOf(program), wrapped: false };
}

/** Monday = 0 … Sunday = 6 — the slot of `dateKey` in a weekly program. */
export function weekdaySlot(dateKey: string): number {
  return (keyWeekday(dateKey) + 6) % 7;
}

/** Weekly mode: weeks since the Monday of the start week, 1-based. */
export function weeklyCycleNumber(startKey: string, dateKey: string): number {
  const startMonday = shiftKey(startKey, -weekdaySlot(startKey));
  return Math.max(1, Math.floor(daysBetween(startMonday, dateKey) / 7) + 1);
}

/**
 * "Today I did `dayId`." Returns the pointer before and after, or `null` for an unknown day.
 * - cycle: next = the day after `dayId`; a pass completes when the last day was done.
 *   `resumePlanned` keeps the day that was planned as the next one instead, so a
 *   swapped-in day doesn't swallow the one it replaced.
 * - weekly: the calendar decides tomorrow; the pointer just follows the day done.
 */
export function logDayTransition(
  program: PointerProgramLike,
  dayId: string,
  opts: { resumePlanned?: boolean } = {}
): { before: PointerState; after: PointerState; dayIndex: number } | null {
  const days = program?.days ?? [];
  const dayIndex = dayIndexOf(days, dayId);
  if (dayIndex < 0) return null;
  const before = pointerOf(program);
  const len = days.length;
  const resume = Boolean(opts.resumePlanned) && programMode(program) === "cycle" && before.currentIndex !== dayIndex;
  const nextIndex = resume ? before.currentIndex : (dayIndex + 1) % len;
  const wrapped = !resume && programMode(program) === "cycle" && dayIndex === len - 1;
  const after: PointerState = {
    currentDayId: days[nextIndex]?.id ?? null,
    currentIndex: nextIndex,
    cycleNumber: before.cycleNumber + (wrapped ? 1 : 0),
    wrapped,
  };
  return { before, after, dayIndex };
}

/** "Continue from here": move the pointer without logging anything. `null` for an unknown day. */
export function jumpTransition(program: PointerProgramLike, dayId: string): PointerState | null {
  const index = dayIndexOf(program?.days ?? [], dayId);
  if (index < 0) return null;
  return { currentDayId: dayId, currentIndex: index, cycleNumber: cycleNumberOf(program), wrapped: false };
}

/** What a log remembers about the pointer so it can be taken back. */
export interface LogPointerLike {
  isBreak?: boolean | null;
  isOffDay?: boolean;
  pointerBeforeId?: string | null;
  pointerAfterId?: string | null;
  cycleBefore?: number | null;
  /** Legacy (pre-3.0): the index before the move. */
  pointerBefore?: number | null;
}

/**
 * Taking a log back (undo or deleting it from history). The pointer returns to where it was
 * before the log *only if nothing moved it since* — i.e. it still sits where that log left it.
 * Otherwise a later action owns the pointer and it stays put. Breaks never moved it.
 */
export function undoTransition(program: PointerProgramLike, log: LogPointerLike): PointerState {
  const now = pointerOf(program);
  const days = program?.days ?? [];
  if (days.length === 0 || !log) return now;
  const isBreak = log.isBreak ?? (log.isOffDay === true && !log.pointerAfterId);
  if (isBreak && !log.pointerAfterId) return now;

  if (log.pointerAfterId !== undefined && log.pointerAfterId !== null) {
    if (now.currentDayId !== log.pointerAfterId) return now;
    const back = dayIndexOf(days, log.pointerBeforeId);
    if (back < 0) return now;
    return {
      currentDayId: days[back].id ?? null,
      currentIndex: back,
      cycleNumber: Math.max(1, Math.trunc(log.cycleBefore ?? now.cycleNumber)),
      wrapped: false,
    };
  }

  // Legacy log: only an index. It advanced by exactly one, so it still owns the pointer iff
  // the pointer sits right after it.
  if (log.pointerBefore === null || log.pointerBefore === undefined || !Number.isFinite(log.pointerBefore)) return now;
  const back = normalizeIndex(log.pointerBefore, days.length);
  if (now.currentIndex !== (back + 1) % days.length) return now;
  const wrapped = back === days.length - 1;
  return {
    currentDayId: days[back].id ?? null,
    currentIndex: back,
    cycleNumber: wrapped ? Math.max(1, now.cycleNumber - 1) : now.cycleNumber,
    wrapped: false,
  };
}

/**
 * After the days were edited: the pointer stays on the same day id (B5). If that day was
 * removed, it takes the day now at the old position (clamped), so the user loses nothing.
 */
export function reconcilePointer(before: PointerProgramLike, nextDays: ReadonlyArray<DayRefLike>): PointerState {
  const old = pointerOf(before);
  const len = nextDays?.length ?? 0;
  if (len === 0) return { currentDayId: null, currentIndex: 0, cycleNumber: old.cycleNumber, wrapped: false };
  const keep = dayIndexOf(nextDays, old.currentDayId);
  const index = keep >= 0 ? keep : clamp(old.currentIndex, 0, len - 1);
  return { currentDayId: nextDays[index]?.id ?? null, currentIndex: index, cycleNumber: old.cycleNumber, wrapped: false };
}

/**
 * The day to show as "next" on `todayKey`.
 * - cycle: the pointer (after today's log it has already moved on).
 * - weekly: today's weekday, or tomorrow's once today carries a log.
 */
export function currentIndexFor(program: PointerProgramLike, todayKey: string, todayLogged: boolean): number {
  const len = program?.days?.length ?? 0;
  if (len === 0) return 0;
  if (programMode(program) === "weekly") return normalizeIndex(weekdaySlot(todayLogged ? shiftKey(todayKey, 1) : todayKey), len);
  return pointerIndex(program);
}

/**
 * The next `count` planned days starting at `fromKey` (cycle: walking forward from the pointer;
 * weekly: by weekday). `consumed` = the pointer already stands on the day *after* `fromKey`.
 */
export function projectDays<TDay extends DayRefLike>(
  program: PointerProgramLike<TDay>,
  fromKey: string,
  count: number
): Array<{ dateKey: string; index: number; day: TDay }> {
  const days = program?.days ?? [];
  if (days.length === 0) return [];
  const base = pointerIndex(program);
  const weekly = programMode(program) === "weekly";
  const out: Array<{ dateKey: string; index: number; day: TDay }> = [];
  for (let i = 0; i < Math.max(0, Math.trunc(count)); i++) {
    const dateKey = shiftKey(fromKey, i);
    const index = weekly ? normalizeIndex(weekdaySlot(dateKey), days.length) : normalizeIndex(base + i, days.length);
    out.push({ dateKey, index, day: days[index] });
  }
  return out;
}

/* ------------------------------ normalization ---------------------------- */

export interface CatalogExerciseLike {
  name: string;
  muscles?: ReadonlyArray<{ key: string; load?: number } | string>;
  metric?: string;
  defaultSets?: number;
  defaultReps?: number;
  active?: boolean;
}

export interface ExerciseTargetInputLike {
  name?: string;
  muscles?: ReadonlyArray<{ key: string; load?: number } | string>;
  targetSets?: number;
  targetReps?: number;
  targetRIR?: number | null;
  metric?: string;
}

export interface DayInputLike {
  id?: string;
  order?: number;
  title?: string;
  focus?: string;
  kind?: string;
  exercises?: ReadonlyArray<ExerciseTargetInputLike>;
  run?: Partial<CardioTargetDTO> | null;
  swim?: Partial<CardioTargetDTO> | null;
}

/** Exercise lookup by `exerciseNameKey` (inactive rows are left out). */
export function catalogIndex(catalog: readonly CatalogExerciseLike[]): Map<string, CatalogExerciseLike> {
  const map = new Map<string, CatalogExerciseLike>();
  for (const e of catalog ?? []) {
    if (!e?.name || e.active === false) continue;
    map.set(exerciseNameKey(e.name), e);
  }
  return map;
}

function intIn(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

function normalizeCardio(raw: Partial<CardioTargetDTO> | null | undefined): CardioTargetDTO | null {
  if (!raw) return null;
  const targetKm = clamp(Number(raw.targetKm) || 0, 0, 200);
  const targetMin = clamp(Number(raw.targetMin) || 0, 0, 1440);
  return { targetKm, targetMin, label: typeof raw.label === "string" ? raw.label.slice(0, 40) : "" };
}

export interface NormalizedProgram {
  days: DayDTO[];
  errors: string[];
}

export interface NormalizeOptions {
  /** `weekly` requires exactly 7 days (Monday first). */
  mode?: ProgramMode;
  /** Ids already in use by the stored program — a sent id is kept only if it is one of these. */
  existingIds?: Iterable<string>;
}

/**
 * Fills in everything the client may omit and reports contract violations:
 * - `id` kept when it names an existing day (so the pointer and history follow it), else a fresh one
 * - `muscles` omitted → resolved from the exercise catalog by name (`exerciseNameKey`)
 * - `metric` omitted → the catalog's metric, else "reps"
 * - day orders must be 1..N (they are renumbered anyway so the data stays usable)
 * - an exercise that is neither in the catalog nor carries explicit muscles is an error
 * - weekly mode needs exactly 7 days
 */
export function normalizeProgramInput(
  days: ReadonlyArray<DayInputLike>,
  catalog: readonly CatalogExerciseLike[] = [],
  opts: NormalizeOptions = {}
): NormalizedProgram {
  const index = catalogIndex(catalog);
  const errors: string[] = [];
  const list = days ?? [];

  const orders = list.map((d, i) => (Number.isFinite(d?.order) ? Math.trunc(d!.order as number) : i + 1));
  const ordersOk = orders.length > 0 && orders.every((o, i) => o === i + 1);
  if (!ordersOk) errors.push(`Gün sıraları 1..${list.length} olmalı`);
  if (opts.mode === "weekly" && list.length !== WEEKLY_DAY_COUNT) errors.push("Haftalık programda tam 7 gün olmalı (Pazartesi → Pazar)");

  // Ids: an existing id survives (first occurrence only); anything else gets a fresh one.
  const known = opts.existingIds ? new Set(opts.existingIds) : null;
  const used = new Set<string>();
  const ids = list.map((d) => {
    const id = d?.id;
    if (isDayId(id) && !used.has(id) && (known === null || known.has(id))) {
      used.add(id);
      return id;
    }
    return null;
  });
  const taken = new Set<string>([...used, ...(known ?? [])]);
  const finalIds = ids.map((id) => {
    if (id) return id;
    const fresh = freshDayId(taken);
    taken.add(fresh);
    return fresh;
  });

  const out = list.map((day, i) => {
    const kind = (DAY_KINDS as readonly string[]).includes(day?.kind ?? "") ? (day!.kind as DayKind) : "strength";
    const exercises: ExerciseTargetDTO[] = (day?.exercises ?? []).slice(0, 20).map((raw) => {
      const name = String(raw?.name ?? "").trim().slice(0, 80) || "Hareket";
      const found = index.get(exerciseNameKey(name));
      const explicit = raw?.muscles !== undefined;
      const muscles = explicit ? normalizeMuscleLoads(raw!.muscles) : normalizeMuscleLoads(found?.muscles);
      if (!explicit && !found) errors.push(`«${name}» katalogda yok, kaslarını elle seçmelisin`);
      const metric = (METRICS as readonly string[]).includes(raw?.metric ?? "")
        ? (raw!.metric as ExerciseMetric)
        : (METRICS as readonly string[]).includes(found?.metric ?? "")
          ? (found!.metric as ExerciseMetric)
          : "reps";
      return {
        name,
        muscles,
        targetSets: intIn(raw?.targetSets, 1, 20, found?.defaultSets ?? 3),
        targetReps: intIn(raw?.targetReps, 1, 600, found?.defaultReps ?? 10),
        targetRIR: raw?.targetRIR === null || raw?.targetRIR === undefined ? null : intIn(raw.targetRIR, 0, 10, 0),
        metric,
      };
    });
    const fallbackTitle = opts.mode === "weekly" && i < WEEKLY_DAY_COUNT ? WEEKDAY_TITLES_TR[i] : `${i + 1}. Gün`;
    return {
      id: finalIds[i],
      order: i + 1,
      title: String(day?.title ?? "").trim().slice(0, 60) || fallbackTitle,
      focus: String(day?.focus ?? "").trim().slice(0, 60),
      kind,
      exercises,
      run: normalizeCardio(day?.run),
      swim: normalizeCardio(day?.swim),
    };
  });

  return { days: out, errors };
}
