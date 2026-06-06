"use client";

import { useEffect, useState } from "react";
import { mutate } from "swr";
import { Sheet, Button, NumberStepper, Badge, Segmented } from "@/components/ui";
import {
  Plus,
  Trash2,
  Dumbbell,
  Footprints,
  Waves,
  Timer,
  Clock,
  StretchHorizontal,
  SkipForward,
  RotateCcw,
  Check,
  X,
} from "lucide-react";
import { cn, clamp } from "@/lib/utils";
import { muscleName } from "@/lib/muscles";
import { apiSend } from "@/lib/fetcher";
import type {
  DayDTO,
  ExerciseMetric,
  SetEntryDTO,
  WorkoutLogDTO,
} from "@/lib/types";
import { AddExerciseSheet, type SessionEntry } from "./AddExerciseSheet";
import {
  CardioLogger,
  parseSegments,
  type SegmentState,
} from "./CardioLogger";
import { metricUnit, targetLabel, stretchDone } from "./workout-ui";

interface LogSheetProps {
  open: boolean;
  onClose: () => void;
  day: DayDTO;
  existing?: WorkoutLogDTO | null;
  onSaved?: () => void;
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

/** Süre setlerinin saniye sınırları. */
const TIME_MIN = 5;
const TIME_MAX = 600;
const TIME_STEP = 5;

/** Bir entry için "Set Ekle" / atlama-geri-al varsayılan set değeri. */
function defaultSetValue(metric: ExerciseMetric, plannedReps: number): number {
  if (metric === "time") return plannedReps || 30;
  return plannedReps || 10;
}

/** Programdaki bir günü, kendine yeten seans hareketlerine çevirir (FRESH). */
function entriesFromDay(day: DayDTO): SessionEntry[] {
  return day.exercises.map((e) => {
    const metric: ExerciseMetric = e.metric ?? "reps";
    if (metric === "stretch") {
      // FRESH varsayılan: yapıldı.
      return {
        name: e.name,
        muscles: e.muscles,
        plannedSets: e.targetSets,
        plannedReps: e.targetReps,
        plannedRIR: e.targetRIR,
        source: "planned",
        skipped: false,
        metric,
        sets: [{ reps: 1, rir: null }],
      };
    }
    return {
      name: e.name,
      muscles: e.muscles,
      plannedSets: e.targetSets,
      plannedReps: e.targetReps,
      plannedRIR: e.targetRIR,
      source: "planned",
      skipped: false,
      metric,
      sets: Array.from({ length: Math.max(1, e.targetSets) }, () => ({
        reps: e.targetReps,
        rir: e.targetRIR,
      })),
    };
  });
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
    metric: e.metric ?? "reps",
    sets: e.skipped ? [] : e.sets.map((s) => ({ reps: s.reps, rir: s.rir })),
  }));
}

function segsFromState(state: { km: number; min: number }[]): SegmentState[] {
  return state.map((s) => ({ km: String(s.km), min: String(s.min) }));
}

