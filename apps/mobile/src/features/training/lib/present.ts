/**
 * Presentation maths for the training screens — pure, so the screens stay declarative and the
 * status/tone decisions are tested once instead of being re-derived in every component.
 */
import {
  WEEKDAYS_TR_SHORT,
  clamp,
  daysBetween,
  keyWeekday,
  round,
  shiftKey,
  weekKeyFor,
  weekRange,
  type DayDTO,
  type MuscleReadiness,
  type MuscleVolume,
  type RecoveryStatus,
  type ScheduleEntry,
  type Weekday,
  type WorkoutLogDTO,
} from "@fitfloow/core";
import { fmtDate, fmtInt, fmtNumber } from "../../../lib/format";
import type { Tone } from "../../../theme/tokens";

/* ------------------------------- week strip ------------------------------- */

export interface StripItem {
  dateKey: string;
  /** "Pzt" … */
  label: string;
  dayNumber: number;
  status: ScheduleEntry["status"];
  tone: Tone;
  isToday: boolean;
  selected: boolean;
  title: string | null;
  kind: DayDTO["kind"] | null;
  a11y: string;
}

export const STATUS_TR: Record<ScheduleEntry["status"], string> = {
  done: "Tamamlandı",
  skipped: "Atlandı",
  today: "Bugün",
  upcoming: "Planlı",
  past: "Kayıt yok",
};

const STATUS_TONE: Record<ScheduleEntry["status"], Tone> = {
  done: "success",
  skipped: "warning",
  today: "primary",
  upcoming: "neutral",
  past: "neutral",
};

/** 7 pills: weekday, day number, status dot tone. Today is the selected one. */
export function stripItems(schedule: readonly ScheduleEntry[]): StripItem[] {
  return (schedule ?? []).map((e) => {
    const dayNumber = Number(e.dateKey.slice(8, 10));
    return {
      dateKey: e.dateKey,
      label: WEEKDAYS_TR_SHORT[(e.weekday ?? keyWeekday(e.dateKey)) as Weekday],
      dayNumber,
      status: e.status,
      tone: STATUS_TONE[e.status],
      isToday: e.isToday,
      selected: e.isToday,
      title: e.day?.title ?? null,
      kind: e.day?.kind ?? null,
      a11y: `${fmtDate(e.dateKey)}${e.day ? `, ${e.day.title}` : ""}, ${STATUS_TR[e.status]}`,
    };
  });
}

/* ----------------------------- weekly volume ------------------------------ */

export interface VolumeBar {
  key: string;
  name: string;
  done: number;
  max: number;
  min: number;
  /** 0..1 against the max target. */
  value: number;
  status: MuscleVolume["status"];
  tone: Tone;
  label: string;
}

export const VOLUME_TR: Record<MuscleVolume["status"], string> = {
  under: "Az",
  in: "Yeterli",
  over: "Fazla",
  none: "Yok",
};

const VOLUME_TONE: Record<MuscleVolume["status"], Tone> = {
  under: "primary",
  in: "success",
  over: "warning",
  none: "neutral",
};

/** Mini-bars: sets done vs the weekly target, busiest first. */
export function volumeBars(volume: readonly MuscleVolume[]): VolumeBar[] {
  return (volume ?? [])
    .map((v) => ({
      key: v.key,
      name: v.name,
      done: v.done,
      max: v.target.max,
      min: v.target.min ?? 0,
      value: v.target.max > 0 ? clamp(v.done / v.target.max, 0, 1) : 0,
      status: v.status,
      tone: VOLUME_TONE[v.status],
      label: VOLUME_TR[v.status],
    }))
    .sort((a, b) => b.done - a.done || a.name.localeCompare(b.name, "tr"));
}

/* -------------------------------- history --------------------------------- */

export interface WeekSection {
  weekKey: string;
  title: string;
  count: number;
  logs: WorkoutLogDTO[];
}

/** "Bu hafta" / "Geçen hafta" / "17–23 Ağustos". */
export function weekLabel(weekKey: string, currentWeekKey: string): string {
  const diff = daysBetween(currentWeekKey, weekKey);
  if (diff === 0) return "Bu hafta";
  if (diff === -7) return "Geçen hafta";
  const { endKey } = weekRange(weekKey);
  const startDay = Number(weekKey.slice(8, 10));
  return `${startDay}–${fmtDate(endKey)}`;
}

