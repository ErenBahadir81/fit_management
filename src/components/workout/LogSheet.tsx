"use client";

import { useEffect, useMemo, useState } from "react";
import { mutate } from "swr";
import { Sheet, Button, NumberStepper, Badge, Segmented } from "@/components/ui";
import {
  Plus,
  Trash2,
  Dumbbell,
  Footprints,
  Timer,
  Flag,
  SkipForward,
  RotateCcw,
} from "lucide-react";
import { cn, fmtNum, fmtMinutes, fmtPace, clamp } from "@/lib/utils";
import { muscleName } from "@/lib/muscles";
import { apiSend } from "@/lib/fetcher";
import type {
  DayDTO,
  SetEntryDTO,
  WorkoutLogDTO,
} from "@/lib/types";
import { AddExerciseSheet, type SessionEntry } from "./AddExerciseSheet";

interface LogSheetProps {
  open: boolean;
  onClose: () => void;
  day: DayDTO;
  existing?: WorkoutLogDTO | null;
  onSaved?: () => void;
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

/** Programdaki bir günü, kendine yeten seans hareketlerine çevirir (FRESH). */
function entriesFromDay(day: DayDTO): SessionEntry[] {
  return day.exercises.map((e) => ({
    name: e.name,
    muscles: e.muscles,
    plannedSets: e.targetSets,
    plannedReps: e.targetReps,
    plannedRIR: e.targetRIR,
    source: "planned",
    skipped: false,
    sets: Array.from({ length: Math.max(1, e.targetSets) }, () => ({
      reps: e.targetReps,
      rir: e.targetRIR,
    })),
  }));
}

/** Mevcut log'dan seans hareketlerini birebir alır (EDIT). İşaretçiye bakmaz. */
function entriesFromLog(log: WorkoutLogDTO): SessionEntry[] {
  return log.strength.map((e) => ({
    name: e.name,
    muscles: e.muscles,
    plannedSets: e.plannedSets,
    plannedReps: e.plannedReps,
    plannedRIR: e.plannedRIR,
    source: e.source === "extra" ? "extra" : "planned",
    skipped: !!e.skipped,
    sets: e.skipped
      ? []
      : e.sets.map((s) => ({ reps: s.reps, rir: s.rir })),
  }));
}

function segsFromState(state: { km: number; min: number }[]): SegmentState[] {
  return state.map((s) => ({ km: String(s.km), min: String(s.min) }));
}

export function LogSheet({ open, onClose, day, existing, onSaved }: LogSheetProps) {
  // EDIT modu yalnızca gerçek (dinlenme olmayan) bir kayıt varsa.
  const isEdit = !!existing && !existing.isOffDay;

  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [segments, setSegments] = useState<SegmentState[]>([]);
  const [runOn, setRunOn] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* ------------------------------- seeding -------------------------------- */
  // Sheet açıldığında çalışma listesini DOĞRU kaynaktan ilklendir:
  //  - EDIT  -> mevcut log (existing.strength / existing.run)  [day YOK SAYILIR]
  //  - FRESH -> program günü (day.exercises / day.run)
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setPickerOpen(false);

    if (isEdit && existing) {
      setEntries(entriesFromLog(existing));
      const segs = existing.run?.segments;
      if (segs && segs.length) {
        setSegments(segsFromState(segs));
        setRunOn(true);
      } else {
        // Düzenlemede planlı koşu hedefi yoksa, ad-hoc koşu yine eklenebilir.
        setSegments([]);
        setRunOn(false);
      }
    } else {
      setEntries(entriesFromDay(day));
      if (day.run) {
        setSegments([{ km: String(day.run.targetKm), min: "" }]);
        setRunOn(true);
      } else {
        setSegments([]);
        setRunOn(false);
      }
    }
    // existing kimliği/içeriği veya gün değişince yeniden ilklendir.
  }, [open, isEdit, existing, day]);

  /* --------------------------- run derived stats -------------------------- */
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

  // "Sonraki hafta" önizlemesi yalnız FRESH + planlı koşu günlerinde anlamlı
  // (ad-hoc ve düzenleme koşuları ilerleme yapmaz).
  const showRunPreview = !isEdit && !!day.run;
  const nextMin = day.run
    ? previewNextMin(parsedSegs, day.run.targetKm, day.run.targetMin)
    : 0;

  /* ----------------------------- set mutations ---------------------------- */
  function patchSet(ei: number, si: number, patch: Partial<SetEntryDTO>) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i === ei
          ? { ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) }
          : e
      )
    );
  }
  function addSet(ei: number) {
    setEntries((prev) =>
      prev.map((e, i) => {
        if (i !== ei) return e;
        const last =
          e.sets[e.sets.length - 1] ??
          ({
            reps: e.plannedReps || 10,
            rir: e.plannedRIR,
          } as SetEntryDTO);
        return { ...e, sets: [...e.sets, { ...last }] };
      })
    );
  }
  function removeSet(ei: number, si: number) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i === ei ? { ...e, sets: e.sets.filter((_, j) => j !== si) } : e
      )
    );
  }

  /* --------------------------- entry mutations ---------------------------- */
  function toggleSkip(ei: number) {
    setEntries((prev) =>
      prev.map((e, i) => {
        if (i !== ei) return e;
        if (e.skipped) {
          // Geri al: en az bir set ile döndür.
          const sets =
            e.sets.length > 0
              ? e.sets
              : [
                  {
                    reps: e.plannedReps || 10,
                    rir: e.plannedRIR,
                  },
                ];
          return { ...e, skipped: false, sets };
        }
        return { ...e, skipped: true };
      })
    );
  }
  function removeEntry(ei: number) {
    setEntries((prev) => prev.filter((_, i) => i !== ei));
  }
  function addEntry(entry: SessionEntry) {
    setEntries((prev) => [...prev, entry]);
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
  function enableRun() {
    setRunOn(true);
    setSegments([{ km: "0", min: "0" }]);
  }

  /* -------------------------------- save ---------------------------------- */
  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        strength: entries.map((e) => ({
          name: e.name,
          muscles: e.muscles,
          plannedSets: e.plannedSets,
          plannedReps: e.plannedReps,
          plannedRIR: e.plannedRIR,
          source: e.source,
          skipped: e.skipped,
          sets: e.skipped ? [] : e.sets,
        })),
        // Koşu yalnızca açıkça yapıldıysa (segment girildiyse) gönderilir.
        run: runOn ? { segments: parsedSegs } : null,
      };

      if (isEdit && existing) {
        await apiSend(`/api/workouts/${existing.id}`, "PUT", payload);
      } else {
        await apiSend("/api/program/complete", "POST", payload);
      }

      await Promise.all([
        mutate("/api/program"),
        mutate("/api/recovery"),
        mutate("/api/workouts"),
      ]);

      onSaved?.();
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  const existingNames = entries.map((e) => e.name);
  const hasContent = entries.length > 0 || runOn;
  const isRunDay = day.kind === "run";

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={isEdit ? "Antrenmanı Düzenle" : day.title}
        subtitle={isEdit ? day.title : day.focus || undefined}
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
          {entries.map((entry, ei) => (
            <div
              key={`${entry.name}-${ei}`}
              className={cn(
                "rounded-2xl border p-3.5 transition-colors",
                entry.skipped
                  ? "border-dashed border-border bg-surface-2/20 opacity-70"
                  : "border-border bg-surface-2/40"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Dumbbell size={16} className="text-primary shrink-0" />
                    <span
                      className={cn(
                        "font-bold leading-tight truncate",
                        entry.skipped && "line-through text-muted"
                      )}
                    >
                      {entry.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted mt-1 truncate">
                    {entry.muscles.map(muscleName).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {entry.source === "extra" ? (
                    <Badge color="var(--primary)">Ekstra</Badge>
                  ) : (
                    <>
                      <Badge color="var(--muted)">
                        Hedef {entry.plannedSets}×{entry.plannedReps}
                      </Badge>
                      {entry.plannedRIR !== null && (
                        <Badge color="var(--primary)">RIR {entry.plannedRIR}</Badge>
                      )}
                    </>
                  )}
                </div>
              </div>

              {entry.skipped ? (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-muted inline-flex items-center gap-1.5">
                    <SkipForward size={14} /> Bu hareket atlandı
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleSkip(ei)}
                    className="tap h-9 px-3 inline-flex items-center gap-1.5 rounded-xl border border-border text-sm font-semibold text-ink active:bg-surface-2"
                  >
                    <RotateCcw size={14} /> Geri al
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-2 mt-2.5">
                    {entry.sets.map((set, si) => (
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
                            disabled={entry.sets.length <= 1}
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

                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addSet(ei)}
                      className="tap flex-1 h-10 inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm font-semibold text-muted active:bg-surface-2"
                    >
                      <Plus size={16} /> Set Ekle
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSkip(ei)}
                      className="tap h-10 px-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-semibold text-muted active:bg-surface-2"
                    >
                      <SkipForward size={15} /> Atla
                    </button>
                    {entry.source === "extra" && (
                      <button
                        type="button"
                        onClick={() => removeEntry(ei)}
                        className="tap h-10 w-10 grid place-items-center rounded-xl text-fatigued border border-border active:bg-fatigued/10 shrink-0"
                        aria-label="Hareketi sil"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Hareket ekle */}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="tap w-full h-12 inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 text-sm font-bold text-primary bg-primary-soft/40 active:bg-primary-soft"
          >
            <Plus size={18} /> Hareket Ekle
          </button>

          {/* Koşu */}
          {runOn ? (
            <div
              className={cn(
                "rounded-2xl border border-border p-3.5",
                isRunDay ? "bg-primary-soft/40" : "bg-surface-2/40"
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <Footprints size={17} className="text-primary" />
                  <span className="font-bold">{day.run?.label || "Koşu"}</span>
                </div>
                {day.run ? (
                  <Badge color="var(--primary)">
                    Hedef {fmtNum(day.run.targetKm)}km{" "}
                    {Math.round(day.run.targetMin)}dk
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

              {showRunPreview && (
                <div className="mt-2 flex items-center gap-2 rounded-xl bg-ready/10 px-3 py-2.5">
                  <Flag size={15} className="text-ready shrink-0" />
                  <p className="text-[12px] font-medium text-ink leading-snug">
                    Sonraki hafta hedefi:{" "}
                    <span className="font-bold text-ready">
                      {fmtNum(day.run!.targetKm)}km {nextMin}dk
                    </span>{" "}
                    <span className="text-muted">(en iyi tempona göre)</span>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={enableRun}
              className="tap w-full h-12 inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm font-bold text-muted active:bg-surface-2"
            >
              <Footprints size={18} /> Koşu Ekle
            </button>
          )}

          {!hasContent && (
            <div className="flex flex-col items-center text-center py-8 text-muted">
              <Timer size={26} className="mb-2" />
              <p className="text-sm">
                Bu seansa henüz hareket eklenmedi.
              </p>
            </div>
          )}
        </div>
      </Sheet>

      <AddExerciseSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        existingNames={existingNames}
        onAdd={addEntry}
      />
    </>
  );
}
