"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ExerciseDTO, ExerciseTargetDTO, MuscleDTO } from "@fitfloow/core";
import { fold } from "@/components/layout/CommandPalette";
import { num } from "@/lib/format";
import { useExercises } from "@/lib/queries";
import { Dialog } from "@/components/ui/Overlay";
import { CardSkeleton, EmptyState } from "@/components/ui/States";

export function toTarget(exercise: ExerciseDTO): ExerciseTargetDTO {
  return {
    name: exercise.name,
    muscles: exercise.muscles,
    targetSets: exercise.defaultSets,
    targetReps: exercise.defaultReps,
    targetRIR: exercise.metric === "reps" ? 2 : null,
    metric: exercise.metric,
  };
}

export function ExercisePicker({
  open,
  onClose,
  onPick,
  muscles,
  dayTitle,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: ExerciseDTO) => void;
  muscles: MuscleDTO[];
  dayTitle: string;
}) {
  const [query, setQuery] = useState("");
  const { data, isLoading } = useExercises();
  const colorOf = useMemo(() => new Map(muscles.map((m) => [m.key, m])), [muscles]);

  const results = useMemo(() => {
    const all = (data?.exercises ?? []).filter((e) => e.active);
    const q = fold(query);
    if (!q) return all;
    return all.filter((e) => fold(`${e.name} ${e.equipment.join(" ")} ${e.muscles.map((m) => colorOf.get(m.key)?.name ?? "").join(" ")}`).includes(q));
  }, [data?.exercises, query, colorOf]);

  return (
    <Dialog open={open} onClose={onClose} title="Hareket ekle" description={`“${dayTitle}” gününe eklenecek.`} size="md">
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3">
        <Search className="size-4 shrink-0 text-subtle" aria-hidden />
        <input
          data-autofocus
          type="text"
          aria-label="Hareket ara"
          placeholder="Hareket, kas veya ekipman…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-subtle"
        />
      </div>

      {isLoading ? (
        <CardSkeleton lines={6} />
      ) : results.length === 0 ? (
        <EmptyState compact mascot={false} title="Eşleşen hareket yok" description="Farklı bir arama dene veya Hareketler sayfasından yeni bir hareket ekle." />
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {results.map((ex) => (
            <li key={ex.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(ex);
                  onClose();
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:border-line hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{ex.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {ex.muscles.map((m) => (
                      <span key={m.key} className="inline-flex items-center gap-1 text-[10px] text-subtle">
                        <span aria-hidden className="size-1.5 rounded-full" style={{ background: colorOf.get(m.key)?.color ?? "currentColor" }} />
                        {colorOf.get(m.key)?.short ?? m.key} {num(m.load, 1)}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="shrink-0 text-xs tnum text-muted">
                  {ex.defaultSets} × {ex.defaultReps}
                  {ex.metric === "time" ? " sn" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
