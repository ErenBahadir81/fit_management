import { MUSCLES, MUSCLE_ORDER, MuscleKey } from "./muscles";

/**
 * Yenilenme eğrisi.
 * Antrenmandan hemen sonra %0, yarı sürede %70, tam sürede %100.
 * small kas = 48s tam (=> 24s'te %70, 48s'te %100 — kullanıcı spesifikasyonu)
 * large kas = 24s tam (=> 12s'te %70, 24s'te %100)
 */
export function recoveredFraction(elapsedHours: number, fullHours: number): number {
  if (elapsedHours <= 0) return 0;
  const half = fullHours / 2;
  if (elapsedHours <= half) return 0.7 * (elapsedHours / half);
  if (elapsedHours <= fullHours) return 0.7 + 0.3 * ((elapsedHours - half) / half);
  return 1;
}

export interface MuscleHit {
  muscle: MuscleKey;
  sets: number;
  at: number; // ms epoch
}

export type RecoveryStatus = "fatigued" | "recovering" | "ready";

export interface MuscleReadiness {
  key: MuscleKey;
  name: string;
  size: "large" | "small";
  fullRecoveryHours: number;
  readiness: number; // 0..100 (taze = 100)
  status: RecoveryStatus;
  lastTrainedAt: number | null;
  hoursSince: number | null;
  /** önümüzdeki tam yenilenmeye kalan saat (yaklaşık) */
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

const HOUR = 3600_000;
const WEEK = 7 * 24 * HOUR;

export function computeReadiness(
  hits: MuscleHit[],
  now: number = Date.now()
): Record<MuscleKey, MuscleReadiness> {
  const byMuscle: Record<string, MuscleHit[]> = {};
  for (const h of hits) {
    (byMuscle[h.muscle] ??= []).push(h);
  }

  const out = {} as Record<MuscleKey, MuscleReadiness>;

  for (const key of MUSCLE_ORDER) {
    const cfg = MUSCLES[key];
    const list = (byMuscle[key] ?? []).filter((h) => h.at <= now);

    const weeklySets = list
      .filter((h) => now - h.at <= WEEK)
      .reduce((s, h) => s + h.sets, 0);

    // yenilenme penceresi: tam yenilenme süresi kadar geriye bak
    const windowHits = list.filter(
      (h) => (now - h.at) / HOUR <= cfg.fullRecoveryHours
    );

    let residual = 0;
    let reference = 0;
    for (const h of windowHits) {
      const elapsed = (now - h.at) / HOUR;
      const frac = recoveredFraction(elapsed, cfg.fullRecoveryHours);
      residual += h.sets * (1 - frac);
      reference = Math.max(reference, h.sets);
    }

    const readiness =
      reference <= 0 ? 100 : Math.round(100 * (1 - clamp01(residual / reference)));

    const lastTrainedAt = list.length
      ? Math.max(...list.map((h) => h.at))
      : null;
    const hoursSince =
      lastTrainedAt != null ? (now - lastTrainedAt) / HOUR : null;
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

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function statusColor(status: RecoveryStatus) {
  return status === "ready"
    ? "var(--ready)"
    : status === "recovering"
      ? "var(--recovering)"
      : "var(--fatigued)";
}

export function statusLabel(status: RecoveryStatus) {
  return status === "ready"
    ? "Hazır"
    : status === "recovering"
      ? "Yenileniyor"
      : "Yorgun";
}
