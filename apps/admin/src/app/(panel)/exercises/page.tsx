"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import type { ExerciseDTO } from "@fitfloow/core";
import { useDebounced } from "@/hooks/useDebounced";
import { num } from "@/lib/format";
import { errorMessage, useDeleteExercise, useExercises, useMuscles } from "@/lib/queries";
import { PageHeader } from "@/components/layout/PanelShell";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/Overlay";
import { SearchInput } from "@/components/ui/SearchInput";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/Table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { ExerciseDialog } from "./ExerciseDialog";

const METRIC_TR = { reps: "Tekrar", time: "Süre", stretch: "Mobilite" } as const;
const KIND_TONE = { strength: "brand", cardio: "info", mobility: "neutral" } as const;
const KIND_TR = { strength: "Kuvvet", cardio: "Kardiyo", mobility: "Mobilite" } as const;

export default function ExercisesPage() {
  const [query, setQuery] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("");
  const debounced = useDebounced(query);

  const muscles = useMuscles();
  const { data, isLoading, isError, error, refetch } = useExercises({ q: debounced || undefined, muscle: muscleFilter || undefined });

  const [dialog, setDialog] = useState<{ open: boolean; exercise: ExerciseDTO | null; seq: number }>({ open: false, exercise: null, seq: 0 });
  const [toDelete, setToDelete] = useState<ExerciseDTO | null>(null);

  const toast = useToast();
  const remove = useDeleteExercise({
    onDone: () => {
      toast.success("Hareket silindi");
      setToDelete(null);
    },
    onFail: (e) => toast.error("Silinemedi", errorMessage(e)),
  });

  const muscleList = useMemo(() => [...(muscles.data?.muscles ?? [])].sort((a, b) => a.order - b.order), [muscles.data?.muscles]);
  const colorOf = useMemo(() => new Map(muscleList.map((m) => [m.key, m])), [muscleList]);
  const exercises = data?.exercises ?? [];

  const open = (exercise: ExerciseDTO | null) => setDialog((d) => ({ open: true, exercise, seq: d.seq + 1 }));

  return (
    <>
      <PageHeader
        eyebrow="Katalog"
        title="Hareketler"
        description="Her hareketin kas yükleri haftalık hacim ve yenilenme hesabını besler. Yük 1 = tam, 0,5 = yarım."
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} placeholder="Hareket veya ekipman…" className="w-56" />
            <Select value={muscleFilter} onChange={(e) => setMuscleFilter(e.target.value)} aria-label="Kasa göre filtrele" className="w-40">
              <option value="">Tüm kaslar</option>
              {muscleList.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name}
                </option>
              ))}
            </Select>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => open(null)}>
              Yeni hareket
            </Button>
          </>
        }
      />

      <Card>
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH width="18rem">Hareket</TH>
                <TH>Kas yükleri</TH>
                <TH align="right" width="7rem">
                  Varsayılan
                </TH>
                <TH width="7rem">Ölçüm</TH>
                <TH width="7rem">Tür</TH>
                <TH align="right" width="6rem">
                  İşlem
                </TH>
              </tr>
            </THead>

            {isLoading ? (
              <TableSkeleton rows={8} cols={6} />
            ) : (
              <tbody>
                {exercises.map((ex) => (
                  <TR key={ex.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{ex.name}</span>
                        {!ex.active && <Badge tone="neutral">Pasif</Badge>}
                      </div>
                      {ex.equipment.length > 0 && <p className="mt-0.5 text-xs text-subtle">{ex.equipment.join(" · ")}</p>}
                    </TD>
                    <TD>
                      {ex.muscles.length === 0 ? (
                        <span className="text-subtle">—</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          {ex.muscles.map((m) => {
                            const muscle = colorOf.get(m.key);
                            return (
                              <span
                                key={m.key}
                                className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px]"
                                title={`${muscle?.name ?? m.key}: ${num(m.load, 2)} yük`}
                              >
                                <span aria-hidden className="size-1.5 rounded-full" style={{ background: muscle?.color ?? "var(--ff-text-subtle)" }} />
                                <span className={muscle ? "text-muted" : "text-danger"}>{muscle?.short ?? m.key}</span>
                                <span className="tnum text-subtle">{num(m.load, 1)}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </TD>
                    <TD align="right" numeric className="text-muted">
                      {ex.defaultSets} × {ex.defaultReps}
                      {ex.metric === "time" ? " sn" : ""}
                    </TD>
                    <TD className="text-muted">{METRIC_TR[ex.metric]}</TD>
                    <TD>
                      <Badge tone={KIND_TONE[ex.kind]}>{KIND_TR[ex.kind]}</Badge>
                    </TD>
                    <TD align="right">
                      <div className="flex items-center justify-end gap-0.5">
                        <IconButton label={`${ex.name} düzenle`} size="sm" onClick={() => open(ex)}>
                          <Pencil className="size-3.5" aria-hidden />
                        </IconButton>
                        <IconButton label={`${ex.name} sil`} size="sm" variant="danger" onClick={() => setToDelete(ex)}>
                          <Trash2 className="size-3.5" aria-hidden />
                        </IconButton>
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            )}
          </Table>
        </TableWrap>

        {isError && <ErrorState error={error} onRetry={() => void refetch()} />}
        {!isLoading && !isError && exercises.length === 0 && (
          <EmptyState
            icon={<SlidersHorizontal className="size-5" aria-hidden />}
            title={debounced || muscleFilter ? "Eşleşen hareket yok" : "Hareket kataloğu boş"}
            description={
              debounced || muscleFilter
                ? "Filtreleri temizleyip tekrar dene ya da yeni bir hareket ekle."
                : "İlk hareketi ekle; program şablonları bu katalogdan beslenir."
            }
            action={
              <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => open(null)}>
                Yeni hareket
              </Button>
            }
          />
        )}
      </Card>

      {!isLoading && exercises.length > 0 && <p className="mt-3 text-xs text-subtle">{exercises.length} hareket</p>}

      <ExerciseDialog
        key={dialog.seq}
        open={dialog.open}
        exercise={dialog.exercise}
        muscles={muscleList}
        onClose={() => setDialog((d) => ({ ...d, open: false }))}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        pending={remove.isPending}
        title="Hareketi sil"
        message={`“${toDelete?.name ?? ""}” katalogdan kaldırılacak. Bu hareketi kullanan program şablonları etkilenmez ama yeni şablonlarda seçilemez.`}
      />
    </>
  );
}