export function LogSheet({ open, onClose, day, existing, onSaved }: LogSheetProps) {
  // EDIT modu yalnızca gerçek (dinlenme olmayan) bir kayıt varsa.
  const isEdit = !!existing && !existing.isOffDay;

  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [runSegs, setRunSegs] = useState<SegmentState[]>([]);
  const [runOn, setRunOn] = useState(false);
  const [swimSegs, setSwimSegs] = useState<SegmentState[]>([]);
  const [swimOn, setSwimOn] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* ------------------------------- seeding -------------------------------- */
  // Sheet açıldığında çalışma listesini DOĞRU kaynaktan ilklendir:
  //  - EDIT  -> mevcut log (existing.strength / .run / .swim)  [day YOK SAYILIR]
  //  - FRESH -> program günü (day.exercises / .run / .swim)
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setPickerOpen(false);

    if (isEdit && existing) {
      setEntries(entriesFromLog(existing));

      const rSegs = existing.run?.segments;
      if (rSegs && rSegs.length) {
        setRunSegs(segsFromState(rSegs));
        setRunOn(true);
      } else {
        setRunSegs([]);
        setRunOn(false);
      }

      const sSegs = existing.swim?.segments;
      if (sSegs && sSegs.length) {
        setSwimSegs(segsFromState(sSegs));
        setSwimOn(true);
      } else {
        setSwimSegs([]);
        setSwimOn(false);
      }
    } else {
      setEntries(entriesFromDay(day));

      if (day.run) {
        setRunSegs([{ km: String(day.run.targetKm), min: "" }]);
        setRunOn(true);
      } else {
        setRunSegs([]);
        setRunOn(false);
      }

      if (day.swim) {
        setSwimSegs([{ km: String(day.swim.targetKm), min: "" }]);
        setSwimOn(true);
      } else {
        setSwimSegs([]);
        setSwimOn(false);
      }
    }
    // existing kimliği/içeriği veya gün değişince yeniden ilklendir.
  }, [open, isEdit, existing, day]);

  // "Sonraki hafta" önizlemesi yalnız FRESH + planlı disiplinde anlamlı
  // (ad-hoc ve düzenleme kardiyoları ilerleme yapmaz).
  const showRunPreview = !isEdit && !!day.run;
  const showSwimPreview = !isEdit && !!day.swim;

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
            reps: defaultSetValue(e.metric, e.plannedReps),
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
                    reps: defaultSetValue(e.metric, e.plannedReps),
                    rir: e.plannedRIR,
                  },
                ];
          return { ...e, skipped: false, sets };
        }
        return { ...e, skipped: true };
      })
    );
  }
  /** Esneme: yapıldı/yapılmadı toggle. */
  function setStretchDone(ei: number, done: boolean) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i === ei
          ? done
            ? { ...e, skipped: false, sets: [{ reps: 1, rir: null }] }
            : { ...e, skipped: true, sets: [] }
          : e
      )
    );
  }
  function removeEntry(ei: number) {
    setEntries((prev) => prev.filter((_, i) => i !== ei));
  }
  function addEntry(entry: SessionEntry) {
    setEntries((prev) => [...prev, entry]);
  }

  /* --------------------------- segment mutations -------------------------- */
  function patchRun(i: number, patch: Partial<SegmentState>) {
    setRunSegs((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  function patchSwim(i: number, patch: Partial<SegmentState>) {
    setSwimSegs((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  function addRunSeg() {
    setRunSegs((prev) => [...prev, { km: "0", min: "0" }]);
  }
  function addSwimSeg() {
    setSwimSegs((prev) => [...prev, { km: "0", min: "0" }]);
  }
  function removeRunSeg(i: number) {
    setRunSegs((prev) => prev.filter((_, j) => j !== i));
  }
  function removeSwimSeg(i: number) {
    setSwimSegs((prev) => prev.filter((_, j) => j !== i));
  }
  function enableRun() {
    setRunOn(true);
    setRunSegs([{ km: "0", min: "0" }]);
  }
  function enableSwim() {
    setSwimOn(true);
    setSwimSegs([{ km: "0", min: "0" }]);
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
          metric: e.metric,
          // skipped -> boş set. Esneme yapıldıysa [{reps:1}], değilse skipped.
          sets: e.skipped ? [] : e.sets,
        })),
        // Kardiyo yalnızca açıkça yapıldıysa (segment girildiyse) gönderilir.
        run: runOn ? { segments: parseSegments(runSegs) } : null,
        swim: swimOn ? { segments: parseSegments(swimSegs) } : null,
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
  const hasContent = entries.length > 0 || runOn || swimOn;

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
          {entries.map((entry, ei) => {
            const isStretch = entry.metric === "stretch";
            const isTime = entry.metric === "time";
            const unit = metricUnit(entry.metric);
            const done = stretchDone(entry.skipped, entry.sets);

            return (
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
                      <ExerciseIcon metric={entry.metric} />
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
                      {isStretch
                        ? "Esneme / Mobilite"
                        : entry.muscles.map(muscleName).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {entry.source === "extra" ? (
                      <Badge color="var(--primary)">Ekstra</Badge>
                    ) : (
                      <>
                        <Badge color="var(--muted)">
                          {targetLabel(
                            entry.metric,
                            entry.plannedSets,
                            entry.plannedReps
                          )}
                        </Badge>
                        {!isStretch && entry.plannedRIR !== null && (
                          <Badge color="var(--primary)">
                            RIR {entry.plannedRIR}
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {isStretch ? (
                  /* --------------------------- ESNEME --------------------------- */
                  <div className="mt-3">
                    <Segmented
                      value={done ? "done" : "not"}
                      onChange={(v) => setStretchDone(ei, v === "done")}
                      options={[
                        { value: "done", label: "Yapıldı", icon: <Check size={15} /> },
                        { value: "not", label: "Yapılmadı", icon: <X size={15} /> },
                      ]}
                    />
                    {entry.source === "extra" && (
                      <button
                        type="button"
                        onClick={() => removeEntry(ei)}
                        className="tap mt-2 w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-semibold text-fatigued active:bg-fatigued/10"
                      >
                        <Trash2 size={15} /> Hareketi sil
                      </button>
                    )}
                  </div>
                ) : entry.skipped ? (
                  /* --------------------------- ATLANDI -------------------------- */
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
                  /* ----------------------- TEKRAR / SÜRE ------------------------ */
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
                              min={isTime ? TIME_MIN : 1}
                              max={isTime ? TIME_MAX : 100}
                              step={isTime ? TIME_STEP : 1}
                              suffix={unit}
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
                              onChange={(v) =>
                                patchSet(ei, si, { rir: segToRir(v) })
                              }
                              options={RIR_OPTIONS}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="text-[11px] text-muted mt-2 px-0.5">
                      {isTime
                        ? "Süre saniye cinsinden · RIR = kaç saniye daha dayanabilirdin"
                        : "RIR = kaç tekrar daha yapabilirdin"}
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
            );
          })}

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
            <CardioLogger
              discipline="run"
              segments={runSegs}
              onPatch={patchRun}
              onAdd={addRunSeg}
              onRemove={removeRunSeg}
              target={day.run}
              showPreview={showRunPreview}
              highlight={day.kind === "run"}
            />
          ) : (
            <button
              type="button"
              onClick={enableRun}
              className="tap w-full h-12 inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm font-bold text-muted active:bg-surface-2"
            >
              <Footprints size={18} /> Koşu Ekle
            </button>
          )}

          {/* Yüzme */}
          {swimOn ? (
            <CardioLogger
              discipline="swim"
              segments={swimSegs}
              onPatch={patchSwim}
              onAdd={addSwimSeg}
              onRemove={removeSwimSeg}
              target={day.swim}
              showPreview={showSwimPreview}
              highlight={day.kind === "swim"}
            />
          ) : (
            <button
              type="button"
              onClick={enableSwim}
              className="tap w-full h-12 inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm font-bold text-muted active:bg-surface-2"
            >
              <Waves size={18} /> Yüzme Ekle
            </button>
          )}

          {!hasContent && (
            <div className="flex flex-col items-center text-center py-8 text-muted">
              <Timer size={26} className="mb-2" />
              <p className="text-sm">Bu seansa henüz hareket eklenmedi.</p>
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

/** Metrik'e göre hareket satırı ikonu. */
function ExerciseIcon({ metric }: { metric: ExerciseMetric }) {
  if (metric === "time")
    return <Clock size={16} className="text-primary shrink-0" />;
  if (metric === "stretch")
    return <StretchHorizontal size={16} className="text-primary shrink-0" />;
  return <Dumbbell size={16} className="text-primary shrink-0" />;
}
