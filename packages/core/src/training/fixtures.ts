/**
 * Test-only fixtures for the training engines (not exported from `index.ts`).
 * `TEST_MUSCLES` mirrors the seeded v1 muscles and `EREN_DAYS` / `INCI_DAYS` mirror
 * `apps/api/src/seed/data/templates.ts`, so the ported v1 numbers can be asserted here.
 */
import type { DayDTO, MuscleDTO } from "../schemas/index";

export const TEST_MUSCLES: MuscleDTO[] = [
  { key: "chest", name: "Göğüs", short: "Göğüs", size: "large", fullRecoveryHours: 24, weeklyTarget: { min: 15, max: 20 }, region: "front", color: "#EF6C6C", order: 0, active: true },
  { key: "frontDelt", name: "Ön Omuz", short: "Ön Omuz", size: "small", fullRecoveryHours: 48, weeklyTarget: { max: 15 }, region: "front", color: "#F59E0B", order: 1, active: true },
  { key: "sideDelt", name: "Yan Omuz", short: "Yan Omuz", size: "small", fullRecoveryHours: 48, weeklyTarget: { max: 6 }, region: "front", color: "#FBBF24", order: 2, active: true },
  { key: "traps", name: "Trapez", short: "Trapez", size: "large", fullRecoveryHours: 24, weeklyTarget: { min: 5, max: 10 }, region: "back", color: "#8B7CFF", order: 3, active: true },
  { key: "lats", name: "Sırt (Lats)", short: "Lats", size: "large", fullRecoveryHours: 24, weeklyTarget: { min: 5, max: 10 }, region: "back", color: "#6D5DF6", order: 4, active: true },
  { key: "legs", name: "Bacak", short: "Bacak", size: "large", fullRecoveryHours: 24, weeklyTarget: { min: 10, max: 15 }, region: "legs", color: "#16A34A", order: 5, active: true },
  { key: "abs", name: "Karın", short: "Karın", size: "small", fullRecoveryHours: 48, weeklyTarget: { max: 6 }, region: "core", color: "#0EA5E9", order: 6, active: true },
];

export const muscle = (key: string): MuscleDTO => {
  const m = TEST_MUSCLES.find((x) => x.key === key);
  if (!m) throw new Error(`unknown fixture muscle ${key}`);
  return m;
};

const L = (keys: string[]) => keys.map((key) => ({ key, load: 1 }));

/** v1 seed program (Eren, 7-day cycle). */
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

/** v1 seed program (İnci, 4-day cycle) — includes a `stretch` metric exercise. */
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
