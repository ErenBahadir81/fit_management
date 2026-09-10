import type { DayDTO, ProgramTemplateInput } from "@fitfloow/core";

const L = (keys: string[]) => keys.map((key) => ({ key, load: 1 }));

/** Eren's 7-day split (v1 SEED_PROGRAM_DAYS). Weekly sets: chest 17, frontDelt 9, sideDelt 6, traps 9, lats 10, abs 6, legs 14. */
export const EREN_DAYS: DayDTO[] = [
  { order: 1, title: "Push A", focus: "Göğüs & Yan Omuz", kind: "strength", exercises: [
      { name: "Push-up", muscles: L(["chest", "frontDelt", "traps"]), targetSets: 5, targetReps: 12, targetRIR: 2, metric: "reps" },
      { name: "DB Fly", muscles: L(["chest"]), targetSets: 4, targetReps: 12, targetRIR: 2, metric: "reps" },
      { name: "Lateral Raise", muscles: L(["sideDelt"]), targetSets: 3, targetReps: 15, targetRIR: 1, metric: "reps" },
    ], run: null, swim: null },
  { order: 2, title: "Kondisyon", focus: "Lats & Karın", kind: "strength", exercises: [
      { name: "Pull-up", muscles: L(["lats"]), targetSets: 5, targetReps: 8, targetRIR: 2, metric: "reps" },
      { name: "Leg Raises", muscles: L(["abs"]), targetSets: 3, targetReps: 15, targetRIR: 2, metric: "reps" },
    ], run: { targetKm: 5, targetMin: 30, label: "Koşu" }, swim: null },
  { order: 3, title: "Bacak", focus: "Quad & Hamstring", kind: "strength", exercises: [
      { name: "Squat", muscles: L(["legs"]), targetSets: 4, targetReps: 12, targetRIR: 2, metric: "reps" },
      { name: "Lunge", muscles: L(["legs"]), targetSets: 3, targetReps: 12, targetRIR: 2, metric: "reps" },
    ], run: null, swim: null },
  { order: 4, title: "Push B", focus: "Üst Göğüs & Yan Omuz", kind: "strength", exercises: [
      { name: "HSPU", muscles: L(["chest", "frontDelt", "traps"]), targetSets: 4, targetReps: 6, targetRIR: 2, metric: "reps" },
      { name: "DB Fly", muscles: L(["chest"]), targetSets: 4, targetReps: 12, targetRIR: 2, metric: "reps" },
      { name: "Lateral Raise", muscles: L(["sideDelt"]), targetSets: 3, targetReps: 15, targetRIR: 1, metric: "reps" },
    ], run: null, swim: null },
  { order: 5, title: "Kondisyon", focus: "Lats & Karın", kind: "strength", exercises: [
      { name: "Pull-up", muscles: L(["lats"]), targetSets: 5, targetReps: 8, targetRIR: 2, metric: "reps" },
      { name: "Leg Raises", muscles: L(["abs"]), targetSets: 3, targetReps: 15, targetRIR: 2, metric: "reps" },
    ], run: { targetKm: 5, targetMin: 30, label: "Koşu" }, swim: null },
  { order: 6, title: "Bacak", focus: "Quad & Hamstring", kind: "strength", exercises: [
      { name: "Squat", muscles: L(["legs"]), targetSets: 4, targetReps: 12, targetRIR: 2, metric: "reps" },
      { name: "Lunge", muscles: L(["legs"]), targetSets: 3, targetReps: 12, targetRIR: 2, metric: "reps" },
    ], run: null, swim: null },
  { order: 7, title: "Aktif Dinlenme", focus: "Sadece Koşu", kind: "run", exercises: [], run: { targetKm: 5, targetMin: 35, label: "Hafif Koşu" }, swim: null },
];

/** İnci's 4-day cycle (v1 SEED_INCI_PROGRAM_DAYS). */
export const INCI_DAYS: DayDTO[] = [
  { order: 1, title: "Squat", focus: "Bacak", kind: "strength", exercises: [
      { name: "Squat", muscles: L(["legs"]), targetSets: 5, targetReps: 10, targetRIR: 2, metric: "reps" },
    ], run: null, swim: null },
  { order: 2, title: "Handstand", focus: "Omuz & Denge", kind: "strength", exercises: [
      { name: "Handstand", muscles: L(["frontDelt", "sideDelt", "traps"]), targetSets: 5, targetReps: 30, targetRIR: null, metric: "time" },
    ], run: null, swim: null },
  { order: 3, title: "Leg Raises", focus: "Karın", kind: "strength", exercises: [
      { name: "Leg Raises", muscles: L(["abs"]), targetSets: 5, targetReps: 6, targetRIR: 2, metric: "reps" },
    ], run: null, swim: null },
  { order: 4, title: "Stretch", focus: "Esneklik", kind: "stretch", exercises: [
      { name: "Stretch", muscles: [], targetSets: 1, targetReps: 1, targetRIR: null, metric: "stretch" },
    ], run: null, swim: null },
];

export const SEED_TEMPLATES: ProgramTemplateInput[] = [
  { name: "7 Günlük Split (Eren)", description: "Push/Kondisyon/Bacak döngüsü, haftada 2 koşu.", days: EREN_DAYS, tags: ["calisthenics", "7-gün"] },
  { name: "4 Günlük Döngü (İnci)", description: "Squat → Handstand → Leg Raises → Stretch.", days: INCI_DAYS, tags: ["başlangıç", "4-gün"] },
];
