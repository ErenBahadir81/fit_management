import { exerciseNameKey, type DayDTO, type ExerciseTargetDTO, type ProgramTemplateInput } from "@fitfloow/core";
import { SEED_EXERCISES } from "./exercises";

const CATALOG = new Map(SEED_EXERCISES.map((e) => [exerciseNameKey(e.name), e]));

/**
 * A planned exercise whose muscles (and metric) come from the seed catalog by name, so templates
 * always carry the same activation values as the catalog. A name the catalog lacks is a bug here.
 */
function ex(name: string, targetSets: number, targetReps: number, targetRIR: number | null): ExerciseTargetDTO {
  const row = CATALOG.get(exerciseNameKey(name));
  if (!row) throw new Error(`seed templates: "${name}" is not in SEED_EXERCISES`);
  return { name: row.name, muscles: row.muscles.map((m) => ({ ...m })), targetSets, targetReps, targetRIR, metric: row.metric ?? "reps" };
}

/**
 * Eren's 7-day split (v1 SEED_PROGRAM_DAYS). Planned weekly effective sets with the v1 activation
 * loads: quads 15.1, front delt 14, chest 13.6, biceps 11.7, adductors 10, traps 9.8, side delt 9.6,
 * lats 9 — the rest lower (v1 counted every set in full: chest 17, legs 14).
 */
export const EREN_DAYS: DayDTO[] = [
  { id: "d1", order: 1, title: "Push A", focus: "Göğüs & Yan Omuz", kind: "strength", exercises: [
      ex("Push-up", 5, 12, 2),
      ex("DB Fly", 4, 12, 2),
      ex("Lateral Raise", 3, 15, 1),
    ], run: null, swim: null },
  { id: "d2", order: 2, title: "Kondisyon", focus: "Lats & Karın", kind: "strength", exercises: [
      ex("Pull-up", 5, 8, 2),
      ex("Leg Raises", 3, 15, 2),
    ], run: { targetKm: 5, targetMin: 30, label: "Koşu" }, swim: null },
  { id: "d3", order: 3, title: "Bacak", focus: "Quad & Hamstring", kind: "strength", exercises: [
      ex("Squat", 4, 12, 2),
      ex("Lunge", 3, 12, 2),
    ], run: null, swim: null },
  { id: "d4", order: 4, title: "Push B", focus: "Üst Göğüs & Yan Omuz", kind: "strength", exercises: [
      ex("HSPU", 4, 6, 2),
      ex("DB Fly", 4, 12, 2),
      ex("Lateral Raise", 3, 15, 1),
    ], run: null, swim: null },
  { id: "d5", order: 5, title: "Kondisyon", focus: "Lats & Karın", kind: "strength", exercises: [
      ex("Pull-up", 5, 8, 2),
      ex("Leg Raises", 3, 15, 2),
    ], run: { targetKm: 5, targetMin: 30, label: "Koşu" }, swim: null },
  { id: "d6", order: 6, title: "Bacak", focus: "Quad & Hamstring", kind: "strength", exercises: [
      ex("Squat", 4, 12, 2),
      ex("Lunge", 3, 12, 2),
    ], run: null, swim: null },
  { id: "d7", order: 7, title: "Aktif Dinlenme", focus: "Sadece Koşu", kind: "run", exercises: [], run: { targetKm: 5, targetMin: 35, label: "Hafif Koşu" }, swim: null },
];

/** İnci's 4-day cycle (v1 SEED_INCI_PROGRAM_DAYS). */
export const INCI_DAYS: DayDTO[] = [
  { id: "d1", order: 1, title: "Squat", focus: "Bacak", kind: "strength", exercises: [ex("Squat", 5, 10, 2)], run: null, swim: null },
  { id: "d2", order: 2, title: "Handstand", focus: "Omuz & Denge", kind: "strength", exercises: [ex("Handstand", 5, 30, null)], run: null, swim: null },
  { id: "d3", order: 3, title: "Leg Raises", focus: "Karın", kind: "strength", exercises: [ex("Leg Raises", 5, 6, 2)], run: null, swim: null },
  { id: "d4", order: 4, title: "Stretch", focus: "Esneklik", kind: "stretch", exercises: [ex("Stretch", 1, 1, null)], run: null, swim: null },
];

export const SEED_TEMPLATES: ProgramTemplateInput[] = [
  { name: "7 Günlük Split (Eren)", description: "Push/Kondisyon/Bacak döngüsü, haftada 2 koşu.", days: EREN_DAYS, tags: ["calisthenics", "7-gün"] },
  { name: "4 Günlük Döngü (İnci)", description: "Squat → Handstand → Leg Raises → Stretch.", days: INCI_DAYS, tags: ["başlangıç", "4-gün"] },
];
