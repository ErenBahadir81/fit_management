import { DayDTO } from "./types";

/**
 * Eren'in örnek 7 günlük programı (kullanıcı notlarından birebir).
 * Haftalık set toplamları: Göğüs 17, Ön Omuz 9, Yan Omuz 6, Trapez 9,
 * Lats 10, Karın 6, Bacak 14 — matrisle birebir uyumlu.
 */
export const SEED_PROGRAM_DAYS: DayDTO[] = [
  {
    order: 1,
    title: "Push A",
    focus: "Göğüs & Yan Omuz",
    kind: "strength",
    exercises: [
      { name: "Push-up", muscles: ["chest", "frontDelt", "traps"], targetSets: 5, targetReps: 12, targetRIR: 2 },
      { name: "DB Fly", muscles: ["chest"], targetSets: 4, targetReps: 12, targetRIR: 2 },
      { name: "Lateral Raise", muscles: ["sideDelt"], targetSets: 3, targetReps: 15, targetRIR: 1 },
    ],
    run: null,
  },
  {
    order: 2,
    title: "Kondisyon",
    focus: "Lats & Karın",
    kind: "strength",
    exercises: [
      { name: "Pull-up", muscles: ["lats"], targetSets: 5, targetReps: 8, targetRIR: 2 },
      { name: "Leg Raises", muscles: ["abs"], targetSets: 3, targetReps: 15, targetRIR: 2 },
    ],
    run: { targetKm: 5, targetMin: 30, label: "Koşu" },
  },
  {
    order: 3,
    title: "Bacak",
    focus: "Quad & Hamstring",
    kind: "strength",
    exercises: [
      { name: "Squat", muscles: ["legs"], targetSets: 4, targetReps: 12, targetRIR: 2 },
      { name: "Lunge", muscles: ["legs"], targetSets: 3, targetReps: 12, targetRIR: 2 },
    ],
    run: null,
  },
  {
    order: 4,
    title: "Push B",
    focus: "Üst Göğüs & Yan Omuz",
    kind: "strength",
    exercises: [
      { name: "HSPU", muscles: ["chest", "frontDelt", "traps"], targetSets: 4, targetReps: 6, targetRIR: 2 },
      { name: "DB Fly", muscles: ["chest"], targetSets: 4, targetReps: 12, targetRIR: 2 },
      { name: "Lateral Raise", muscles: ["sideDelt"], targetSets: 3, targetReps: 15, targetRIR: 1 },
    ],
    run: null,
  },
  {
    order: 5,
    title: "Kondisyon",
    focus: "Lats & Karın",
    kind: "strength",
    exercises: [
      { name: "Pull-up", muscles: ["lats"], targetSets: 5, targetReps: 8, targetRIR: 2 },
      { name: "Leg Raises", muscles: ["abs"], targetSets: 3, targetReps: 15, targetRIR: 2 },
    ],
    run: { targetKm: 5, targetMin: 30, label: "Koşu" },
  },
  {
    order: 6,
    title: "Bacak",
    focus: "Quad & Hamstring",
    kind: "strength",
    exercises: [
      { name: "Squat", muscles: ["legs"], targetSets: 4, targetReps: 12, targetRIR: 2 },
      { name: "Lunge", muscles: ["legs"], targetSets: 3, targetReps: 12, targetRIR: 2 },
    ],
    run: null,
  },
  {
    order: 7,
    title: "Aktif Dinlenme",
    focus: "Sadece Koşu",
    kind: "run",
    exercises: [],
    run: { targetKm: 5, targetMin: 35, label: "Hafif Koşu" },
  },
];

/**
 * İnci'nin 4 günlük döngüsü. Sırasıyla: Squat → Handstand (süre) → Leg Raises → Stretch,
 * 4. günden sonra başa döner (değişken döngü uzunluğu = days.length).
 */
export const SEED_INCI_PROGRAM_DAYS: DayDTO[] = [
  {
    order: 1,
    title: "Squat",
    focus: "Bacak",
    kind: "strength",
    exercises: [
      { name: "Squat", muscles: ["legs"], targetSets: 5, targetReps: 10, targetRIR: 2, metric: "reps" },
    ],
    run: null,
  },
  {
    order: 2,
    title: "Handstand",
    focus: "Omuz & Denge",
    kind: "strength",
    exercises: [
      { name: "Handstand", muscles: ["frontDelt", "sideDelt", "traps"], targetSets: 5, targetReps: 30, targetRIR: null, metric: "time" },
    ],
    run: null,
  },
  {
    order: 3,
    title: "Leg Raises",
    focus: "Karın",
    kind: "strength",
    exercises: [
      { name: "Leg Raises", muscles: ["abs"], targetSets: 5, targetReps: 6, targetRIR: 2, metric: "reps" },
    ],
    run: null,
  },
  {
    order: 4,
    title: "Stretch",
    focus: "Esneklik",
    kind: "stretch",
    exercises: [
      { name: "Stretch", muscles: [], targetSets: 1, targetReps: 1, targetRIR: null, metric: "stretch" },
    ],
    run: null,
  },
];
