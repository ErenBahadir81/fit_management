"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { CalendarDays, Copy, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import type { ProgramTemplateDTO } from "@fitfloow/core";
import { itemEnter, listEnter } from "@/lib/motion";
import { date, num } from "@/lib/format";
import { templateVolume, totalPlannedSets } from "@/lib/volume";
import { errorMessage, useDeleteTemplate, useDuplicateTemplate, useMuscles, useSaveTemplate, useTemplates } from "@/lib/queries";
import { PageHeader } from "@/components/layout/PanelShell";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { ConfirmDialog, Dialog } from "@/components/ui/Overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";

export default function ProgramsPage() {
  const { data, isLoading, isError, error, refetch } = useTemplates();
  const muscles = useMuscles();
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ProgramTemplateDTO | null>(null);

  const muscleList = useMemo(() => [...(muscles.data?.muscles ?? [])].sort((a, b) => a.order - b.order), [muscles.data?.muscles]);

  const duplicate = useDuplicateTemplate({
    onDone: () => toast.success("Şablon kopyalandı"),
    onFail: (e) => toast.error("Kopyalanamadı", errorMessage(e)),
  });
  const remove = useDeleteTemplate({
    onDone: () => {
      toast.success("Şablon silindi");
      setToDelete(null);
    },
    onFail: (e) => toast.error("Silinemedi", errorMessage(e)),
  });

  const templates = data?.templates ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Katalog"
        title="Program şablonları"
        description="Şablonlar kullanıcılara atanır. Döngü uzunluğu serbest: 4 günlük de olabilir 14 günlük de."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
            Yeni şablon
          </Button>
        }
      />

      {isError ? (
        <Card>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      ) : isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Layers className="size-5" aria-hidden />}
            title="Henüz şablon yok"
            description="Bir şablon oluştur, günleri ve hareketleri ekle; haftalık hacim matrisi hedeflerle karşılaştırsın."
            action={
              <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
                Yeni şablon
              </Button>
            }
          />
        </Card>
      ) : (
        <motion.ul variants={listEnter} initial="hidden" animate="show" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => {
            const rows = templateVolume(t.days, muscleList).filter((r) => r.cycleSets > 0);
            const top = [...rows].sort((a, b) => b.weeklySets - a.weeklySets).slice(0, 5);
            const restDays = t.days.filter((d) => d.kind === "rest").length;
            return (
              <motion.li key={t.id} variants={itemEnter}>
                <Card className="flex h-full flex-col">
                  <div className="flex-1 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/programs/${t.id}`} className="min-w-0 rounded">
                        <h3 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink hover:text-brand-text">{t.name}</h3>
                      </Link>
                      <Badge tone="neutral">{t.cycleLength} gün</Badge>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted">{t.description || "Açıklama yok."}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {t.tags.map((tag) => (
                        <span key={tag} className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-subtle">
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                      <div>
                        <dt className="ff-eyebrow">Set</dt>
                        <dd className="mt-0.5 text-[15px] font-semibold tnum text-ink">{num(totalPlannedSets(t.days))}</dd>
                      </div>
                      <div>
                        <dt className="ff-eyebrow">Hareket</dt>
                        <dd className="mt-0.5 text-[15px] font-semibold tnum text-ink">{num(t.days.reduce((s, d) => s + d.exercises.length, 0))}</dd>
                      </div>
                      <div>
                        <dt className="ff-eyebrow">Dinlenme</dt>
                        <dd className="mt-0.5 text-[15px] font-semibold tnum text-ink">{num(restDays)}</dd>
                      </div>
                    </dl>

                    {top.length > 0 && (
                      <div className="mt-3">
                        <p className="ff-eyebrow mb-1.5">Ağırlıklı kaslar</p>
                        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                          {top.map((r) => (
                            <span
                              key={r.key}
                              title={`${r.name}: ${num(r.weeklySets, 1)} set/hafta`}
                              style={{ background: r.color, width: `${(r.weeklySets / top.reduce((s, x) => s + x.weeklySets, 0)) * 100}%` }}
                            />
                          ))}
                        </div>
                        <p className="mt-1.5 truncate text-[11px] text-subtle">{top.map((r) => r.short).join(" · ")}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-2 px-4 py-2.5">
                    <span className="text-[11px] text-subtle">Güncellendi {date(t.updatedAt)}</span>
                    <div className="flex items-center gap-0.5">
                      <IconButton label={`${t.name} kopyala`} size="sm" onClick={() => duplicate.mutate(t.id)}>
                        <Copy className="size-3.5" aria-hidden />
                      </IconButton>
                      <IconButton label={`${t.name} sil`} size="sm" variant="danger" onClick={() => setToDelete(t)}>
                        <Trash2 className="size-3.5" aria-hidden />
                      </IconButton>
                      <Link
                        href={`/programs/${t.id}`}
                        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-ink transition-colors hover:border-line-strong"
                      >
                        <Pencil className="size-3" aria-hidden />
                        Düzenle
                      </Link>
                    </div>
                  </div>
                </Card>
              </motion.li>
            );
          })}
        </motion.ul>
      )}

      <CreateTemplateDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        pending={remove.isPending}
        title="Şablonu sil"
        message={`“${toDelete?.name ?? ""}” silinecek. Bu şablondan üretilmiş kullanıcı programları etkilenmez.`}
      />
    </>
  );
}

function CreateTemplateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [days, setDays] = useState("7");
  const [error, setError] = useState<string | null>(null);

  const save = useSaveTemplate({
    onFail: (e) => setError(errorMessage(e)),
  });

  const submit = async () => {
    if (!name.trim()) {
      setError("Şablon adı boş olamaz.");
      return;
    }
    const count = Math.min(14, Math.max(1, Number(days) || 7));
    setError(null);
    const result = await save.mutateAsync({
      id: null,
      input: {
        name: name.trim(),
        description: description.trim(),
        tags: [],
        days: Array.from({ length: count }, (_, i) => ({
          order: i + 1,
          title: `${i + 1}. Gün`,
          focus: "",
          kind: "strength" as const,
          exercises: [],
          run: null,
          swim: null,
        })),
      },
    });
    toast.success("Şablon oluşturuldu", name.trim());
    onClose();
    router.push(`/programs/${result.template.id}`);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Yeni program şablonu"
      description="Boş günlerle başla; sonraki adımda hareketleri ekleyeceksin."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={save.isPending}>
            Oluştur ve düzenle
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
        <Field label="Ad" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Push / Pull / Bacak — 7 gün" data-autofocus />
        </Field>
        <Field label="Açıklama">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kimin için, hangi seviye…" />
        </Field>
        <Field label="Döngü uzunluğu" hint="1-14 gün. Sonradan değiştirebilirsin.">
          <Input type="number" min={1} max={14} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-subtle">
        <CalendarDays className="size-3.5" aria-hidden />
        Döngü tekrar eder; hafta kavramına bağlı değildir.
      </div>
    </Dialog>
  );
}
