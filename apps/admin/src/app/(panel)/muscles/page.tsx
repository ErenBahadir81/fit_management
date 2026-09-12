"use client";

import { useMemo, useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import { ChevronDown, ChevronUp, Dumbbell, GripVertical, Plus, Trash2 } from "lucide-react";
import type { MuscleDTO } from "@fitfloow/core";
import { cx } from "@/lib/cx";
import { num } from "@/lib/format";
import { spring } from "@/lib/motion";
import { errorMessage, useCreateMuscle, useDeleteMuscle, useMuscles, useReorderMuscles, useUpdateMuscle } from "@/lib/queries";
import { PageHeader } from "@/components/layout/PanelShell";
import { RecoveryCurve } from "@/components/charts/RecoveryCurve";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, NumberInput, Segmented, Select, Switch } from "@/components/ui/Field";
import { ConfirmDialog, Dialog } from "@/components/ui/Overlay";
import { InlineEdit } from "@/components/ui/Table";
import { Callout, EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";

const REGION_TR: Record<MuscleDTO["region"], string> = {
  front: "Ön",
  back: "Arka",
  legs: "Bacak",
  core: "Gövde",
  arms: "Kol",
};

export default function MusclesPage() {
  const { data, isLoading, isError, error, refetch } = useMuscles();
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<MuscleDTO | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const muscles = useMemo(() => [...(data?.muscles ?? [])].sort((a, b) => a.order - b.order), [data?.muscles]);

  const reorder = useReorderMuscles({
    onFail: (e) => toast.error("Sıralama kaydedilemedi", errorMessage(e)),
  });
  const update = useUpdateMuscle({
    onFail: (e) => toast.error("Güncellenemedi", errorMessage(e)),
  });
  const remove = useDeleteMuscle({
    onDone: () => {
      toast.success("Kas silindi");
      setToDelete(null);
    },
    onFail: (e) => toast.error("Silinemedi", errorMessage(e)),
  });

  const commitOrder = (next: MuscleDTO[]) => reorder.mutate(next.map((m) => m.key));

  const move = (key: string, delta: number) => {
    const index = muscles.findIndex((m) => m.key === key);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= muscles.length) return;
    const next = [...muscles];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    commitOrder(next);
  };

  return (
    <>
      <PageHeader
        eyebrow="Katalog"
        title="Kaslar"
        description="Sıra mobil uygulamadaki listeyi belirler. Toparlanma süresi yenilenme eğrisini, haftalık hedef hacim rozetlerini besler."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
            Yeni kas
          </Button>
        }
      />

      {isError ? (
        <Card>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      ) : isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : muscles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Dumbbell className="size-5" aria-hidden />}
            title="Kas kataloğu boş"
            description="En az bir kas tanımla; hareket yükleri ve haftalık hacim hesapları buna dayanır."
            action={
              <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
                Yeni kas
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-3 hidden items-center gap-4 px-4 text-[11px] uppercase tracking-[0.07em] text-subtle lg:flex">
            <span className="w-16">Sıra</span>
            <span className="flex-1">Kas</span>
            <span className="w-24">Bölge</span>
            <span className="w-28 text-right">Boyut</span>
            <span className="w-24 text-right">Yenilenme</span>
            <span className="w-32 text-right">Haftalık hedef</span>
            <span className="w-28 text-right">Durum</span>
          </div>

          <Reorder.Group axis="y" values={muscles} onReorder={commitOrder} as="ul" className="flex flex-col gap-2">
            {muscles.map((muscle, index) => (
              <MuscleRow
                key={muscle.key}
                muscle={muscle}
                index={index}
                total={muscles.length}
                expanded={expanded === muscle.key}
                onToggleExpand={() => setExpanded((prev) => (prev === muscle.key ? null : muscle.key))}
                onMove={move}
                onPatch={(input) => update.mutate({ key: muscle.key, input })}
                onDelete={() => setToDelete(muscle)}
              />
            ))}
          </Reorder.Group>

          <p className="mt-3 text-xs text-subtle">
            {muscles.length} kas · sürükleyerek ya da ok düğmeleriyle sırala; değişiklikler anında kaydedilir.
          </p>
        </>
      )}

      <CreateMuscleDialog open={createOpen} onClose={() => setCreateOpen(false)} existing={muscles} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.key)}
        pending={remove.isPending}
        title="Kası sil"
        message={`“${toDelete?.name ?? ""}” kataloğdan kaldırılacak. Bu kası kullanan hareketlerdeki yükler geçersiz olur ve hacim hesabından düşer.`}
      />
    </>
  );
}

