import type {
  DayDTO,
  DayKind,
  ExerciseTargetDTO,
  ProgramDTO,
  RunEntryDTO,
  RunSegmentDTO,
  RunTargetDTO,
  SetEntryDTO,
  StrengthEntryDTO,
  WorkoutLogDTO,
} from "@/lib/types";
import { MUSCLE_ORDER, MuscleKey } from "@/lib/muscles";
import { clamp } from "@/lib/utils";

const MUSCLE_SET = new Set<MuscleKey>(MUSCLE_ORDER);

function toFiniteNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toIntInRange(v: unknown, min: number, max: number, fallback: number) {
  const n = Math.round(toFiniteNumber(v, fallback));
  return clamp(n, min, max);
}

function sanitizeMuscles(input: unknown): MuscleKey[] {
  if (!Array.isArray(input)) return [];
  const out: MuscleKey[] = [];
  for (const raw of input) {
    if (typeof raw === "string" && MUSCLE_SET.has(raw as MuscleKey)) {
      out.push(raw as MuscleKey);
    }
  }
  return out;
}

function sanitizeRIR(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return clamp(Math.round(n), 0, 10);
}

function sanitizeKind(v: unknown): DayKind {
  return v === "run" ? "run" : "strength";
}

function sanitizeExercise(raw: any): ExerciseTargetDTO {
  return {
    name: String(raw?.name ?? "").slice(0, 80) || "Hareket",
    muscles: sanitizeMuscles(raw?.muscles),
    targetSets: toIntInRange(raw?.targetSets, 1, 30, 3),
    targetReps: toIntInRange(raw?.targetReps, 1, 100, 10),
    targetRIR: sanitizeRIR(raw?.targetRIR),
  };
}

function sanitizeRunTarget(raw: any): RunTargetDTO | null {
  if (!raw) return null;
  return {
    targetKm: clamp(toFiniteNumber(raw?.targetKm, 0), 0, 200),
    targetMin: clamp(toFiniteNumber(raw?.targetMin, 0), 0, 1000),
    label: typeof raw?.label === "string" ? raw.label.slice(0, 40) : undefined,
  };
}

/** Bir günü tamamen temizler; order = dayIndex + 1 olur. */
export function sanitizeDay(raw: any, dayIndex: number): DayDTO {
  const kind = sanitizeKind(raw?.kind);
  const exercises = Array.isArray(raw?.exercises)
    ? raw.exercises.slice(0, 20).map(sanitizeExercise)
    : [];
  return {
    order: dayIndex + 1,
    title: String(raw?.title ?? "").slice(0, 60) || `${dayIndex + 1}. Gün`,
    focus: String(raw?.focus ?? "").slice(0, 60),
    kind,
    exercises,
    run: sanitizeRunTarget(raw?.run),
  };
}

/* --------------------------- log sanitization --------------------------- */

export function sanitizeSets(raw: unknown): SetEntryDTO[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 40).map((s: any) => ({
    reps: toIntInRange(s?.reps, 1, 1000, 1),
    rir: sanitizeRIR(s?.rir),
  }));
}

/**
 * Loglanan hareketleri temizler. Her hareket kendine yeter:
 * - source: 'planned' (programdan) | 'extra' (o güne özel eklenen)
 * - skipped: true ise yorgunluğa SAYILMAZ ve setleri boş tutulur
 */
export function sanitizeStrengthEntries(raw: unknown): StrengthEntryDTO[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 40).map((e: any) => {
    const skipped = !!e?.skipped;
    return {
      name: String(e?.name ?? "").slice(0, 80) || "Hareket",
      muscles: sanitizeMuscles(e?.muscles),
      plannedSets: toIntInRange(e?.plannedSets, 0, 30, 0),
      plannedReps: toIntInRange(e?.plannedReps, 0, 100, 0),
      plannedRIR: sanitizeRIR(e?.plannedRIR),
      source: e?.source === "extra" ? "extra" : "planned",
      skipped,
      sets: skipped ? [] : sanitizeSets(e?.sets),
    };
  });
}

export function sanitizeSegments(raw: unknown): RunSegmentDTO[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 40).map((s: any) => ({
    km: clamp(toFiniteNumber(s?.km, 0), 0, 200),
    min: clamp(toFiniteNumber(s?.min, 0), 0, 1000),
  }));
}

/* ---------------------------- run progression --------------------------- */

/**
 * En iyi tempoya (dk/km) göre bir sonraki hafta hedefini hesaplar.
 *  bestPace = min(seg.min / seg.km)  (km > 0 olan segmentlerde)
 *  projected = round(bestPace * targetKm)
 *  newMin = clamp(projected, round(targetKm * 3), targetMin)
 */
