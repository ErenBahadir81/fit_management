"use client";

import { useMemo, useState } from "react";
import type { ExerciseDTO, ExerciseInput, MuscleDTO } from "@fitfloow/core";
import { toMusclePayload } from "@/lib/muscleLoad";
import { errorMessage, useExercise, useSaveExercise } from "@/lib/queries";
import { Button } from "@/components/ui/Button";
import { Field, Input, NumberInput, Select, Switch, Textarea } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Overlay";
import { Callout } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { MuscleLoadEditor, type ReferenceState } from "./MuscleLoadEditor";

const METRIC_TR = { reps: "Tekrar", time: "Süre (sn)", stretch: "Mobilite" } as const;
const KIND_TR = { strength: "Kuvvet", cardio: "Kardiyo", mobility: "Mobilite" } as const;

export function ExerciseDialog({
  open,
  onClose,
  exercise,
  muscles,
}: {
  open: boolean;
  onClose: () => void;
  exercise: ExerciseDTO | null;
  muscles: MuscleDTO[];
}) {
  const isEdit = Boolean(exercise);
  const toast = useToast();
  const [name, setName] = useState(exercise?.name ?? "");
  const [sets, setSets] = useState(String(exercise?.defaultSets ?? 3));
  const [reps, setReps] = useState(String(exercise?.defaultReps ?? 10));
  const [metric, setMetric] = useState<ExerciseDTO["metric"]>(exercise?.metric ?? "reps");
  const [kind, setKind] = useState<ExerciseDTO["kind"]>(exercise?.kind ?? "strength");
  const [equipment, setEquipment] = useState((exercise?.equipment ?? []).join(", "));
  const [instructions, setInstructions] = useState(exercise?.instructions ?? "");
  const [active, setActive] = useState(exercise?.active ?? true);
  const [loads, setLoads] = useState<Record<string, number>>(
    () => Object.fromEntries((exercise?.muscles ?? []).map((m) => [m.key, m.load])) as Record<string, number>
  );
  const [error, setError] = useState<string | null>(null);

  // The literature values this exercise was seeded with (read-only; null for admin-made ones).
  const detail = useExercise(exercise?.id ?? null);
  const reference: ReferenceState = !exercise
    ? { status: "none" }
    : detail.isError
      ? { status: "error" }
      : detail.data
        ? { status: "ready", reference: detail.data.reference }
        : { status: "loading" };
  const muscleOrder = useMemo(() => [...muscles].sort((a, b) => a.order - b.order).map((m) => m.key), [muscles]);

  const save = useSaveExercise({
    onDone: () => {
      toast.success(isEdit ? "Hareket güncellendi" : "Hareket eklendi", name);
      onClose();
    },
    onFail: (e) => setError(errorMessage(e)),
  });

  const setLoad = (key: string, value: number | null) =>
    setLoads((prev) => {
      const next = { ...prev };
      if (value === null || value <= 0) delete next[key];
      else next[key] = value;
      return next;
    });

  const submit = () => {
    if (!name.trim()) {
      setError("Hareket adı boş olamaz.");
      return;
    }
    const setCount = Number(sets);
    const repCount = Number(reps);
    if (!Number.isInteger(setCount) || setCount < 1 || setCount > 20) {
      setError("Varsayılan set sayısı 1 ile 20 arasında olmalı.");
      return;
    }
    if (!Number.isInteger(repCount) || repCount < 1 || repCount > 600) {
      setError("Varsayılan tekrar 1 ile 600 arasında olmalı.");
      return;
    }
    if (kind === "strength" && Object.keys(loads).length === 0) {
      setError("Kuvvet hareketleri en az bir kasa yük vermeli.");
      return;
    }
    setError(null);
    const input: ExerciseInput = {
      name: name.trim(),
      muscles: toMusclePayload(loads, muscleOrder),
      defaultSets: setCount,
      defaultReps: repCount,
      metric,
      kind,
      equipment: equipment
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      instructions: instructions.trim(),
      active,
    };
    save.mutate({ id: exercise?.id ?? null, input });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Hareketi düzenle" : "Yeni hareket"}
      description="Kas yükü 0 ile 1 arasında, 0,05 adımla: 1 tam set sayılır, 0,5 yarım set. Haftalık hacim set × yük olarak hesaplanır."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>
            {isEdit ? "Kaydet" : "Ekle"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Callout tone="danger">{error}</Callout>}

        <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="Hareket adı" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bench Press" data-autofocus />
          </Field>
          <Field label="Varsayılan set">
            <NumberInput min={1} max={20} value={sets} onChange={(e) => setSets(e.target.value)} />
          </Field>
          <Field label={metric === "time" ? "Varsayılan süre" : "Varsayılan tekrar"}>
            <NumberInput min={1} max={600} unit={metric === "time" ? "sn" : undefined} value={reps} onChange={(e) => setReps(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ölçüm">
            <Select value={metric} onChange={(e) => setMetric(e.target.value as ExerciseDTO["metric"])}>
              {Object.entries(METRIC_TR).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tür">
            <Select value={kind} onChange={(e) => setKind(e.target.value as ExerciseDTO["kind"])}>
              {Object.entries(KIND_TR).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Ekipman" hint="Virgülle ayır: barbell, bench">
          <Input value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="barbell, bench" />
        </Field>

        <MuscleLoadEditor muscles={muscles} loads={loads} onChange={setLoad} onReplaceAll={setLoads} reference={reference} />

        <Field label="Anlatım" hint="Mobil uygulamada hareket kartında gösterilir.">
          <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} placeholder="Kürek kemiklerini sıkıştır…" />
        </Field>

        <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3.5 py-3">
          <div>
            <p className="text-[13px] font-medium text-ink">Katalogda görünür</p>
            <p className="mt-0.5 text-xs text-muted">Pasif hareketler program düzenleyicide listelenmez.</p>
          </div>
          <Switch checked={active} onChange={setActive} label="Aktif" />
        </div>
      </div>
    </Dialog>
  );
}
