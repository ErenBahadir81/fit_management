"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { MASCOT_KEYS, renderTemplate, type MascotTemplateDTO, type Mood } from "@fitfloow/core";
import { cx } from "@/lib/cx";
import { errorMessage, useDeleteMascotMessage, useMascotMessages, useResetMascotMessages, useSaveMascotMessage } from "@/lib/queries";
import { PageHeader } from "@/components/layout/PanelShell";
import { Floo, MOOD_TR } from "@/components/floo/Floo";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/Field";
import { ConfirmDialog, Dialog } from "@/components/ui/Overlay";
import { CardSkeleton, EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";

const GROUP_TR: Record<string, string> = {
  home: "Ana ekran",
  report: "Haftalık rapor",
  goal: "Hedef",
  scan: "Fotoğraf tarama",
  body: "Ölçüm",
  workout: "Antrenman",
  recovery: "Toparlanma",
};

/** Sample values so the preview reads like a real message, never like a template. */
const PREVIEW_VARS = {
  name: "Eren",
  kcal: 540,
  weeks: 12,
  kg: "3,3",
  pct: 7,
  sessions: 4,
  streak: 6,
  day: "Push A",
  muscle: "Göğüs",
  food: "Tavuk göğsü",
  score: 82,
};

export default function MascotPage() {
  const { data, isLoading, isError, error, refetch } = useMascotMessages();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const messages = useMemo(() => data?.messages ?? [], [data?.messages]);
  const selected = messages.find((m) => m.id === selectedId) ?? messages[0] ?? null;

  const grouped = useMemo(() => {
    const map = new Map<string, MascotTemplateDTO[]>();
    for (const m of messages) {
      const group = m.key.split(".")[0];
      map.set(group, [...(map.get(group) ?? []), m]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "tr"));
  }, [messages]);

  const reset = useResetMascotMessages({
    onDone: () => {
      toast.success("Mesajlar varsayılana döndürüldü");
      setResetOpen(false);
      setSelectedId(null);
    },
    onFail: (e) => toast.error("Sıfırlanamadı", errorMessage(e)),
  });

  return (
    <>
      <PageHeader
        eyebrow="Floo"
        title="Maskot mesajları"
        description="Floo'nun sesi: sıcak, kısa, ikinci tekil şahıs, asla suçlayıcı değil. En fazla 2 cümle ve 1 emoji."
        actions={
          <>
            <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => setResetOpen(true)}>
              Varsayılanlara dön
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
              Yeni anahtar
            </Button>
          </>
        }
      />

      {isError ? (
        <Card>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[17rem_1fr]">
          <Card className="h-fit lg:sticky lg:top-20">
            <CardHeader eyebrow="Katalog" title={`${messages.length} anahtar`} />
            <div className="max-h-[70vh] overflow-y-auto p-2">
              {isLoading ? (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-7 w-full" />
                  ))}
                </div>
              ) : (
                grouped.map(([group, items]) => (
                  <div key={group} className="mb-3 last:mb-0">
                    <p className="ff-eyebrow px-2 pb-1">{GROUP_TR[group] ?? group}</p>
                    <ul className="flex flex-col gap-0.5">
                      {items.map((m) => {
                        const active = selected?.id === m.id;
                        return (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedId(m.id)}
                              aria-current={active ? "true" : undefined}
                              className={cx(
                                "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors",
                                active ? "bg-brand-soft text-brand-text" : "text-muted hover:bg-surface-2 hover:text-ink"
                              )}
                            >
                              <span className="truncate font-mono">{m.key.split(".")[1] ?? m.key}</span>
                              <span className="flex shrink-0 items-center gap-1">
                                {!m.active && <span className="size-1.5 rounded-full bg-subtle" aria-label="pasif" />}
                                <span className="tnum text-[10px] text-subtle">{m.variants.length}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </Card>

          <div className="min-w-0">
            {isLoading ? (
              <Card className="p-5">
                <CardSkeleton lines={8} />
              </Card>
            ) : selected ? (
              <MessageEditor key={selected.id} message={selected} onDeleted={() => setSelectedId(null)} />
            ) : (
              <Card>
                <EmptyState
                  icon={<MessageCircle className="size-5" aria-hidden />}
                  title="Mesaj kataloğu boş"
                  description="Varsayılanlara dönerek 33 anahtarlık hazır kataloğu yükleyebilirsin."
                  action={
                    <Button size="sm" onClick={() => setResetOpen(true)}>
                      Varsayılanları yükle
                    </Button>
                  }
                />
              </Card>
            )}
          </div>
        </div>
      )}

      <CreateMessageDialog open={createOpen} onClose={() => setCreateOpen(false)} existing={messages} />

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => reset.mutate()}
        pending={reset.isPending}
        danger={false}
        confirmLabel="Varsayılanları yükle"
        title="Mesajları sıfırla"
        message="Tüm anahtarlar ve varyantlar Floo'nun varsayılan kataloğuna döner. Elle yazdığın metinler kaybolur."
      />
    </>
  );
}

function MessageEditor({ message, onDeleted }: { message: MascotTemplateDTO; onDeleted: () => void }) {
  const toast = useToast();
  const [mood, setMood] = useState<Mood>(message.mood);
  const [variants, setVariants] = useState<string[]>([...message.variants]);
  const [active, setActive] = useState(message.active);
  const [preview, setPreview] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = mood !== message.mood || active !== message.active || JSON.stringify(variants) !== JSON.stringify(message.variants);

  const save = useSaveMascotMessage({
    onDone: () => toast.success("Mesaj kaydedildi", message.key),
    onFail: (e) => toast.error("Kaydedilemedi", errorMessage(e)),
  });
  const remove = useDeleteMascotMessage({
    onDone: () => {
      toast.success("Mesaj silindi");
      onDeleted();
    },
    onFail: (e) => toast.error("Silinemedi", errorMessage(e)),
  });

  const clean = variants.map((v) => v.trim()).filter(Boolean);
  const previewText = renderTemplate(clean[Math.min(preview, Math.max(0, clean.length - 1))] ?? "", PREVIEW_VARS);

  return (
    <>
      <Card>
        <CardHeader
          eyebrow={GROUP_TR[message.key.split(".")[0]] ?? "Anahtar"}
          title={<span className="font-mono text-sm">{message.key}</span>}
          description="Varyantlar arasından gün + kullanıcı bazlı deterministik seçim yapılır; aynı gün aynı cümle gelir."
          actions={
            <>
              <IconButton label="Anahtarı sil" size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-3.5" aria-hidden />
              </IconButton>
              <Button
                variant="primary"
                size="sm"
                icon={<Save className="size-3.5" />}
                disabled={!dirty || clean.length === 0}
                loading={save.isPending}
                onClick={() => save.mutate({ id: message.id, input: { key: message.key, mood, variants: clean, active } })}
              >
                {dirty ? "Kaydet" : "Kaydedildi"}
              </Button>
            </>
          }
        />

        <CardBody className="space-y-5">
          <div className="rounded-xl border border-line bg-surface-2 p-5">
            <p className="ff-eyebrow mb-3">Önizleme</p>
            <div className="flex items-end gap-4">
              <Floo mood={mood} size={68} />
              <div className="relative max-w-md rounded-xl rounded-bl-sm border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink">
                {previewText || <span className="text-subtle">Varyant metni gir…</span>}
              </div>
            </div>
            {clean.length > 1 && (
              <div className="mt-3 flex items-center gap-1.5">
                {clean.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`${i + 1}. varyantı önizle`}
                    aria-pressed={i === preview}
                    onClick={() => setPreview(i)}
                    className={cx("h-1.5 w-6 rounded-full transition-colors", i === preview ? "bg-brand" : "bg-line hover:bg-line-strong")}
                  />
                ))}
                <span className="ml-1 text-[11px] text-subtle">
                  {preview + 1}/{clean.length}
                </span>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
            <Field label="Ruh hâli" hint="Floo'nun yüz ifadesi.">
              <Select value={mood} onChange={(e) => setMood(e.target.value as Mood)}>
                {(Object.keys(MOOD_TR) as Mood[]).map((m) => (
                  <option key={m} value={m}>
                    {MOOD_TR[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3.5 py-3">
              <div>
                <p className="text-[13px] font-medium text-ink">Yayında</p>
                <p className="mt-0.5 text-xs text-muted">Pasif anahtarlar seçim havuzuna girmez.</p>
              </div>
              <Switch checked={active} onChange={setActive} label="Yayında" />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-medium text-ink">Varyantlar</p>
              <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setVariants((v) => [...v, ""])}>
                Varyant ekle
              </Button>
            </div>
            <ul className="flex flex-col gap-2">
              {variants.map((variant, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-2.5 w-4 shrink-0 text-right text-xs tnum text-subtle">{i + 1}</span>
                  <Textarea
                    aria-label={`${i + 1}. varyant`}
                    rows={2}
                    value={variant}
                    maxLength={220}
                    onChange={(e) => setVariants((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                    onFocus={() => setPreview(i)}
                  />
                  <IconButton
                    label={`${i + 1}. varyantı sil`}
                    size="sm"
                    variant="danger"
                    disabled={variants.length <= 1}
                    onClick={() => setVariants((v) => v.filter((_, j) => j !== i))}
                    className="mt-1"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </IconButton>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-subtle">
              Yer tutucular: <span className="font-mono">{"{name} {kcal} {weeks} {kg} {pct} {sessions} {streak} {day} {muscle} {food} {score}"}</span>
            </p>
          </div>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate(message.id)}
        pending={remove.isPending}
        title="Anahtarı sil"
        message={`“${message.key}” anahtarı silinecek. Bu bağlamda Floo sessiz kalır.`}
      />
    </>
  );
}

function CreateMessageDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: MascotTemplateDTO[] }) {
  const toast = useToast();
  const [key, setKey] = useState("");
  const [mood, setMood] = useState<Mood>("happy");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useSaveMascotMessage({
    onDone: () => {
      toast.success("Anahtar eklendi", key);
      onClose();
    },
    onFail: (e) => setError(errorMessage(e)),
  });

  const used = new Set(existing.map((m) => m.key));
  const missing = MASCOT_KEYS.filter((k) => !used.has(k));

  const submit = () => {
    const trimmed = key.trim();
    if (!/^[a-z]+\.[a-zA-Z0-9]+$/.test(trimmed)) {
      setError("Anahtar “grup.ad” biçiminde olmalı (örn. home.morning).");
      return;
    }
    if (used.has(trimmed)) {
      setError("Bu anahtar zaten var.");
      return;
    }
    if (!text.trim()) {
      setError("En az bir varyant metni gerekli.");
      return;
    }
    setError(null);
    save.mutate({ id: null, input: { key: trimmed, mood, variants: [text.trim()], active: true } });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Yeni mesaj anahtarı"
      description="Sunucu bu anahtarı bilmiyorsa mesaj gösterilmez; önce API tarafında kullanılıyor olmalı."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>
            Ekle
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
        <Field label="Anahtar" required hint={missing.length > 0 ? `Eksik standart anahtarlar: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""}` : "Tüm standart anahtarlar tanımlı."}>
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="home.morning" spellCheck={false} data-autofocus />
        </Field>
        <Field label="Ruh hâli">
          <Select value={mood} onChange={(e) => setMood(e.target.value as Mood)}>
            {(Object.keys(MOOD_TR) as Mood[]).map((m) => (
              <option key={m} value={m}>
                {MOOD_TR[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="İlk varyant" required>
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Günaydın {name}! Bugün küçük bir adım…" />
        </Field>
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3.5 py-3">
          <Floo mood={mood} size={40} breathing={false} />
          <p className="text-[13px] text-muted">{renderTemplate(text, PREVIEW_VARS) || "Önizleme burada görünür."}</p>
          <Badge tone="neutral" className="ml-auto">
            {MOOD_TR[mood]}
          </Badge>
        </div>
      </div>
    </Dialog>
  );
}
