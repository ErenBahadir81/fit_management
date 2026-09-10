import type { MuscleDTO } from "@fitfloow/core";

/** v1 muscles (active) + optional extras (inactive until an admin enables them). */
export const SEED_MUSCLES: MuscleDTO[] = [
  { key: "chest", name: "Göğüs", short: "Göğüs", size: "large", fullRecoveryHours: 24, weeklyTarget: { min: 15, max: 20 }, region: "front", color: "#EF6C6C", order: 0, active: true },
  { key: "frontDelt", name: "Ön Omuz", short: "Ön Omuz", size: "small", fullRecoveryHours: 48, weeklyTarget: { max: 15 }, region: "front", color: "#F59E0B", order: 1, active: true },
  { key: "sideDelt", name: "Yan Omuz", short: "Yan Omuz", size: "small", fullRecoveryHours: 48, weeklyTarget: { max: 6 }, region: "front", color: "#FBBF24", order: 2, active: true },
  { key: "traps", name: "Trapez", short: "Trapez", size: "large", fullRecoveryHours: 24, weeklyTarget: { min: 5, max: 10 }, region: "back", color: "#8B7CFF", order: 3, active: true },
  { key: "lats", name: "Sırt (Lats)", short: "Lats", size: "large", fullRecoveryHours: 24, weeklyTarget: { min: 5, max: 10 }, region: "back", color: "#6D5DF6", order: 4, active: true },
  { key: "legs", name: "Bacak", short: "Bacak", size: "large", fullRecoveryHours: 24, weeklyTarget: { min: 10, max: 15 }, region: "legs", color: "#16A34A", order: 5, active: true },
  { key: "abs", name: "Karın", short: "Karın", size: "small", fullRecoveryHours: 48, weeklyTarget: { max: 6 }, region: "core", color: "#0EA5E9", order: 6, active: true },
  { key: "biceps", name: "Biceps", short: "Biceps", size: "small", fullRecoveryHours: 48, weeklyTarget: { min: 6, max: 12 }, region: "arms", color: "#EC4899", order: 7, active: false },
  { key: "triceps", name: "Triceps", short: "Triceps", size: "small", fullRecoveryHours: 48, weeklyTarget: { min: 6, max: 12 }, region: "arms", color: "#F472B6", order: 8, active: false },
  { key: "glutes", name: "Kalça", short: "Kalça", size: "large", fullRecoveryHours: 24, weeklyTarget: { min: 6, max: 12 }, region: "legs", color: "#22C55E", order: 9, active: false },
  { key: "hamstrings", name: "Arka Bacak", short: "Hamstring", size: "large", fullRecoveryHours: 24, weeklyTarget: { min: 6, max: 12 }, region: "legs", color: "#4ADE80", order: 10, active: false },
  { key: "calves", name: "Baldır", short: "Baldır", size: "small", fullRecoveryHours: 48, weeklyTarget: { min: 6, max: 12 }, region: "legs", color: "#86EFAC", order: 11, active: false },
  { key: "lowerBack", name: "Bel", short: "Bel", size: "small", fullRecoveryHours: 48, weeklyTarget: { max: 6 }, region: "back", color: "#A78BFA", order: 12, active: false },
  { key: "forearms", name: "Ön Kol", short: "Ön Kol", size: "small", fullRecoveryHours: 48, weeklyTarget: { max: 8 }, region: "arms", color: "#F9A8D4", order: 13, active: false },
];
