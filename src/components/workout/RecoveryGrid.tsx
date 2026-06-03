"use client";

import { Ring, Dot } from "@/components/ui";
import { statusColor, statusLabel, MuscleReadiness } from "@/lib/recovery";

function recoveryHint(m: MuscleReadiness): string {
  if (m.lastTrainedAt === null) return "Hiç çalışılmadı";
  if (m.status === "ready") return "Hazır";
  const h = m.hoursToFull ?? 0;
  if (h <= 0) return "Hazır";
  if (h < 1) return `~${Math.max(1, Math.round(h * 60))} dk kaldı`;
  return `~${Math.round(h)} sa kaldı`;
}

function trainedAgo(m: MuscleReadiness): string | null {
  if (m.hoursSince === null) return null;
  const h = m.hoursSince;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} dk önce`;
  if (h < 48) return `${Math.round(h)} sa önce`;
  return `${Math.round(h / 24)} gün önce`;
}

export function MuscleRingCard({ m }: { m: MuscleReadiness }) {
  const color = statusColor(m.status);
  const ago = trainedAgo(m);
  return (
    <div className="rounded-2xl bg-surface border border-border shadow-card p-3.5 flex flex-col items-center">
      <Ring value={m.readiness} size={88} stroke={9} color={color}>
        <span className="text-xl font-extrabold tabular-nums leading-none" style={{ color }}>
          {m.readiness}%
        </span>
      </Ring>

      <div className="mt-2.5 text-center w-full">
        <p className="font-bold leading-tight truncate">{m.name}</p>
        <div className="mt-1 inline-flex items-center gap-1.5">
          <Dot color={color} />
          <span className="text-[12px] font-semibold" style={{ color }}>
            {statusLabel(m.status)}
          </span>
        </div>
      </div>

      <div className="mt-2.5 w-full grid grid-cols-2 gap-1 pt-2.5 border-t border-border text-center">
        <div>
          <div className="text-[11px] text-muted font-medium">Bu hafta</div>
          <div className="text-[13px] font-bold tabular-nums">
            {m.weeklySets}/{m.weeklyTarget.max} set
          </div>
        </div>
        <div>
          <div className="text-[11px] text-muted font-medium">
            {m.status === "ready" ? "Durum" : "Yenilenme"}
          </div>
          <div className="text-[13px] font-bold tabular-nums truncate">
            {recoveryHint(m)}
          </div>
        </div>
      </div>

      {ago && (
        <p className="text-[10px] text-muted mt-1.5">Son: {ago}</p>
      )}
    </div>
  );
}

export function RecoveryGrid({ muscles }: { muscles: MuscleReadiness[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {muscles.map((m) => (
        <MuscleRingCard key={m.key} m={m} />
      ))}
    </div>
  );
}
