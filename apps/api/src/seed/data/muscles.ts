import type { MuscleDTO } from "@fitfloow/core";

/**
 * The 17 muscle groups of the 3.0 volume engine (T3 owns this list; T4 fills the exercise
 * activations against these keys). `weeklyTarget` is the app-wide recommended band (10–15
 * weekly effective sets) — the volume bands themselves are global, see `core/training/volumeBands`.
 * `legs` is the v1 catch-all: kept inactive so pre-3.0 logs still resolve, never used by exercises.
 */
const REC = { min: 10, max: 15 };

export const SEED_MUSCLES: MuscleDTO[] = [
  { key: "chest", name: "Göğüs", short: "Göğüs", size: "large", fullRecoveryHours: 24, weeklyTarget: REC, region: "front", color: "#EF6C6C", order: 0, active: true },
  { key: "frontDelt", name: "Ön Omuz", short: "Ön Omuz", size: "small", fullRecoveryHours: 48, weeklyTarget: REC, region: "front", color: "#F59E0B", order: 1, active: true },
  { key: "sideDelt", name: "Yan Omuz", short: "Yan Omuz", size: "small", fullRecoveryHours: 48, weeklyTarget: REC, region: "front", color: "#FBBF24", order: 2, active: true },
  { key: "rearDelt", name: "Arka Omuz", short: "Arka Omuz", size: "small", fullRecoveryHours: 48, weeklyTarget: REC, region: "back", color: "#FCD34D", order: 3, active: true },
  { key: "traps", name: "Trapez / Üst Sırt", short: "Trapez", size: "large", fullRecoveryHours: 24, weeklyTarget: REC, region: "back", color: "#8B7CFF", order: 4, active: true },
  { key: "lats", name: "Sırt (Lats)", short: "Lats", size: "large", fullRecoveryHours: 24, weeklyTarget: REC, region: "back", color: "#6D5DF6", order: 5, active: true },
  { key: "lowerBack", name: "Bel", short: "Bel", size: "small", fullRecoveryHours: 48, weeklyTarget: REC, region: "back", color: "#A78BFA", order: 6, active: true },
  { key: "biceps", name: "Biceps", short: "Biceps", size: "small", fullRecoveryHours: 48, weeklyTarget: REC, region: "arms", color: "#EC4899", order: 7, active: true },
  { key: "triceps", name: "Triceps", short: "Triceps", size: "small", fullRecoveryHours: 48, weeklyTarget: REC, region: "arms", color: "#F472B6", order: 8, active: true },
  { key: "forearms", name: "Ön Kol", short: "Ön Kol", size: "small", fullRecoveryHours: 48, weeklyTarget: REC, region: "arms", color: "#F9A8D4", order: 9, active: true },
  { key: "abs", name: "Karın", short: "Karın", size: "small", fullRecoveryHours: 48, weeklyTarget: REC, region: "core", color: "#0EA5E9", order: 10, active: true },
  { key: "obliques", name: "Oblik", short: "Oblik", size: "small", fullRecoveryHours: 48, weeklyTarget: REC, region: "core", color: "#38BDF8", order: 11, active: true },
  { key: "quads", name: "Ön Bacak (Quadriceps)", short: "Quad", size: "large", fullRecoveryHours: 24, weeklyTarget: REC, region: "legs", color: "#16A34A", order: 12, active: true },
  { key: "hamstrings", name: "Arka Bacak", short: "Hamstring", size: "large", fullRecoveryHours: 24, weeklyTarget: REC, region: "legs", color: "#4ADE80", order: 13, active: true },
  { key: "glutes", name: "Kalça", short: "Kalça", size: "large", fullRecoveryHours: 24, weeklyTarget: REC, region: "legs", color: "#22C55E", order: 14, active: true },
  { key: "adductors", name: "İç Bacak (Adduktör)", short: "Adduktör", size: "small", fullRecoveryHours: 48, weeklyTarget: REC, region: "legs", color: "#65A30D", order: 15, active: true },
  { key: "calves", name: "Baldır", short: "Baldır", size: "small", fullRecoveryHours: 48, weeklyTarget: REC, region: "legs", color: "#86EFAC", order: 16, active: true },
  { key: "legs", name: "Bacak (eski)", short: "Bacak", size: "large", fullRecoveryHours: 24, weeklyTarget: REC, region: "legs", color: "#15803D", order: 17, active: false },
];

/** Keys every 3.0 exercise may reference (the active 17). */
export const MUSCLE_KEYS_V3 = SEED_MUSCLES.filter((m) => m.active).map((m) => m.key);
