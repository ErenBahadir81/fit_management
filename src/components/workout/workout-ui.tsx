"use client";

import {
  Dumbbell,
  Footprints,
  Waves,
  StretchHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { DayKind, ExerciseMetric, SetEntryDTO } from "@/lib/types";

/* ---------------------------------------------------------------------------
 * Gün türü -> ikon eşlemesi (WeekStrip, TodayCard, ProgramPage ortak kullanır).
 *   run -> Footprints, swim -> Waves, stretch -> StretchHorizontal, else Dumbbell
 * ------------------------------------------------------------------------- */
export function kindIcon(kind: DayKind): LucideIcon {
  switch (kind) {
    case "run":
      return Footprints;
    case "swim":
      return Waves;
    case "stretch":
      return StretchHorizontal;
    default:
      return Dumbbell;
  }
}

/* ---------------------------------------------------------------------------
 * Metrik yardımcıları — birim etiketleri ve özetler tek yerden gelir.
 * ------------------------------------------------------------------------- */

/** Set değerinin birimi: reps -> "tkr", time -> "sn", stretch -> "" */
export function metricUnit(metric: ExerciseMetric): string {
  return metric === "time" ? "sn" : metric === "stretch" ? "" : "tkr";
}

/** Hedef rozet metni (LogSheet / TodayCard). */
export function targetLabel(
  metric: ExerciseMetric,
  sets: number,
  reps: number
): string {
  if (metric === "stretch") return "Esneme / Mobilite";
  if (metric === "time") return `Hedef ${sets}×${reps} sn`;
  return `Hedef ${sets}×${reps}`;
}

/**
 * Bir esneme hareketinin "yapıldı" durumunu setlerden türetir.
 * Yapıldı => set var ve atlanmamış. Atlandı => skipped.
 */
export function stretchDone(skipped: boolean, sets: { reps: number }[]): boolean {
  return !skipped && sets.length > 0;
}

/**
 * Tamamlanmış bir hareketin set özetini metrik-doğru üretir (TodayCard).
 *   reps    -> "5 set · 10·10·10 tkr"
 *   time    -> "5 set · 30·30·30 sn"
 *   stretch -> "Yapıldı"
 */
export function setsSummary(
  metric: ExerciseMetric,
  sets: SetEntryDTO[]
): string {
  if (metric === "stretch") return sets.length > 0 ? "Yapıldı" : "Atlandı";
  const unit = metricUnit(metric);
  const vals = sets.map((s) => s.reps).join("·");
  return `${sets.length} set · ${vals} ${unit}`;
}
