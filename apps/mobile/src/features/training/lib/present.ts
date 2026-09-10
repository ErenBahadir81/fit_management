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
import { fmtDate } from "../../../lib/format";
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
  muscles: { key: string; sets: number }[];
  duration: number | null;
  km: number;
  min: number;
  pace: number | null;
  isOffDay: boolean;
}

/** Everything a history row / detail sheet shows about one log. */
export function logSummary(log: WorkoutLogDTO): LogSummary {
  const muscles = new Map<string, number>();
  let sets = 0;
  let reps = 0;
  for (const e of log.strength ?? []) {
    if (e.skipped) continue;
    sets += e.sets.length;
    for (const s of e.sets) reps += s.reps;
    for (const m of e.muscles) muscles.set(m.key, round((muscles.get(m.key) ?? 0) + e.sets.length * m.load, 1));
  }
  const km = round((log.run?.totalKm ?? 0) + (log.swim?.totalKm ?? 0), 2);
  const min = round((log.run?.totalMin ?? 0) + (log.swim?.totalMin ?? 0), 1);
  return {
    sets,
    reps,
    muscles: [...muscles.entries()].map(([key, s]) => ({ key, sets: s })).sort((a, b) => b.sets - a.sets),
    duration: log.durationMin,
    km,
    min,
    pace: km > 0 && min > 0 ? round(min / km, 2) : null,
    isOffDay: log.isOffDay,
  };
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