function MuscleRow({
  muscle,
  index,
  total,
  expanded,
  onToggleExpand,
  onMove,
  onPatch,
  onDelete,
}: {
  muscle: MuscleDTO;
  index: number;
  total: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onMove: (key: string, delta: number) => void;
  onPatch: (input: Partial<Omit<MuscleDTO, "key">>) => void;
  onDelete: () => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item value={muscle} dragListener={false} dragControls={controls} transition={spring} as="li" className="list-none">
      <div className={cx("ff-card overflow-hidden", !muscle.active && "opacity-60")}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
          <div className="flex w-16 shrink-0 items-center gap-1">
            {/* Focusable, so it must also work from the keyboard: the arrow keys move the row
                the same way dragging does, instead of leaving a dead tab stop behind. */}
            <button
              type="button"
              aria-label={`${muscle.name} sırasını değiştir: sürükle ya da yukarı/aşağı ok tuşlarını kullan`}
              onPointerDown={(e) => controls.start(e)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                e.preventDefault();
                onMove(muscle.key, e.key === "ArrowUp" ? -1 : 1);
              }}
              className="cursor-grab touch-none rounded p-1 text-subtle transition-colors hover:text-ink active:cursor-grabbing"
            >
              <GripVertical className="size-4" aria-hidden />
            </button>
            <div className="flex flex-col">
              <button
                type="button"
                aria-label={`${muscle.name} yukarı taşı`}
                disabled={index === 0}
                onClick={() => onMove(muscle.key, -1)}
                className="rounded px-1 text-subtle transition-colors hover:text-ink disabled:opacity-30"
              >
                <ChevronUp className="size-3" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`${muscle.name} aşağı taşı`}
                disabled={index === total - 1}
                onClick={() => onMove(muscle.key, 1)}
                className="rounded px-1 text-subtle transition-colors hover:text-ink disabled:opacity-30"
              >
                <ChevronDown className="size-3" aria-hidden />
              </button>
            </div>
          </div>

          <div className="flex min-w-52 flex-1 items-center gap-3">
            <label className="relative shrink-0 cursor-pointer" title="Renk seç">
              <span className="block size-6 rounded-md border border-line" style={{ background: muscle.color }} aria-hidden />
              <input
                type="color"
                aria-label={`${muscle.name} rengi`}
                value={muscle.color}
                onChange={(e) => onPatch({ color: e.target.value })}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </label>
            <div className="min-w-0 flex-1">
              <InlineEdit label={`${muscle.name} adı`} value={muscle.name} onCommit={(v) => v.trim() && onPatch({ name: v.trim() })} className="font-medium" />
              <div className="flex items-center gap-1.5 pl-2 text-xs text-subtle">
                <code className="font-mono text-[11px]">{muscle.key}</code>
                <span aria-hidden>·</span>
                <InlineEdit label={`${muscle.name} kısa adı`} value={muscle.short} onCommit={(v) => v.trim() && onPatch({ short: v.trim() })} className="h-5 text-xs" />
              </div>
            </div>
          </div>

          <div className="w-24 shrink-0">
            <Badge tone="neutral">{REGION_TR[muscle.region]}</Badge>
          </div>

          <div className="w-28 shrink-0 text-right">
            <Segmented
              size="sm"
              label={`${muscle.name} boyutu`}
              value={muscle.size}
              onChange={(v) => onPatch({ size: v })}
              options={[
                { value: "large", label: "Büyük" },
                { value: "small", label: "Küçük" },
              ]}
            />
          </div>

          <div className="w-24 shrink-0">
            <InlineEdit
              label={`${muscle.name} tam yenilenme süresi (saat)`}
              value={muscle.fullRecoveryHours}
              type="number"
              min={6}
              max={168}
              align="right"
              suffix=" sa"
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isFinite(n) && n >= 6 && n <= 168) onPatch({ fullRecoveryHours: n });
              }}
            />
          </div>

          <div className="flex w-32 shrink-0 items-center justify-end gap-1">
            <InlineEdit
              label={`${muscle.name} haftalık minimum set`}
              value={muscle.weeklyTarget.min ?? 0}
              type="number"
              min={0}
              align="right"
              className="w-12"
              onCommit={(v) => onPatch({ weeklyTarget: { ...muscle.weeklyTarget, min: Number(v) || 0 } })}
            />
            <span className="text-subtle" aria-hidden>
              –
            </span>
            <InlineEdit
              label={`${muscle.name} haftalık maksimum set`}
              value={muscle.weeklyTarget.max}
              type="number"
              min={0}
              align="right"
              className="w-12"
              onCommit={(v) => Number(v) > 0 && onPatch({ weeklyTarget: { ...muscle.weeklyTarget, max: Number(v) } })}
            />
          </div>

          <div className="flex w-28 shrink-0 items-center justify-end gap-1.5">
            <Switch checked={muscle.active} onChange={(v) => onPatch({ active: v })} label={`${muscle.name} aktif`} size="sm" />
            <IconButton label={expanded ? "Eğriyi gizle" : "Yenilenme eğrisini göster"} size="sm" onClick={onToggleExpand}>
              <ChevronDown className={cx("size-3.5 transition-transform duration-150", expanded && "rotate-180")} aria-hidden />
            </IconButton>
            <IconButton label={`${muscle.name} sil`} size="sm" variant="danger" onClick={onDelete}>
              <Trash2 className="size-3.5" aria-hidden />
            </IconButton>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-line bg-surface-2 px-4 py-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="ff-eyebrow">Yenilenme eğrisi</p>
              <p className="text-xs text-muted">
                Yarı sürede (%{70}) {num(muscle.fullRecoveryHours / 2, 1)} sa · tam {num(muscle.fullRecoveryHours)} sa
              </p>
            </div>
            <RecoveryCurve fullRecoveryHours={muscle.fullRecoveryHours} color={muscle.color} />
          </div>
        )}
      </div>
    </Reorder.Item>
  );
}

function CreateMuscleDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: MuscleDTO[] }) {
  const toast = useToast();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  const [region, setRegion] = useState<MuscleDTO["region"]>("front");
  const [size, setSize] = useState<MuscleDTO["size"]>("large");
  const [hours, setHours] = useState("48");
  const [min, setMin] = useState("8");
  const [max, setMax] = useState("16");
  const [color, setColor] = useState("#6d5df6");
  const [error, setError] = useState<string | null>(null);

  const create = useCreateMuscle({
    onDone: () => {
      toast.success("Kas eklendi", name);
      onClose();
    },
    onFail: (e) => setError(errorMessage(e)),
  });

  const submit = () => {
    const trimmedKey = key.trim();
    if (!/^[a-zA-Z][a-zA-Z0-9]{1,31}$/.test(trimmedKey)) {
      setError("Anahtar camelCase olmalı (örn. rearDelt) ve 2-32 karakter arası.");
      return;
    }
    if (existing.some((m) => m.key === trimmedKey)) {
      setError("Bu anahtar zaten kullanılıyor.");
      return;
    }
    if (!name.trim()) {
      setError("Kas adı boş olamaz.");
      return;
    }
    if (Number(max) <= 0) {
      setError("Haftalık maksimum set 0'dan büyük olmalı.");
      return;
    }
    setError(null);
    create.mutate({
      key: trimmedKey,
      name: name.trim(),
      short: (short.trim() || name.trim()).slice(0, 12),
      size,
      fullRecoveryHours: Number(hours) || 48,
      weeklyTarget: { min: Number(min) || 0, max: Number(max) },
      region,
      color,
      active: true,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Yeni kas"
      description="Anahtar sonradan değiştirilemez; hareket yükleri bu anahtara bağlanır."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={submit} loading={create.isPending}>
            Ekle
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Callout tone="danger">{error}</Callout>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Anahtar" required hint="camelCase, örn. rearDelt">
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="rearDelt" spellCheck={false} data-autofocus />
          </Field>
          <Field label="Ad" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Arka Omuz" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Kısa ad">
            <Input value={short} onChange={(e) => setShort(e.target.value)} placeholder="Arka Omz" />
          </Field>
          <Field label="Bölge">
            <Select value={region} onChange={(e) => setRegion(e.target.value as MuscleDTO["region"])}>
              {Object.entries(REGION_TR).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Boyut" hint="Büyük kaslar daha uzun toparlanır.">
            <Select value={size} onChange={(e) => setSize(e.target.value as MuscleDTO["size"])}>
              <option value="large">Büyük</option>
              <option value="small">Küçük</option>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tam yenilenme" hint="6-168 saat">
            <NumberInput unit="sa" min={6} max={168} value={hours} onChange={(e) => setHours(e.target.value)} />
          </Field>
          <Field label="Haftalık min set">
            <NumberInput min={0} value={min} onChange={(e) => setMin(e.target.value)} />
          </Field>
          <Field label="Haftalık maks set" required>
            <NumberInput min={1} value={max} onChange={(e) => setMax(e.target.value)} />
          </Field>
        </div>
        <Field label="Renk" hint="Hacim matrisi ve yenilenme grafiklerinde kullanılır.">
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label="Kas rengi"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="size-9 cursor-pointer rounded-lg border border-line bg-surface"
            />
            <Input value={color} onChange={(e) => setColor(e.target.value)} className="font-mono" />
          </div>
        </Field>
      </div>
    </Dialog>
  );
}