/** Newest-first sections aligned to the user's measurement day. */
export function groupLogsByWeek(logs: readonly WorkoutLogDTO[], measurementDay: Weekday, todayKey: string): WeekSection[] {
  const current = weekKeyFor(todayKey, measurementDay);
  const map = new Map<string, WorkoutLogDTO[]>();
  for (const log of [...(logs ?? [])].sort((a, b) => (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0))) {
    const wk = weekKeyFor(log.dateKey, measurementDay);
    const list = map.get(wk);
    if (list) list.push(log);
    else map.set(wk, [log]);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([weekKey, list]) => ({ weekKey, title: weekLabel(weekKey, current), count: list.filter((l) => !l.isOffDay).length, logs: list }));
}

export interface LogSummary {
  sets: number;
  reps: number;
  /** Σ reps × kg. `0` for bodyweight days and for logs written before loads existed (C1). */
  tonnageKg: number;
  muscles: { key: string; sets: number }[];
  duration: number | null;
  km: number;
  min: number;
  pace: number | null;
  isOffDay: boolean;
}

/**
 * One logged set as it comes back from the API. `weightKg` is optional here on purpose: pre-2.1
 * logs simply do not carry it, and a missing load is bodyweight/unknown, never zero kilos (C1).
 */
export interface LoggedSet {
  reps: number;
  rir: number | null;
  weightKg?: number | null;
}

/** Everything a history row / detail sheet shows about one log. */
export function logSummary(log: WorkoutLogDTO): LogSummary {
  const muscles = new Map<string, number>();
  let sets = 0;
  let reps = 0;
  let tonnageKg = 0;
  for (const e of log.strength ?? []) {
    if (e.skipped) continue;
    sets += e.sets.length;
    for (const s of e.sets as readonly LoggedSet[]) {
      reps += s.reps;
      if (typeof s.weightKg === "number") tonnageKg += s.reps * s.weightKg;
    }
    for (const m of e.muscles) muscles.set(m.key, round((muscles.get(m.key) ?? 0) + e.sets.length * m.load, 1));
  }
  const km = round((log.run?.totalKm ?? 0) + (log.swim?.totalKm ?? 0), 2);
  const min = round((log.run?.totalMin ?? 0) + (log.swim?.totalMin ?? 0), 1);
  return {
    sets,
    reps,
    tonnageKg: round(tonnageKg, 1),
    muscles: [...muscles.entries()].map(([key, s]) => ({ key, sets: s })).sort((a, b) => b.sets - a.sets),
    duration: log.durationMin,
    km,
    min,
    pace: km > 0 && min > 0 ? round(min / km, 2) : null,
    isOffDay: log.isOffDay,
  };
}

/* ---------------------- "how did that go vs last time" --------------------- */

/** The newest earlier session of the same cycle day. Off-days never count as a comparison. */
export function findLastSameDay(logs: readonly WorkoutLogDTO[], dayOrder: number, exceptDateKey: string): WorkoutLogDTO | null {
  return (
    [...(logs ?? [])]
      .filter((l) => !l.isOffDay && l.dayOrder === dayOrder && l.dateKey < exceptDateKey)
      .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))[0] ?? null
  );
}

export interface SessionCompare {
  /** The session compared against, or `null` the first time this cycle day is logged. */
  previousDateKey: string | null;
  previousTonnageKg: number;
  previousSets: number;
  deltaKg: number;
  deltaSets: number;
  /** One plain sentence. Never a verdict — it reports, it does not grade. */
  summaryTr: string;
}

/** Today's session against the last time this cycle day came round. */
export function compareToLast(current: { tonnageKg: number; sets: number }, previous: WorkoutLogDTO | null): SessionCompare {
  if (!previous) {
    return { previousDateKey: null, previousTonnageKg: 0, previousSets: 0, deltaKg: 0, deltaSets: 0, summaryTr: "Bu günün ilk kaydı — bundan sonrası buna göre ölçülecek." };
  }
  const before = logSummary(previous);
  const deltaKg = round(current.tonnageKg - before.tonnageKg, 1);
  const deltaSets = current.sets - before.sets;
  const lifted = current.tonnageKg > 0 || before.tonnageKg > 0;

  let summaryTr: string;
  if (lifted && Math.abs(deltaKg) >= 0.5) {
    summaryTr = deltaKg > 0 ? `Geçen seferden ${fmtInt(deltaKg)} kg fazla kaldırdın.` : `Geçen seferin ${fmtInt(-deltaKg)} kg altında kaldın.`;
  } else if (lifted) {
    summaryTr = `Geçen seferle aynı hacim: ${fmtInt(current.tonnageKg)} kg.`;
  } else if (deltaSets === 0) {
    summaryTr = `Geçen seferle aynı: ${current.sets} set.`;
  } else {
    summaryTr = deltaSets > 0 ? `Geçen seferden ${deltaSets} set fazla.` : `Geçen seferden ${-deltaSets} set az.`;
  }

  return { previousDateKey: previous.dateKey, previousTonnageKg: before.tonnageKg, previousSets: before.sets, deltaKg, deltaSets, summaryTr };
}

