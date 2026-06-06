"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui";
import { Plus, Trash2, Footprints, Waves, Flag } from "lucide-react";
import { cn, fmtNum, fmtMinutes, fmtPace, clamp } from "@/lib/utils";
import type { CardioDiscipline, RunTargetDTO } from "@/lib/types";

export interface SegmentState {
  km: string;
  min: string;
}

interface CardioLoggerProps {
  discipline: CardioDiscipline;
  segments: SegmentState[];
  onPatch: (i: number, patch: Partial<SegmentState>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  /** Planlı hedef (varsa rozet + "sonraki hafta" önizlemesi). */
  target?: RunTargetDTO | null;
  /** Önizleme yalnız FRESH + planlı disiplinde gösterilir. */
  showPreview?: boolean;
  /** Bu disiplin günün ana türü mü (vurgulu arka plan). */
  highlight?: boolean;
}

const COPY: Record<
  CardioDiscipline,
  { label: string; Icon: typeof Footprints }
> = {
  run: { label: "Koşu", Icon: Footprints },
  swim: { label: "Yüzme", Icon: Waves },
};

/** En iyi tempo (dk/km) -> bir sonraki hafta hedefi (önizleme; API ile aynı kural). */
function previewNextMin(
  segs: { km: number; min: number }[],
  targetKm: number,
  targetMin: number
): number {
  let best = Infinity;
  for (const s of segs) {
    if (s.km > 0 && s.min > 0) best = Math.min(best, s.min / s.km);
  }
  if (!Number.isFinite(best) || targetKm <= 0) return targetMin;
  const projected = Math.round(best * targetKm);
  const floor = Math.round(targetKm * 3);
  return clamp(projected, floor, targetMin);
}

export function parseSegments(
  segments: SegmentState[]
): { km: number; min: number }[] {
  return segments.map((s) => ({
    km: Number(s.km.replace(",", ".")) || 0,
    min: Number(s.min.replace(",", ".")) || 0,
  }));
}

export function CardioLogger({
  discipline,
  segments,
  onPatch,
  onAdd,
  onRemove,
  target,
  showPreview = false,
  highlight = false,
}: CardioLoggerProps) {
  const { label, Icon } = COPY[discipline];

  const parsed = useMemo(() => parseSegments(segments), [segments]);
  const totalKm = parsed.reduce((a, s) => a + s.km, 0);
  const totalMin = parsed.reduce((a, s) => a + s.min, 0);
  const avgPace = totalKm > 0 ? totalMin / totalKm : 0;

  const nextMin = target
    ? previewNextMin(parsed, target.targetKm, target.targetMin)
    : 0;

  return (
    <div
      className={cn(
        "rounded-2xl border border-border p-3.5",
        highlight ? "bg-primary-soft/40" : "bg-surface-2/40"
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <Icon size={17} className="text-primary" />
          <span className="font-bold">{target?.label || label}</span>
        </div>
        {target ? (
          <Badge color="var(--primary)">
            Hedef {fmtNum(target.targetKm)}km {Math.round(target.targetMin)}dk
          </Badge>
        ) : (
          <Badge color="var(--primary)">Ekstra</Badge>
        )}
      </div>

      <div className="space-y-2 mt-2.5">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-end gap-2">
            <label className="flex-1 min-w-0">
              <span className="block text-[11px] font-semibold text-muted mb-1">
                {i + 1}. Bölüm · km
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={seg.km}
                onChange={(e) => onPatch(i, { km: e.target.value })}
                placeholder="0"
                className="w-full h-11 rounded-xl border border-border bg-surface px-3 text-[15px] tabular-nums outline-none focus:border-primary"
              />
            </label>
            <label className="flex-1 min-w-0">
              <span className="block text-[11px] font-semibold text-muted mb-1">
                dk
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={seg.min}
                onChange={(e) => onPatch(i, { min: e.target.value })}
                placeholder="0"
                className="w-full h-11 rounded-xl border border-border bg-surface px-3 text-[15px] tabular-nums outline-none focus:border-primary"
              />
            </label>
            <button
              type="button"
              onClick={() => onRemove(i)}
              disabled={segments.length <= 1}
              className="tap h-11 w-11 grid place-items-center rounded-xl text-muted disabled:opacity-25 active:bg-surface-2 shrink-0"
              aria-label="Bölümü sil"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="tap mt-2 w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm font-semibold text-muted active:bg-surface-2"
      >
        <Plus size={16} /> Bölüm Ekle
      </button>

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-surface border border-border p-3">
        <div>
          <div className="text-[11px] text-muted font-medium">Toplam</div>
          <div className="font-bold tabular-nums">{fmtNum(totalKm)} km</div>
        </div>
        <div>
          <div className="text-[11px] text-muted font-medium">Süre</div>
          <div className="font-bold tabular-nums">{fmtMinutes(totalMin)}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted font-medium">Tempo</div>
          <div className="font-bold tabular-nums">{fmtPace(avgPace)}</div>
        </div>
      </div>

      {showPreview && target && (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-ready/10 px-3 py-2.5">
          <Flag size={15} className="text-ready shrink-0" />
          <p className="text-[12px] font-medium text-ink leading-snug">
            Sonraki hafta hedefi:{" "}
            <span className="font-bold text-ready">
              {fmtNum(target.targetKm)}km {nextMin}dk
            </span>{" "}
            <span className="text-muted">(en iyi tempona göre)</span>
          </p>
        </div>
      )}
    </div>
  );
}
