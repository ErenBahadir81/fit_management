"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet, Button, NumberStepper, Badge, Segmented } from "@/components/ui";
import { Plus, Trash2, Dumbbell, Footprints, Timer, Flag } from "lucide-react";
import { cn, fmtNum, fmtMinutes, fmtPace, clamp } from "@/lib/utils";
import { muscleName } from "@/lib/muscles";
import { apiSend } from "@/lib/fetcher";
import type {
  DayDTO,
  SetEntryDTO,
  StrengthEntryDTO,
  WorkoutLogDTO,
} from "@/lib/types";

interface LogSheetProps {
  open: boolean;
  onClose: () => void;
  day: DayDTO;
  existing?: WorkoutLogDTO | null;
  onSaved?: (log: WorkoutLogDTO) => void;
}

interface SegmentState {
  km: string;
  min: string;
}

const RIR_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "—" },
  { value: "0", label: "0" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
];

function rirToSeg(rir: number | null): string {
  return rir === null || rir === undefined ? "none" : String(clamp(rir, 0, 4));
}
function segToRir(v: string): number | null {
  return v === "none" ? null : Number(v);
}

/** En iyi tempo (dk/km) -> bir sonraki hafta hedefi (LogSheet önizlemesi). */
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

export function LogSheet({ open, onClose, day, existing, onSaved }: LogSheetProps) {
  const [entries, setEntries] = useState<SetEntryDTO[][]>([]);
  const [segments, setSegments] = useState<SegmentState[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Sheet açıldığında state'i hedeflerden / mevcut kayıttan ilklendir.
  useEffect(() => {
    if (!open) return;
    setErr(null);
    const ex = existing && !existing.isOffDay ? existing : null;

    setEntries(
      day.exercises.map((exr, i) => {
        const found = ex?.strength?.[i];
        if (found && found.sets?.length) {
          return found.sets.map((s) => ({ reps: s.reps, rir: s.rir }));
        }
        return Array.from({ length: Math.max(1, exr.targetSets) }, () => ({
          reps: exr.targetReps,
          rir: exr.targetRIR,
        }));
      })
    );

    if (day.run) {
      const exSegs = ex?.run?.segments;
      if (exSegs && exSegs.length) {
        setSegments(
          exSegs.map((s) => ({ km: String(s.km), min: String(s.min) }))
        );
      } else {
        setSegments([{ km: String(day.run.targetKm), min: "" }]);
      }
    } else {
      setSegments([]);
    }
  }, [open, day, existing]);

  const parsedSegs = useMemo(
    () =>
      segments.map((s) => ({
        km: Number(s.km.replace(",", ".")) || 0,
        min: Number(s.min.replace(",", ".")) || 0,
      })),
    [segments]
  );
  const totalKm = parsedSegs.reduce((a, s) => a + s.km, 0);
  const totalMin = parsedSegs.reduce((a, s) => a + s.min, 0);
  const avgPace = totalKm > 0 ? totalMin / totalKm : 0;
  const nextMin = day.run
    ? previewNextMin(parsedSegs, day.run.targetKm, day.run.targetMin)
    : 0;

  /* ----------------------------- set mutations ---------------------------- */
  function patchSet(ei: number, si: number, patch: Partial<SetEntryDTO>) {
    setEntries((prev) =>
      prev.map((sets, i) =>
        i === ei ? sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) : sets
      )
    );
  }
  function addSet(ei: number) {
    setEntries((prev) =>
      prev.map((sets, i) => {
        if (i !== ei) return sets;
        const last = sets[sets.length - 1] ?? {
          reps: day.exercises[ei]?.targetReps ?? 10,
          rir: day.exercises[ei]?.targetRIR ?? null,
        };
        return [...sets, { ...last }];
      })
    );
  }
  function removeSet(ei: number, si: number) {
    setEntries((prev) =>
      prev.map((sets, i) =>
        i === ei ? sets.filter((_, j) => j !== si) : sets
      )
    );
  }

  /* --------------------------- segment mutations -------------------------- */
  function patchSeg(i: number, patch: Partial<SegmentState>) {
    setSegments((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  function addSeg() {
    setSegments((prev) => [...prev, { km: "0", min: "0" }]);
  }
  function removeSeg(i: number) {
    setSegments((prev) => prev.filter((_, j) => j !== i));
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const strength: StrengthEntryDTO[] = day.exercises.map((e, i) => ({
        name: e.name,
        muscles: e.muscles,
        plannedSets: e.targetSets,
        plannedReps: e.targetReps,
        plannedRIR: e.targetRIR,
        sets: entries[i] ?? [],
      }));

      const res = await apiSend<{ log: WorkoutLogDTO }>(
        "/api/program/complete",
        "POST",
        {
          strength,
          run: day.run ? { segments: parsedSegs } : undefined,
        }
      );
      onSaved?.(res.log);
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  const isRunDay = day.kind === "run";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing && !existing.isOffDay ? "Antrenmanı Düzenle" : day.title}
      subtitle={existing && !existing.isOffDay ? day.title : day.focus || undefined}
      footer={
        <div className="space-y-2">
          {err && (
            <p className="text-xs text-fatigued text-center font-medium">{err}</p>
          )}
          <Button fullWidth size="lg" loading={saving} onClick={save}>
            Kaydet
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-1">
        {day.exercises.map((exr, ei) => (
          <div
            key={`${exr.name}-${ei}`}
            className="rounded-2xl border border-border bg-surface-2/40 p-3.5"
          >
            <div className="flex items-start justify-between gap-2 mb-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Dumbbell size={16} className="text-primary shrink-0" />
                  <span className="font-bold leading-tight truncate">
                    {exr.name}
                  </span>
                </div>
                <p className="text-[11px] text-muted mt-1 truncate">
                  {exr.muscles.map(muscleName).join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge color="var(--muted)">
                  Hedef {exr.targetSets}×{exr.targetReps}
                </Badge>
                {exr.targetRIR !== null && (
                  <Badge color="var(--primary)">RIR {exr.targetRIR}</Badge>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {(entries[ei] ?? []).map((set, si) => (
                <div
                  key={si}
                  className="rounded-xl bg-surface border border-border p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-muted w-12 shrink-0">
                      Set {si + 1}
                    </span>
                    <NumberStepper
                      value={set.reps}
                      onChange={(v) => patchSet(ei, si, { reps: v })}
                      min={1}
                      max={100}
                      suffix="tkr"
                    />
                    <button
                      type="button"
                      onClick={() => removeSet(ei, si)}
                      disabled={(entries[ei]?.length ?? 0) <= 1}
                      className="tap h-9 w-9 grid place-items-center rounded-xl text-muted disabled:opacity-25 active:bg-surface-2 shrink-0"
                      aria-label="Seti sil"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-muted shrink-0">
                      RIR
                    </span>
                    <Segmented
                      size="sm"
                      value={rirToSeg(set.rir)}
                      onChange={(v) => patchSet(ei, si, { rir: segToRir(v) })}
                      options={RIR_OPTIONS}
                    />
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-muted mt-2 px-0.5">
              RIR = kaç tekrar daha yapabilirdin
            </p>

            <button
              type="button"
              onClick={() => addSet(ei)}
              className="tap mt-2 w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm font-semibold text-muted active:bg-surface-2"
            >
              <Plus size={16} /> Set Ekle
            </button>
          </div>
        ))}

        {day.run && (
          <div
            className={cn(
              "rounded-2xl border border-border p-3.5",
              isRunDay ? "bg-primary-soft/40" : "bg-surface-2/40"
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <Footprints size={17} className="text-primary" />
                <span className="font-bold">{day.run.label || "Koşu"}</span>
              </div>
              <Badge color="var(--primary)">
                Hedef {fmtNum(day.run.targetKm)}km {Math.round(day.run.targetMin)}dk
              </Badge>
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
                      onChange={(e) => patchSeg(i, { km: e.target.value })}
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
                      onChange={(e) => patchSeg(i, { min: e.target.value })}
                      placeholder="0"
                      className="w-full h-11 rounded-xl border border-border bg-surface px-3 text-[15px] tabular-nums outline-none focus:border-primary"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeSeg(i)}
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
              onClick={addSeg}
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

            <div className="mt-2 flex items-center gap-2 rounded-xl bg-ready/10 px-3 py-2.5">
              <Flag size={15} className="text-ready shrink-0" />
              <p className="text-[12px] font-medium text-ink leading-snug">
                Sonraki hafta hedefi:{" "}
                <span className="font-bold text-ready">
                  {fmtNum(day.run.targetKm)}km {nextMin}dk
                </span>{" "}
                <span className="text-muted">(en iyi tempona göre)</span>
              </p>
            </div>
          </div>
        )}

        {day.exercises.length === 0 && !day.run && (
          <div className="flex flex-col items-center text-center py-8 text-muted">
            <Timer size={26} className="mb-2" />
            <p className="text-sm">Bu gün için kayıtlı hareket yok.</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
