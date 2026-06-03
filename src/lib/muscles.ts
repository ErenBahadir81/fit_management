export type MuscleKey =
  | "chest"
  | "frontDelt"
  | "sideDelt"
  | "traps"
  | "lats"
  | "abs"
  | "legs";

export interface MuscleConfig {
  key: MuscleKey;
  name: string; // Türkçe görünen ad
  short: string; // kısa etiket
  size: "large" | "small";
  /** Tam yenilenme süresi (saat). small=48s, large=24s.
   *  Yenilenme yarı sürede %70'e, tam sürede %100'e ulaşır. */
  fullRecoveryHours: number;
  /** Haftalık set hedefi (matristen) */
  weeklyTarget: { min?: number; max: number };
  region: "front" | "back" | "legs" | "core";
}

export const MUSCLES: Record<MuscleKey, MuscleConfig> = {
  chest: {
    key: "chest",
    name: "Göğüs",
    short: "Göğüs",
    size: "large",
    fullRecoveryHours: 24,
    weeklyTarget: { min: 15, max: 20 },
    region: "front",
  },
  frontDelt: {
    key: "frontDelt",
    name: "Ön Omuz",
    short: "Ön Omuz",
    size: "small",
    fullRecoveryHours: 48,
    weeklyTarget: { max: 15 },
    region: "front",
  },
  sideDelt: {
    key: "sideDelt",
    name: "Yan Omuz",
    short: "Yan Omuz",
    size: "small",
    fullRecoveryHours: 48,
    weeklyTarget: { max: 6 },
    region: "front",
  },
  traps: {
    key: "traps",
    name: "Trapez",
    short: "Trapez",
    size: "large",
    fullRecoveryHours: 24,
    weeklyTarget: { min: 5, max: 10 },
    region: "back",
  },
  lats: {
    key: "lats",
    name: "Sırt (Lats)",
    short: "Lats",
    size: "large",
    fullRecoveryHours: 24,
    weeklyTarget: { min: 5, max: 10 },
    region: "back",
  },
  abs: {
    key: "abs",
    name: "Karın",
    short: "Karın",
    size: "small",
    fullRecoveryHours: 48,
    weeklyTarget: { max: 6 },
    region: "core",
  },
  legs: {
    key: "legs",
    name: "Bacak",
    short: "Bacak",
    size: "large",
    fullRecoveryHours: 24,
    weeklyTarget: { min: 10, max: 15 },
    region: "legs",
  },
};

export const MUSCLE_ORDER: MuscleKey[] = [
  "chest",
  "frontDelt",
  "sideDelt",
  "traps",
  "lats",
  "legs",
  "abs",
];

export function muscleName(key: MuscleKey) {
  return MUSCLES[key]?.name ?? key;
}
