import { MuscleKey } from "./muscles";
import { Gender } from "./navy";

export type { Gender };
export type { MuscleKey };

export type DayKind = "strength" | "run" | "swim" | "stretch";

/** Hareketin ölçü birimi: tekrar / süre(sn) / esneme(mobilite). */
export type ExerciseMetric = "reps" | "time" | "stretch";

/** Kardiyo türü — koşu ve yüzme aynı metrikleri paylaşır. */
export type CardioDiscipline = "run" | "swim";

export interface ExerciseTargetDTO {
  name: string;
  muscles: MuscleKey[];
  targetSets: number;
  /** reps -> tekrar, time -> saniye, stretch -> kullanılmaz */
  targetReps: number;
  targetRIR: number | null;
  /** varsayılan "reps" (geriye uyumlu) */
  metric?: ExerciseMetric;
}

export interface RunTargetDTO {
  targetKm: number;
  targetMin: number;
  label?: string;
}
/** Koşu ve yüzme aynı hedef şeklini kullanır. */
export type CardioTargetDTO = RunTargetDTO;

export interface DayDTO {
  order: number; // 1..N
  title: string;
  focus: string;
  kind: DayKind;
  exercises: ExerciseTargetDTO[];
  run: RunTargetDTO | null;
  /** koşuyla aynı mantık; opsiyonel (eski kayıtlarda yok) */
  swim?: RunTargetDTO | null;
}

export interface ProgramDTO {
  id: string;
  name: string;
  days: DayDTO[];
  currentIndex: number; // 0..days.length-1 -> sıradaki yapılacak gün
  weekNumber: number;
}

export interface SetEntryDTO {
  /** reps -> tekrar, time -> saniye */
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
  /** varsayılan "reps" */
  metric?: ExerciseMetric;
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
export type CardioEntryDTO = RunEntryDTO;

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
  /** koşuyla aynı; opsiyonel (eski kayıtlarda yok) */
  swim?: RunEntryDTO | null;
}

export type UserRole = "admin" | "user";

export interface UserDTO {
  id: string;
  username: string;
  displayName: string;
  gender: Gender;
  heightCm: number | null;
  role: UserRole;
}

/** Yönetim paneli için — düz metin şifreyi de içerir (yalnız admin uçları döner). */
export interface UserAdminDTO extends UserDTO {
  password: string | null;
  createdAt: string;
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