/** What the API's `training.lastPerformance(name)` hands back (C1). */
export interface LastPerformance {
  dateKey: string | null;
  sets: readonly LoggedSet[];
}

/**
 * "60 kg × 8, 8, 6" — the one line above the active set that says what to beat.
 * Falls back to per-set loads when they varied, and to bare reps for bodyweight work.
 */
export function lastPerformanceLabel(perf: LastPerformance | null | undefined): string | null {
  const sets = perf?.sets ?? [];
  if (sets.length === 0) return null;
  const loads = sets.map((s) => (typeof s.weightKg === "number" ? s.weightKg : null));
  if (loads.every((w) => w === null)) return `${sets.map((s) => fmtNumber(s.reps, 0)).join(", ")} tekrar`;
  const first = loads[0];
  if (first !== null && loads.every((w) => w === first)) return `${fmtNumber(first, first % 1 === 0 ? 0 : 1)} kg × ${sets.map((s) => fmtNumber(s.reps, 0)).join(", ")}`;
  return `${sets.map((s, i) => `${loads[i] === null ? "—" : fmtNumber(loads[i], loads[i]! % 1 === 0 ? 0 : 1)}×${fmtNumber(s.reps, 0)}`).join(", ")} kg`;
}

/* ------------------------------- program day ------------------------------ */

export interface DayCounts {
  exercises: number;
  sets: number;
  km: number;
  min: number;
  /** Rough session length: 2.6 min per set, or the cardio target. */
  estimateMin: number;
}

export function dayCounts(day: DayDTO | null | undefined): DayCounts {
  if (!day) return { exercises: 0, sets: 0, km: 0, min: 0, estimateMin: 0 };
  const sets = day.exercises.reduce((a, e) => a + e.targetSets, 0);
  const km = round((day.run?.targetKm ?? 0) + (day.swim?.targetKm ?? 0), 2);
  const min = round((day.run?.targetMin ?? 0) + (day.swim?.targetMin ?? 0), 1);
  return { exercises: day.exercises.length, sets, km, min, estimateMin: min > 0 ? Math.round(min) : Math.round(sets * 2.6) };
}

/* -------------------------------- recovery -------------------------------- */

export const RECOVERY_TR: Record<RecoveryStatus, { label: string; tone: Tone }> = {
  ready: { label: "Hazır", tone: "success" },
  recovering: { label: "Toparlanıyor", tone: "warning" },
  fatigued: { label: "Yorgun", tone: "danger" },
};

/**
 * The 0 → 70 → 100 recovery curve (same piecewise shape as `recoveredFraction` in core), sampled
 * across the muscle's full-recovery window for the detail sheet's sparkline.
 */
export function recoveryCurve(muscle: MuscleReadiness, samples = 13): number[] {
  if (muscle.lastTrainedAt === null || muscle.hoursSince === null) return [100, 100];
  const n = Math.max(2, samples);
  return Array.from({ length: n }, (_, i) => {
    const f = i / (n - 1);
    return round(100 * (f < 0.5 ? f * 1.4 : 0.7 + (f - 0.5) * 0.6), 1);
  });
}

/** Where "now" sits on that curve (0..1) — used to place the marker. */
export function recoveryPosition(muscle: MuscleReadiness): number {
  if (muscle.hoursSince === null || !(muscle.fullRecoveryHours > 0)) return 1;
  return clamp(muscle.hoursSince / muscle.fullRecoveryHours, 0, 1);
}

/** "6 sa sonra hazır" / "Hazır". */
export function hoursToFullLabel(muscle: MuscleReadiness): string {
  if (muscle.status === "ready" || muscle.hoursToFull === null || muscle.hoursToFull <= 0) return "Hazır";
  const h = Math.ceil(muscle.hoursToFull);
  return h >= 24 ? `${Math.round(h / 24)} gün sonra hazır` : `${h} sa sonra hazır`;
}

/** Dates of the next 7 cycle days for the "buradan devam et" sheet. */
export function jumpDates(todayKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftKey(todayKey, i));
}