export function progressedRunTargetMin(
  segments: RunSegmentDTO[],
  targetKm: number,
  targetMin: number
): number {
  let best = Infinity;
  for (const s of segments) {
    if (s.km > 0 && s.min > 0) best = Math.min(best, s.min / s.km);
  }
  if (!Number.isFinite(best) || targetKm <= 0) return targetMin;
  const projected = Math.round(best * targetKm);
  const floor = Math.round(targetKm * 3);
  return clamp(projected, floor, targetMin);
}

export function runTotals(segments: RunSegmentDTO[]): {
  totalKm: number;
  totalMin: number;
} {
  let totalKm = 0;
  let totalMin = 0;
  for (const s of segments) {
    totalKm += s.km;
    totalMin += s.min;
  }
  return {
    totalKm: Math.round(totalKm * 100) / 100,
    totalMin: Math.round(totalMin * 100) / 100,
  };
}

/** Loglanacak run nesnesini kurar (o güne özelse hedefler 0 olabilir). */
export function buildRunEntry(
  segments: RunSegmentDTO[],
  targetKm: number,
  targetMin: number
): RunEntryDTO | null {
  const ran = segments.some((s) => s.km > 0 || s.min > 0);
  if (!ran) return null;
  const { totalKm, totalMin } = runTotals(segments);
  return { segments, totalKm, totalMin, targetKm, targetMin };
}

/* ------------------------------ serializers ----------------------------- */

export function toProgramDTO(doc: any): ProgramDTO {
  const days: DayDTO[] = (doc.days ?? []).map((d: any, i: number) => ({
    order: typeof d.order === "number" ? d.order : i + 1,
    title: d.title ?? `${i + 1}. Gün`,
    focus: d.focus ?? "",
    kind: sanitizeKind(d.kind),
    exercises: (d.exercises ?? []).map((e: any) => ({
      name: e.name ?? "",
      muscles: sanitizeMuscles(e.muscles),
      targetSets: toFiniteNumber(e.targetSets, 0),
      targetReps: toFiniteNumber(e.targetReps, 0),
      targetRIR: e.targetRIR ?? null,
    })),
    run: d.run
      ? {
          targetKm: toFiniteNumber(d.run.targetKm, 0),
          targetMin: toFiniteNumber(d.run.targetMin, 0),
          label: d.run.label || undefined,
        }
      : null,
  }));

  return {
    id: String(doc._id),
    name: doc.name ?? "Program",
    days,
    currentIndex: toFiniteNumber(doc.currentIndex, 0),
    weekNumber: toFiniteNumber(doc.weekNumber, 1),
  };
}

export function toRunEntryDTO(run: any): RunEntryDTO | null {
  if (!run) return null;
  return {
    segments: (run.segments ?? []).map((s: any) => ({
      km: toFiniteNumber(s.km, 0),
      min: toFiniteNumber(s.min, 0),
    })),
    totalKm: toFiniteNumber(run.totalKm, 0),
    totalMin: toFiniteNumber(run.totalMin, 0),
    targetKm: toFiniteNumber(run.targetKm, 0),
    targetMin: toFiniteNumber(run.targetMin, 0),
  };
}

export function toWorkoutLogDTO(doc: any): WorkoutLogDTO {
  return {
    id: String(doc._id),
    date:
      doc.date instanceof Date
        ? doc.date.toISOString()
        : new Date(doc.date).toISOString(),
    dayOrder: toFiniteNumber(doc.dayOrder, 0),
    weekNumber: toFiniteNumber(doc.weekNumber, 1),
    title: doc.title ?? "",
    kind: sanitizeKind(doc.kind),
    isOffDay: !!doc.isOffDay,
    strength: (doc.strength ?? []).map((e: any) => ({
      name: e.name ?? "",
      muscles: sanitizeMuscles(e.muscles),
      plannedSets: toFiniteNumber(e.plannedSets, 0),
      plannedReps: toFiniteNumber(e.plannedReps, 0),
      plannedRIR: e.plannedRIR ?? null,
      source: e.source === "extra" ? "extra" : "planned",
      skipped: !!e.skipped,
      sets: (e.sets ?? []).map((s: any) => ({
        reps: toFiniteNumber(s.reps, 0),
        rir: s.rir ?? null,
      })),
    })),
    run: toRunEntryDTO(doc.run),
  };
}

/** [bugün 00:00, yarın 00:00) sınırları. */
export function dayBounds(d: Date): { start: Date; end: Date } {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start, end };
}
