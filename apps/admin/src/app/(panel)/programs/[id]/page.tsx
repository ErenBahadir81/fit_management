"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, Plus, Save } from "lucide-react";
import type { DayDTO, ExerciseDTO, ExerciseTargetDTO, MuscleDTO, ProgramTemplateDTO } from "@fitfloow/core";
import { cx } from "@/lib/cx";
import { errorMessage, useDuplicateTemplate, useMuscles, useSaveTemplate, useTemplate } from "@/lib/queries";
import { PageHeader } from "@/components/layout/PanelShell";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/Overlay";
import { CardSkeleton, ErrorState, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { DayColumn } from "./DayColumn";
import { ExercisePicker, toTarget } from "./ExercisePicker";
import { VolumeMatrix } from "./VolumeMatrix";

export default function ProgramBuilderPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const template = useTemplate(id);
  const muscles = useMuscles();

  if (template.isError) {
    return (
      <Card>
        <ErrorState error={template.error} onRetry={() => void template.refetch()} />
      </Card>
    );
  }

  if (template.isLoading || !template.data) {
    return (
      <>
        <PageHeader eyebrow="Program şablonu" title="Yükleniyor…" />
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Skeleton className="h-96 w-full rounded-xl" />
          <Card className="p-5">
            <CardSkeleton lines={6} />
          </Card>
        </div>
      </>
    );
  }

  return (
    // Remounting on a new server version resets the draft to saved truth without an effect.
    <Builder
      key={`${template.data.template.id}:${template.data.template.updatedAt}`}
      template={template.data.template}
      muscles={[...(muscles.data?.muscles ?? [])].sort((a, b) => a.order - b.order)}
    />
  );
}

interface Draft {
  name: string;
  description: string;
  tags: string[];
  days: DayDTO[];
}

function emptyDay(order: number): DayDTO {
  return { order, title: `${order}. Gün`, focus: "", kind: "strength", exercises: [], run: null, swim: null };
}

