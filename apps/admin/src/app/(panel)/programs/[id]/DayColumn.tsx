"use client";

import { Reorder, useDragControls } from "motion/react";
import { ChevronLeft, ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";
import type { DayDTO, ExerciseTargetDTO, MuscleDTO } from "@fitfloow/core";
import { cx } from "@/lib/cx";
import { spring } from "@/lib/motion";
import { num } from "@/lib/format";
import { IconButton } from "@/components/ui/Button";
import { NumberInput, Select } from "@/components/ui/Field";
import { InlineEdit } from "@/components/ui/Table";

export const DAY_KIND_TR = { strength: "Kuvvet", run: "Koşu", swim: "Yüzme", stretch: "Esneme", rest: "Dinlenme" } as const;

export function DayColumn({
  day,
  index,
  total,
  muscles,
  onPatch,
  onMoveDay,
  onRemoveDay,
  onAddExercise,
  onPatchExercise,
  onRemoveExercise,
  onReorderExercises,
  onMoveExercise,
}: {
  day: DayDTO;
  index: number;
  total: number;
  muscles: MuscleDTO[];
  onPatch: (patch: Partial<DayDTO>) => void;
  onMoveDay: (delta: number) => void;
  onRemoveDay: () => void;
  onAddExercise: () => void;
  onPatchExercise: (exIndex: number, patch: Partial<ExerciseTargetDTO>) => void;
  onRemoveExercise: (exIndex: number) => void;
  onReorderExercises: (next: ExerciseTargetDTO[]) => void;
  onMoveExercise: (exIndex: number, delta: number) => void;
}) {
  const colorOf = new Map(muscles.map((m) => [m.key, m]));
  const daySets = day.exercises.reduce((s, e) => s + e.targetSets, 0);

  return (
    <section
      aria-label={`${index + 1}. gün: ${day.title}`}
      className="flex w-72 shrink-0 flex-col rounded-xl border border-line bg-surface"
    >
      <header className="border-b border-line px-3 py-2.5">
        <div className="flex items-center gap-1">
          <span className="grid size-5 shrink-0 place-items-center rounded-md bg-surface-3 text-[10px] font-semibold tnum text-muted">
            {index + 1}
          </span>
          <InlineEdit
            label={`${index + 1}. gün başlığı`}
            value={day.title}
            onCommit={(v) => v.trim() && onPatch({ title: v.trim() })}
            className="min-w-0 flex-1 font-medium"
          />
          <IconButton label="Günü sola taşı" size="sm" disabled={index === 0} onClick={() => onMoveDay(-1)}>
            <ChevronLeft className="size-3.5" aria-hidden />
          </IconButton>
          <IconButton label="Günü sağa taşı" size="sm" disabled={index === total - 1} onClick={() => onMoveDay(1)}>
            <ChevronRight className="size-3.5" aria-hidden />
          </IconButton>
          <IconButton label={`${index + 1}. günü sil`} size="sm" variant="danger" disabled={total <= 1} onClick={onRemoveDay}>
            <Trash2 className="size-3.5" aria-hidden />
          </IconButton>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Select
            aria-label={`${index + 1}. gün türü`}
            value={day.kind}
            onChange={(e) => onPatch({ kind: e.target.value as DayDTO["kind"] })}
            className="h-7 text-xs"
          >
            {Object.entries(DAY_KIND_TR).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <span className="shrink-0 text-[11px] tnum text-subtle">{daySets} set</span>
        </div>
        <InlineEdit
          label={`${index + 1}. gün odağı`}
          value={day.focus || "odak ekle…"}
          onCommit={(v) => onPatch({ focus: v.trim() })}
          className="mt-1 h-6 text-xs text-muted"
        />
      </header>

      <div className="flex-1 space-y-1.5 p-2">
        {day.exercises.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-subtle">Bu günde hareket yok.</p>
        ) : (
          <Reorder.Group axis="y" values={day.exercises} onReorder={onReorderExercises} as="ul" className="space-y-1.5">
            {day.exercises.map((ex, exIndex) => (
              <ExerciseCard
                key={`${ex.name}-${exIndex}`}
                exercise={ex}
                dayIndex={index}
                totalDays={total}
                colorOf={colorOf}
                onPatch={(patch) => onPatchExercise(exIndex, patch)}
                onRemove={() => onRemoveExercise(exIndex)}
                onMove={(delta) => onMoveExercise(exIndex, delta)}
                onReorderWithinDay={(delta) => {
                  const target = exIndex + delta;
                  if (target < 0 || target >= day.exercises.length) return;
                  const next = [...day.exercises];
                  const [item] = next.splice(exIndex, 1);
                  next.splice(target, 0, item);
                  onReorderExercises(next);
                }}
              />
            ))}
          </Reorder.Group>
        )}

        <button
          type="button"
          onClick={onAddExercise}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2 text-xs font-medium text-muted transition-colors hover:border-brand-line hover:bg-brand-soft/40 hover:text-brand-text"
        >
          <Plus className="size-3.5" aria-hidden />
          Hareket ekle
        </button>
      </div>

      {(day.kind === "run" || day.kind === "swim") && (
        <div className="border-t border-line bg-surface-2 p-3">
          <p className="ff-eyebrow mb-2">{day.kind === "run" ? "Koşu hedefi" : "Yüzme hedefi"}</p>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              aria-label="Hedef mesafe"
              unit="km"
              min={0}
              step={0.5}
              className="h-8"
              value={(day.kind === "run" ? day.run?.targetKm : day.swim?.targetKm) ?? 0}
              onChange={(e) => {
                const targetKm = Number(e.target.value) || 0;
                const current = (day.kind === "run" ? day.run : day.swim) ?? { targetKm: 0, targetMin: 0, label: "" };
                onPatch(day.kind === "run" ? { run: { ...current, targetKm } } : { swim: { ...current, targetKm } });
              }}
            />
            <NumberInput
              aria-label="Hedef süre"
              unit="dk"
              min={0}
              className="h-8"
              value={(day.kind === "run" ? day.run?.targetMin : day.swim?.targetMin) ?? 0}
              onChange={(e) => {
                const targetMin = Number(e.target.value) || 0;
                const current = (day.kind === "run" ? day.run : day.swim) ?? { targetKm: 0, targetMin: 0, label: "" };
                onPatch(day.kind === "run" ? { run: { ...current, targetMin } } : { swim: { ...current, targetMin } });
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function ExerciseCard({
  exercise,
  dayIndex,
  totalDays,
  colorOf,
  onPatch,
  onRemove,
  onMove,
  onReorderWithinDay,
}: {
  exercise: ExerciseTargetDTO;
  dayIndex: number;
  totalDays: number;
  colorOf: Map<string, MuscleDTO>;
  onPatch: (patch: Partial<ExerciseTargetDTO>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  onReorderWithinDay: (delta: number) => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item value={exercise} dragListener={false} dragControls={controls} transition={spring} as="li" className="list-none">
      <div className="rounded-lg border border-line bg-surface-2 px-2 py-1.5">
        <div className="flex items-center gap-1">
          {/* Keyboard equivalent of the drag: without it this is a focusable button that does
              nothing, and the only way to order a day was the mouse. */}
          <button
            type="button"
            aria-label={`${exercise.name} sırasını değiştir: sürükle ya da yukarı/aşağı ok tuşlarını kullan`}
            onPointerDown={(e) => controls.start(e)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              e.preventDefault();
              onReorderWithinDay(e.key === "ArrowUp" ? -1 : 1);
            }}
            className="cursor-grab touch-none rounded p-0.5 text-subtle transition-colors hover:text-ink active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" aria-hidden />
          </button>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink" title={exercise.name}>
            {exercise.name}
          </span>
          <IconButton label={`${exercise.name} önceki güne taşı`} size="sm" disabled={dayIndex === 0} onClick={() => onMove(-1)}>
            <ChevronLeft className="size-3" aria-hidden />
          </IconButton>
          <IconButton label={`${exercise.name} sonraki güne taşı`} size="sm" disabled={dayIndex === totalDays - 1} onClick={() => onMove(1)}>
            <ChevronRight className="size-3" aria-hidden />
          </IconButton>
          <IconButton label={`${exercise.name} kaldır`} size="sm" variant="danger" onClick={onRemove}>
            <Trash2 className="size-3" aria-hidden />
          </IconButton>
        </div>

        <div className="mt-1 flex items-center gap-1 pl-5">
          <InlineEdit
            label={`${exercise.name} set sayısı`}
            value={exercise.targetSets}
            type="number"
            min={1}
            max={20}
            className="h-6 w-10 text-xs"
            align="right"
            onCommit={(v) => Number(v) >= 1 && onPatch({ targetSets: Math.min(20, Math.round(Number(v))) })}
          />
          <span className="text-[11px] text-subtle" aria-hidden>
            ×
          </span>
          <InlineEdit
            label={`${exercise.name} tekrar sayısı`}
            value={exercise.targetReps}
            type="number"
            min={1}
            max={600}
            className="h-6 w-12 text-xs"
            align="right"
            onCommit={(v) => Number(v) >= 1 && onPatch({ targetReps: Math.min(600, Math.round(Number(v))) })}
          />
          <span className="ml-1 text-[11px] text-subtle">RIR</span>
          <InlineEdit
            label={`${exercise.name} RIR`}
            value={exercise.targetRIR ?? "—"}
            type="number"
            min={0}
            max={10}
            className="h-6 w-9 text-xs"
            align="right"
            onCommit={(v) => onPatch({ targetRIR: v === "" || Number.isNaN(Number(v)) ? null : Math.min(10, Math.max(0, Math.round(Number(v)))) })}
          />
        </div>

        {exercise.muscles.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1 pl-5">
            {exercise.muscles.map((m) => {
              const muscle = colorOf.get(m.key);
              return (
                <span
                  key={m.key}
                  title={`${muscle?.name ?? m.key} · yük ${num(m.load, 2)} · ${num(exercise.targetSets * m.load, 2)} set`}
                  className={cx("inline-flex items-center gap-1 rounded text-[10px]", muscle ? "text-subtle" : "text-danger")}
                >
                  <span aria-hidden className="size-1.5 rounded-full" style={{ background: muscle?.color ?? "currentColor" }} />
                  {muscle?.short ?? m.key}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </Reorder.Item>
  );
}
