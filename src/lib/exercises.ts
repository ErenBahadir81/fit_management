import { MuscleKey } from "./muscles";

export interface ExerciseDef {
  name: string;
  muscles: MuscleKey[];
  defaultSets: number;
  defaultReps: number;
}

/**
 * Hareket -> kas grubu eşlemesi. Her set, listelenen kasların hepsine tam yüklenir.
 * (Kullanıcının örnek programındaki haftalık set toplamları bu eşlemeyle birebir tutuyor.)
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
  { name: "Plank", muscles: ["abs"], defaultSets: 3, defaultReps: 1 },
  { name: "Squat", muscles: ["legs"], defaultSets: 4, defaultReps: 12 },
  { name: "Lunge", muscles: ["legs"], defaultSets: 3, defaultReps: 12 },
  { name: "Pistol Squat", muscles: ["legs"], defaultSets: 3, defaultReps: 8 },
  { name: "Calf Raise", muscles: ["legs"], defaultSets: 4, defaultReps: 20 },
];

export function findExercise(name: string): ExerciseDef | undefined {
  return EXERCISE_CATALOG.find(
    (e) => e.name.toLowerCase() === name.toLowerCase()
  );
}
