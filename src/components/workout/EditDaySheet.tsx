"use client";

import { useEffect, useState } from "react";
import { mutate } from "swr";
import { Sheet, Button, NumberStepper, Badge, Input } from "@/components/ui";
import {
  Plus,
  Trash2,
  Dumbbell,
  Footprints,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { muscleName } from "@/lib/muscles";
import { EXERCISE_CATALOG, ExerciseDef } from "@/lib/exercises";
import { apiSend } from "@/lib/fetcher";
import type { DayDTO, ExerciseTargetDTO } from "@/lib/types";

interface EditDaySheetProps {
  open: boolean;
  onClose: () => void;
  day: DayDTO;
  dayIndex: number;
}

const RIR_NONE = -1; // dahili "—" temsili

export function EditDaySheet({ open, onClose, day, dayIndex }: EditDaySheetProps) {
  const [title, setTitle] = useState(day.title);
  const [focus, setFocus] = useState(day.focus);
  const [exercises, setExercises] = useState<ExerciseTargetDTO[]>(day.exercises);
  const [run, setRun] = useState<{ targetKm: number; targetMin: number } | null>(
    day.run ? { targetKm: day.run.targetKm, targetMin: day.run.targetMin } : null
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(day.title);
    setFocus(day.focus);
    setExercises(day.exercises);
    setRun(
      day.run
        ? { targetKm: day.run.targetKm, targetMin: day.run.targetMin }
        : null
    );
    setErr(null);
  }, [open, day]);

  function patchExercise(i: number, patch: Partial<ExerciseTargetDTO>) {
    setExercises((prev) =>
      prev.map((e, j) => (j === i ? { ...e, ...patch } : e))
    );
  }
  function removeExercise(i: number) {
    setExercises((prev) => prev.filter((_, j) => j !== i));
  }
  function addExercise(def: ExerciseDef) {
    setExercises((prev) => [
      ...prev,
      {
        name: def.name,
        muscles: def.muscles,
        targetSets: def.defaultSets,
        targetReps: def.defaultReps,
        targetRIR: 2,
      },
    ]);
    setPickerOpen(false);
  }

  function cycleRir(current: number | null) {
    // — -> 0 -> 1 -> 2 -> 3 -> 4 -> —
    if (current === null) return 0;
    if (current >= 4) return RIR_NONE;
    return current + 1;
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const payload: DayDTO = {
        order: dayIndex + 1,
        title: title.trim() || `${dayIndex + 1}. Gün`,
        focus: focus.trim(),
        kind: day.kind,
        exercises,
        run: run
          ? {
              targetKm: run.targetKm,
              targetMin: run.targetMin,
              label: day.run?.label,
            }
          : null,
      };
      await apiSend("/api/program", "PUT", { dayIndex, day: payload });
      await mutate("/api/program");
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={`${dayIndex + 1}. Günü Düzenle`}
        subtitle="Hedefleri ayarla, hareket ekle veya çıkar"
        footer={
          <div className="space-y-2">
            {err && (
              <p className="text-xs text-fatigued text-center font-medium">
                {err}
              </p>
            )}
            <Button fullWidth size="lg" loading={saving} onClick={save}>
              <Check size={18} /> Kaydet
            </Button>
          </div>
        }
      >
        <div className="space-y-4 pb-1">
          <div className="space-y-3">
            <Input
              label="Gün adı"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn. Push A"
            />
            <Input
              label="Odak"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="Örn. Göğüs & Yan Omuz"
            />
          </div>

          <div className="space-y-3">
            {exercises.map((exr, i) => (
              <div
                key={`${exr.name}-${i}`}
                className="rounded-2xl border border-border bg-surface-2/40 p-3.5"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Dumbbell size={15} className="text-primary shrink-0" />
                      <span className="font-bold truncate">{exr.name}</span>
                    </div>
                    <p className="text-[11px] text-muted mt-1 truncate">
                      {exr.muscles.map(muscleName).join(" · ") || "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExercise(i)}
                    className="tap h-9 w-9 grid place-items-center rounded-xl text-fatigued active:bg-fatigued/10 shrink-0"
                    aria-label="Hareketi sil"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-[11px] font-semibold text-muted mb-1">
                      Set
                    </div>
                    <NumberStepper
                      value={exr.targetSets}
                      onChange={(v) => patchExercise(i, { targetSets: v })}
                      min={1}
                      max={30}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-muted mb-1">
                      Tekrar
                    </div>
                    <NumberStepper
                      value={exr.targetReps}
                      onChange={(v) => patchExercise(i, { targetReps: v })}
                      min={1}
                      max={100}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-muted mb-1">
                      RIR
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        patchExercise(i, {
                          targetRIR:
                            cycleRir(exr.targetRIR) === RIR_NONE
                              ? null
                              : cycleRir(exr.targetRIR),
                        })
                      }
                      className="tap w-full h-11 grid place-items-center rounded-2xl border border-border bg-surface font-bold tabular-nums active:bg-surface-2"
                    >
                      {exr.targetRIR === null ? "—" : exr.targetRIR}
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="tap w-full h-12 inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 text-sm font-bold text-primary bg-primary-soft/40 active:bg-primary-soft"
            >
              <Plus size={18} /> Hareket Ekle
            </button>
          </div>

          {run && (
            <div className="rounded-2xl border border-border bg-surface-2/40 p-3.5">
              <div className="flex items-center gap-2 mb-3">
                <Footprints size={16} className="text-primary" />
                <span className="font-bold">Koşu Hedefi</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-muted mb-1">
                    Mesafe (km)
                  </div>
                  <NumberStepper
                    value={run.targetKm}
                    onChange={(v) => setRun({ ...run, targetKm: v })}
                    min={0}
                    max={200}
                    step={1}
                    suffix="km"
                    className="w-full"
                  />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-muted mb-1">
                    Süre (dk)
                  </div>
                  <NumberStepper
                    value={run.targetMin}
                    onChange={(v) => setRun({ ...run, targetMin: v })}
                    min={0}
                    max={600}
                    step={1}
                    suffix="dk"
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </Sheet>

      <AddExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        existingNames={exercises.map((e) => e.name)}
        onPick={addExercise}
      />
    </>
  );
}

/* ---------------------------- AddExercisePicker --------------------------- */

function AddExercisePicker({
  open,
  onClose,
  onPick,
  existingNames,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (def: ExerciseDef) => void;
  existingNames: string[];
}) {
  const has = new Set(existingNames.map((n) => n.toLowerCase()));
  return (
    <Sheet open={open} onClose={onClose} title="Hareket Ekle" subtitle="Katalogdan seç">
      <div className="space-y-2 pb-2">
        {EXERCISE_CATALOG.map((def) => {
          const added = has.has(def.name.toLowerCase());
          return (
            <button
              key={def.name}
              type="button"
              onClick={() => onPick(def)}
              className={cn(
                "tap w-full flex items-center justify-between gap-3 rounded-2xl border p-3.5 text-left active:bg-surface-2",
                added ? "border-primary/40 bg-primary-soft/30" : "border-border bg-surface"
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Dumbbell size={15} className="text-primary shrink-0" />
                  <span className="font-bold truncate">{def.name}</span>
                  {added && (
                    <Badge color="var(--primary)">ekli</Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted mt-1 truncate">
                  {def.muscles.map(muscleName).join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-muted tabular-nums">
                  {def.defaultSets}×{def.defaultReps}
                </span>
                <span className="h-8 w-8 grid place-items-center rounded-full bg-primary-soft text-primary">
                  <Plus size={16} />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
