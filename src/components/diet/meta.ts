import type { DietItemDTO } from "@/lib/types";

export type Meal = DietItemDTO["meal"];

export interface MealMeta {
  key: Meal;
  label: string;
  iconKey: "coffee" | "sun" | "moon" | "egg";
}

/** Öğün sırası ve Türkçe etiketleri */
export const MEALS: MealMeta[] = [
  { key: "breakfast", label: "Kahvaltı", iconKey: "coffee" },
  { key: "lunch", label: "Öğle", iconKey: "sun" },
  { key: "dinner", label: "Akşam", iconKey: "moon" },
  { key: "snack", label: "Atıştırma", iconKey: "egg" },
];

export interface Totals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type MacroKey = "protein" | "carbs" | "fat";

export interface MacroMeta {
  key: MacroKey;
  label: string;
  color: string;
}

/** Makro çubukları: Protein yeşil, Karbonhidrat amber, Yağ primary */
export const MACROS: MacroMeta[] = [
  { key: "protein", label: "Protein", color: "var(--ready)" },
  { key: "carbs", label: "Karbonhidrat", color: "var(--recovering)" },
  { key: "fat", label: "Yağ", color: "var(--primary)" },
];
