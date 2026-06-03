import { MuscleKey } from "./muscles";
import { Gender } from "./navy";

export type { Gender };
export type { MuscleKey };

export type DayKind = "strength" | "run";

export interface ExerciseTargetDTO {
  name: string;
  muscles: MuscleKey[];
  targetSets: number;
  targetReps: number;
  targetRIR: number | null;
}

export interface RunTargetDTO {
  targetKm: number;
  targetMin: number;
  label?: string;
}

export interface DayDTO {
  order: number; // 1..7
  title: string;
  focus: string;
  kind: DayKind;
  exercises: ExerciseTargetDTO[];
  run: RunTargetDTO | null;
}

export interface ProgramDTO {
  id: string;
  name: string;
  days: DayDTO[];
  currentIndex: number; // 0..6 -> sıradaki yapılacak gün
  weekNumber: number;
}

export interface SetEntryDTO {
  reps: number;
  rir: number | null;
}

export type ExerciseSource = "planned" | "extra";

export interface StrengthEntryDTO {
  name: string;
  muscles: MuscleKey[];
  plannedSets: number;
  plannedReps: number;
  plannedRIR: number | null;
  /** Programdan gelen mi yoksa o güne özel eklenen mi */
  source?: ExerciseSource;
  /** O gün bu hareket atlandıysa true (yorgunluğa sayılmaz) */
  skipped?: boolean;
  sets: SetEntryDTO[];
}

export interface RunSegmentDTO {
  km: number;
  min: number;
}

export interface RunEntryDTO {
  segments: RunSegmentDTO[];
  totalKm: number;
  totalMin: number;
  targetKm: number;
  targetMin: number;
}

export interface WorkoutLogDTO {
  id: string;
  date: string; // ISO
  dayOrder: number;
  weekNumber: number;
  title: string;
  kind: DayKind;
  isOffDay: boolean;
  strength: StrengthEntryDTO[];
  run: RunEntryDTO | null;
}

export interface UserDTO {
  id: string;
  username: string;
  displayName: string;
  gender: Gender;
  heightCm: number | null;
}

export interface BodyEntryDTO {
  id: string;
  date: string; // ISO
  gender: Gender;
  heightCm: number;
  neckCm: number;
  waistCm: number;
  hipCm: number | null;
  weightKg: number;
  bodyFatPct: number;
  fatMassKg: number;
  leanMassKg: number;
}

export interface DietItemDTO {
  name: string;
  qty: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meal: "breakfast" | "lunch" | "dinner" | "snack";
}

export interface DietTargetDTO {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DietLogDTO {
  dateKey: string; // YYYY-MM-DD
  items: DietItemDTO[];
}
