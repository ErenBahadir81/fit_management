import { MuscleKey } from "./muscles";
import { ExerciseMetric } from "./types";

export interface ExerciseDef {
  name: string;
  muscles: MuscleKey[];
  defaultSets: number;
  /** reps -> tekrar, time -> saniye */
  defaultReps: number;
  /** varsayılan "reps" */
  metric?: ExerciseMetric;
}

/**
 * Genel hareket kataloğu (tüm kullanıcılar için ortak — "geneller").
 * Her set, listelenen kasların hepsine tam yüklenir.
 * metric: "reps" tekrar, "time" saniye (handstand/plank), "stretch" mobilite (kas yükü yok).
 */
export const EXERCISE_CATALOG: ExerciseDef[] = [
  { name: "Push-up", muscles: ["chest", "frontDelt", "traps"], defaultSets: 5, defaultReps: 12 },
  { name: "HSPU", muscles: ["chest", "frontDelt", "traps"], defaultSets: 4, defaultReps: 6 },
  { name: "Pike Push-up", muscles: ["frontDelt", "chest", "traps"], defaultSets: 4, defaultReps: 8 },
  { name: "DB Fly", muscles: ["chest"], defaultSets: 4, defaultReps: 12 },
  { name: "Dips", muscles: ["chest", "frontDelt", "traps"], defaultSets: 4, defaultReps: 10 },
  { name: "Lateral Raise", muscles: ["sideDelt"], defaultSets: 3, defaultReps: 15 },
  { name: "Pull-up", muscles: ["lats"], defaultSets: 5, defaultReps: 8 },
  { name: "Row", muscles: ["lats", "traps"], defaultSets: 4, defaultReps: 10 },
  { name: "Shrug", muscles: ["traps"], defaultSets: 3, defaultReps: 15 },
  { name: "Leg Raises", muscles: ["abs"], defaultSets: 3, defaultReps: 15 },
  { name: "Squat", muscles: ["legs"], defaultSets: 4, defaultReps: 12 },
  { name: "Lunge", muscles: ["legs"], defaultSets: 3, defaultReps: 12 },
  { name: "Pistol Squat", muscles: ["legs"], defaultSets: 3, defaultReps: 8 },
  { name: "Calf Raise", muscles: ["legs"], defaultSets: 4, defaultReps: 20 },
  // Süre bazlı (saniye)
  { name: "Handstand", muscles: ["frontDelt", "sideDelt", "traps"], defaultSets: 5, defaultReps: 30, metric: "time" },
  { name: "Plank", muscles: ["abs"], defaultSets: 3, defaultReps: 45, metric: "time" },
  { name: "Hollow Hold", muscles: ["abs"], defaultSets: 3, defaultReps: 30, metric: "time" },
  { name: "Wall Sit", muscles: ["legs"], defaultSets: 3, defaultReps: 45, metric: "time" },
  // Esneme / mobilite (kas yükü yok)
  { name: "Stretch", muscles: [], defaultSets: 1, defaultReps: 1, metric: "stretch" },
  { name: "Mobility", muscles: [], defaultSets: 1, defaultReps: 1, metric: "stretch" },
];

export function findExercise(name: string): ExerciseDef | undefined {
  return EXERCISE_CATALOG.find(
    (e) => e.name.toLowerCase() === name.toLowerCase()
  );
}

export function metricOf(name: string): ExerciseMetric {
  return findExercise(name)?.metric ?? "reps";
}