function Builder({ template, muscles }: { template: ProgramTemplateDTO; muscles: MuscleDTO[] }) {
  const router = useRouter();
  const toast = useToast();

  const initial = useMemo<Draft>(
    () => ({ name: template.name, description: template.description, tags: [...template.tags], days: structuredClone(template.days) }),
    [template]
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [picker, setPicker] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);

  // Browser-level guard; in-app navigation is guarded by the banner + confirm below.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const save = useSaveTemplate({
    onDone: () => toast.success("Şablon kaydedildi", draft.name),
    onFail: (e) => toast.error("Kaydedilemedi", errorMessage(e)),
  });
  const duplicate = useDuplicateTemplate({
    onDone: () => toast.success("Şablon kopyalandı"),
    onFail: (e) => toast.error("Kopyalanamadı", errorMessage(e)),
  });

  const patchDays = (fn: (days: DayDTO[]) => DayDTO[]) =>
    setDraft((prev) => ({ ...prev, days: fn(structuredClone(prev.days)).map((d, i) => ({ ...d, order: i + 1 })) }));

  const patchDay = (index: number, patch: Partial<DayDTO>) =>
    patchDays((days) => {
      days[index] = { ...days[index], ...patch };
      // Cardio targets only make sense on their own day kind.
      if (patch.kind) {
        if (patch.kind !== "run") days[index].run = null;
        if (patch.kind !== "swim") days[index].swim = null;
        if (patch.kind === "run" && !days[index].run) days[index].run = { targetKm: 5, targetMin: 30, label: "Koşu" };
        if (patch.kind === "swim" && !days[index].swim) days[index].swim = { targetKm: 1, targetMin: 35, label: "Yüzme" };
      }
      return days;
    });

  const addDay = () => patchDays((days) => [...days, emptyDay(days.length + 1)]);
  const removeDay = (index: number) => patchDays((days) => days.filter((_, i) => i !== index));
  const moveDay = (index: number, delta: number) =>
    patchDays((days) => {
      const target = index + delta;
      if (target < 0 || target >= days.length) return days;
      const [item] = days.splice(index, 1);
      days.splice(target, 0, item);
      return days;
    });

  const addExercise = (dayIndex: number, exercise: ExerciseDTO) =>
    patchDays((days) => {
      days[dayIndex].exercises = [...days[dayIndex].exercises, toTarget(exercise)];
      return days;
    });
  const patchExercise = (dayIndex: number, exIndex: number, patch: Partial<ExerciseTargetDTO>) =>
    patchDays((days) => {
      days[dayIndex].exercises[exIndex] = { ...days[dayIndex].exercises[exIndex], ...patch };
      return days;
    });
  const removeExercise = (dayIndex: number, exIndex: number) =>
    patchDays((days) => {
      days[dayIndex].exercises = days[dayIndex].exercises.filter((_, i) => i !== exIndex);
      return days;
    });
  const reorderExercises = (dayIndex: number, next: ExerciseTargetDTO[]) =>
    patchDays((days) => {
      days[dayIndex].exercises = next;
      return days;
    });
  const moveExercise = (dayIndex: number, exIndex: number, delta: number) =>
    patchDays((days) => {
      const target = dayIndex + delta;
      if (target < 0 || target >= days.length) return days;
      const [item] = days[dayIndex].exercises.splice(exIndex, 1);
      days[target].exercises = [...days[target].exercises, item];
      return days;
    });

  const submit = () => {
    if (!draft.name.trim()) {
      toast.error("Şablon adı boş olamaz");
      return;
    }
    save.mutate({
      id: template.id,
      input: { name: draft.name.trim(), description: draft.description.trim(), tags: draft.tags, days: draft.days },
    });
  };

  return (
    <>
      <PageHeader
        eyebrow="Program şablonu"
        title={draft.name || "Adsız şablon"}
        description={`${draft.days.length} günlük döngü · ${draft.days.reduce((s, d) => s + d.exercises.length, 0)} hareket`}
        actions={
          <>
            <Button
              size="sm"
              icon={<ArrowLeft className="size-3.5" />}
              onClick={() => (dirty ? setLeaving(true) : router.push("/programs"))}
            >
              Listeye dön
            </Button>
            <Button size="sm" icon={<Copy className="size-3.5" />} onClick={() => duplicate.mutate(template.id)} loading={duplicate.isPending}>
              Kopyala
            </Button>
            <Button variant="primary" size="sm" icon={<Save className="size-3.5" />} onClick={submit} loading={save.isPending} disabled={!dirty}>
              {dirty ? "Kaydet" : "Kaydedildi"}
            </Button>
          </>
        }
      />

      {dirty && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/30 bg-warn-soft px-4 py-2.5">
          <p className="text-[13px] text-ink">Kaydedilmemiş değişiklikler var. Sayfadan ayrılırsan kaybolur.</p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraft(initial)}>
              Geri al
            </Button>
            <Button size="sm" variant="primary" onClick={submit} loading={save.isPending}>
              Kaydet
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_19rem]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.07em] text-subtle">Döngü günleri</h2>
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={addDay} disabled={draft.days.length >= 14}>
              Gün ekle
            </Button>
          </div>

          <div className="ff-scroll-x -mx-1 px-1 pb-2">
            <div className="flex items-start gap-3">
              {draft.days.map((day, index) => (
                <DayColumn
                  key={index}
                  day={day}
                  index={index}
                  total={draft.days.length}
                  muscles={muscles}
                  onPatch={(patch) => patchDay(index, patch)}
                  onMoveDay={(delta) => moveDay(index, delta)}
                  onRemoveDay={() => removeDay(index)}
                  onAddExercise={() => setPicker(index)}
                  onPatchExercise={(exIndex, patch) => patchExercise(index, exIndex, patch)}
                  onRemoveExercise={(exIndex) => removeExercise(index, exIndex)}
                  onReorderExercises={(next) => reorderExercises(index, next)}
                  onMoveExercise={(exIndex, delta) => moveExercise(index, exIndex, delta)}
                />
              ))}
              <button
                type="button"
                onClick={addDay}
                disabled={draft.days.length >= 14}
                className={cx(
                  "flex h-28 w-40 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line text-xs font-medium text-muted transition-colors",
                  draft.days.length >= 14 ? "cursor-not-allowed opacity-50" : "hover:border-brand-line hover:bg-brand-soft/40 hover:text-brand-text"
                )}
              >
                <Plus className="size-4" aria-hidden />
                Gün ekle
              </button>
            </div>
          </div>
        </div>

        <Card className="h-fit">
          <CardHeader eyebrow="Şablon" title="Bilgiler" />
          <div className="space-y-4 p-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tpl-name" className="text-[13px] font-medium text-ink">
                Ad
              </label>
              <Input id="tpl-name" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tpl-desc" className="text-[13px] font-medium text-ink">
                Açıklama
              </label>
              <Textarea id="tpl-desc" rows={3} value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tpl-tags" className="text-[13px] font-medium text-ink">
                Etiketler
              </label>
              <Input
                id="tpl-tags"
                value={draft.tags.join(", ")}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="ppl, salon, orta"
              />
              <p className="text-xs text-subtle">Virgülle ayır.</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          eyebrow="Canlı hesap"
          title="Haftalık hacim matrisi"
          description="Set × kas yükü toplamı. Döngü 7 günden farklıysa haftaya oranlanır ve hedef bandıyla karşılaştırılır."
        />
        <VolumeMatrix days={draft.days} muscles={muscles} />
      </Card>

      <ExercisePicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        onPick={(exercise) => picker !== null && addExercise(picker, exercise)}
        muscles={muscles}
        dayTitle={picker !== null ? (draft.days[picker]?.title ?? "") : ""}
      />

      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false);
          router.push("/programs");
        }}
        danger={false}
        confirmLabel="Yine de çık"
        title="Kaydedilmemiş değişiklikler"
        message="Bu şablonda kaydedilmemiş değişiklikler var. Çıkarsan bunlar kaybolur."
      />
    </>
  );
}
