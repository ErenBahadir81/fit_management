import { MUSCLES, MUSCLE_ORDER, MuscleKey } from "@/lib/muscles";

/**
 * YORGUNLUK / YENİLENME SERVİSİ
 * --------------------------------------------------------------------------
 * Tek doğruluk kaynağı: WorkoutLog kayıtları. Program işaretçisinden (currentIndex)
 * tamamen bağımsızdır — hangi gün "sıradaki" olursa olsun, yorgunluk sadece
 * GERÇEKTEN loglanmış hareketlerden, kendi kasları ve kendi saatleriyle hesaplanır.
 *
 * Yenilenme eğrisi (kullanıcı spesifikasyonu):
 *   antrenmandan hemen sonra %0 → yarı sürede %70 → tam sürede %100
 *   küçük kas: tam = 48s  (24s'te %70, 48s'te %100)
 *   büyük kas: tam = 24s  (12s'te %70, 24s'te %100)
 */

const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;

export function recoveredFraction(elapsedHours: number, fullHours: number): number {
  if (elapsedHours <= 0) return 0;
  const half = fullHours / 2;
  if (elapsedHours <= half) return 0.7 * (elapsedHours / half);
  if (elapsedHours <= fullHours) return 0.7 + 0.3 * ((elapsedHours - half) / half);
  return 1;
}

export type RecoveryStatus = "fatigued" | "recovering" | "ready";

export interface MuscleHit {
  muscle: MuscleKey;
  sets: number;
  at: number; // ms epoch
}

export interface MuscleReadiness {
  key: MuscleKey;
  name: string;
  size: "large" | "small";
  fullRecoveryHours: number;
  readiness: number; // 0..100 (taze = 100)
  status: RecoveryStatus;
  lastTrainedAt: number | null;
  hoursSince: number | null;
  hoursToFull: number | null;
  residualSets: number;
  weeklySets: number;
  weeklyTarget: { min?: number; max: number };
}

export function statusOf(readiness: number): RecoveryStatus {
  if (readiness < 40) return "fatigued";
  if (readiness < 85) return "recovering";
  return "ready";
}

export function statusColor(status: RecoveryStatus): string {
  return status === "ready"
    ? "var(--ready)"
    : status === "recovering"
      ? "var(--recovering)"
      : "var(--fatigued)";
}

export function statusLabel(status: RecoveryStatus): string {
  return status === "ready" ? "Hazır" : status === "recovering" ? "Yenileniyor" : "Yorgun";
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/** Düşük seviye: hit listesinden her kas için hazırlık hesaplar. */
export function computeReadiness(
  hits: MuscleHit[],
  now: number = Date.now()
): Record<MuscleKey, MuscleReadiness> {
  const byMuscle: Record<string, MuscleHit[]> = {};
  for (const h of hits) (byMuscle[h.muscle] ??= []).push(h);

  const out = {} as Record<MuscleKey, MuscleReadiness>;

  for (const key of MUSCLE_ORDER) {
    const cfg = MUSCLES[key];
    const list = (byMuscle[key] ?? []).filter((h) => h.at <= now);

    const weeklySets = list
      .filter((h) => now - h.at <= WEEK)
      .reduce((s, h) => s + h.sets, 0);

    let residual = 0;
    let reference = 0;
    let lastTrainedAt: number | null = null;

    for (const h of list) {
      if (lastTrainedAt === null || h.at > lastTrainedAt) lastTrainedAt = h.at;
      const elapsed = (now - h.at) / HOUR;
      if (elapsed >= cfg.fullRecoveryHours) continue; // tamamen yenilenmiş → katkı yok
      const remaining = 1 - recoveredFraction(elapsed, cfg.fullRecoveryHours);
      if (remaining <= 0) continue;
      residual += h.sets * remaining;
      // referans = HÂLÂ yorgunluk veren en ağır seans (yenilenmiş seanslar şişirmez)
      reference = Math.max(reference, h.sets);
    }

    const readiness =
      reference <= 0 ? 100 : Math.round(100 * (1 - clamp01(residual / reference)));

    const hoursSince = lastTrainedAt != null ? (now - lastTrainedAt) / HOUR : null;
    const hoursToFull =
      lastTrainedAt != null
        ? Math.max(0, cfg.fullRecoveryHours - (now - lastTrainedAt) / HOUR)
        : null;

    out[key] = {
      key,
      name: cfg.name,
      size: cfg.size,
      fullRecoveryHours: cfg.fullRecoveryHours,
      readiness,
      status: statusOf(readiness),
      lastTrainedAt,
      hoursSince,
      hoursToFull,
      residualSets: Math.round(residual * 10) / 10,
      weeklySets,
      weeklyTarget: cfg.weeklyTarget,
    };
  }

  return out;
}

/* ----------------------- loglardan hit çıkarımı ------------------------ */

export interface WorkoutLogLike {
  date: string | number | Date;
  isOffDay?: boolean;
  strength?: Array<{
    muscles?: string[];
    skipped?: boolean;
    sets?: unknown[];
  }>;
}

/**
 * WorkoutLog kayıtlarından hit listesi üretir.
 * - off-day kayıtları atlanır
 * - skipped hareketler atlanır
 * - set sayısı = GERÇEKTEN yapılan set adedi (sets.length). plannedSets fallback YOK.
 * - her hareketin KENDİ kasları kullanılır (işaretçi/sıradaki gün ASLA karışmaz)
 */
export function buildHits(logs: WorkoutLogLike[]): MuscleHit[] {
  const hits: MuscleHit[] = [];
  for (const log of logs) {
    if (log?.isOffDay) continue;
    const at = new Date(log.date).getTime();
    if (!Number.isFinite(at)) continue;
    for (const e of log.strength ?? []) {
      if (e?.skipped) continue;
      const sets = Array.isArray(e?.sets) ? e!.sets!.length : 0;
      if (sets <= 0) continue;
      for (const m of e?.muscles ?? []) {
        if ((MUSCLES as Record<string, unknown>)[m]) {
          hits.push({ muscle: m as MuscleKey, sets, at });
        }
      }
    }
  }
  return hits;
}

/** Yüksek seviye: ham loglardan MUSCLE_ORDER sırasıyla hazırlık listesi. */
export function readinessFromLogs(
  logs: WorkoutLogLike[],
  now: number = Date.now()
): MuscleReadiness[] {
  const r = computeReadiness(buildHits(logs), now);
  return MUSCLE_ORDER.map((k) => r[k]);
}
