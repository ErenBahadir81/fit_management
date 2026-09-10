"use client";

import { useMemo, useState } from "react";
import { KeyRound, Save } from "lucide-react";
import { WEEKDAYS_TR, type SettingsDTO } from "@fitfloow/core";
import { api } from "@/lib/api";
import { errorMessage, useHealth, useSaveSettings, useSettings } from "@/lib/queries";
import { int, relative } from "@/lib/format";
import { PageHeader } from "@/components/layout/PanelShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, NumberInput, Select, Switch } from "@/components/ui/Field";
import { DataRow } from "@/components/ui/Stat";
import { Callout, CardSkeleton, ErrorState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";

export default function SettingsPage() {
  const settings = useSettings();

  if (settings.isError) {
    return (
      <Card>
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Sistem"
        title="Ayarlar"
        description="Hafta varsayılanları, fotoğraf tanıma anahtarları ve yönetici hesabı. Hedef motoru sabitleri ayrı sayfada."
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          {settings.isLoading || !settings.data ? (
            <Card className="p-5">
              <CardSkeleton lines={8} />
            </Card>
          ) : (
            <GeneralSettings key={settings.data.updatedAt ?? "initial"} settings={settings.data} />
          )}
        </div>

        <div className="flex flex-col gap-4">
          <PasswordCard />
          <SystemCard />
        </div>
      </div>
    </>
  );
}

function GeneralSettings({ settings }: { settings: SettingsDTO }) {
  const toast = useToast();
  const [draft, setDraft] = useState<SettingsDTO>(() => structuredClone(settings));
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);

  const save = useSaveSettings({
    onDone: () => toast.success("Ayarlar kaydedildi"),
    onFail: (e) => toast.error("Kaydedilemedi", errorMessage(e)),
  });

  return (
    <>
      <Card>
        <CardHeader
          eyebrow="Hafta"
          title="Rapor varsayılanları"
          description="Yeni kullanıcılar bu ölçüm gününü alır; mevcut kullanıcılar kendi gününü korur."
          actions={
            <Button
              variant="primary"
              size="sm"
              icon={<Save className="size-3.5" />}
              disabled={!dirty}
              loading={save.isPending}
              onClick={() => save.mutate(draft)}
            >
              {dirty ? "Kaydet" : "Kaydedildi"}
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <Field label="Varsayılan ölçüm günü" hint="Haftalık rapor bu günde başlar ve altı gün sonra biter.">
            <Select
              value={draft.week.defaultMeasurementDay}
              onChange={(e) => setDraft((p) => ({ ...p, week: { ...p.week, defaultMeasurementDay: Number(e.target.value) } }))}
            >
              {WEEKDAYS_TR.map((label, i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Maskot adı" hint="Tüm arayüzde bu isim kullanılır.">
            <Input value={draft.mascot.name} onChange={(e) => setDraft((p) => ({ ...p, mascot: { ...p.mascot, name: e.target.value } }))} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Küçük kas toparlanması" hint="Saat cinsinden varsayılan (kas bazında ezilebilir).">
              <NumberInput
                unit="sa"
                min={6}
                max={168}
                value={draft.recovery.small}
                onChange={(e) => setDraft((p) => ({ ...p, recovery: { ...p.recovery, small: Number(e.target.value) || p.recovery.small } }))}
              />
            </Field>
            <Field label="Büyük kas toparlanması" hint="Saat cinsinden varsayılan.">
              <NumberInput
                unit="sa"
                min={6}
                max={168}
                value={draft.recovery.large}
                onChange={(e) => setDraft((p) => ({ ...p, recovery: { ...p.recovery, large: Number(e.target.value) || p.recovery.large } }))}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader eyebrow="Görüntü işleme" title="Fotoğraf tarama" description="Vision servisinin eşik değerleri." />
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3.5 py-3">
            <div>
              <p className="text-[13px] font-medium text-ink">Tarama açık</p>
              <p className="mt-0.5 text-xs text-muted">Kapalıyken mobil uygulamada kamera sekmesi gizlenir.</p>
            </div>
            <Switch
              checked={draft.vision.enabled}
              onChange={(v) => setDraft((p) => ({ ...p, vision: { ...p.vision, enabled: v } }))}
              label="Tarama açık"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Minimum güven" hint="Bu değerin altındaki tespitler gösterilmez (0–1).">
              <NumberInput
                min={0}
                max={1}
                step={0.05}
                value={draft.vision.minConfidence}
                onChange={(e) => setDraft((p) => ({ ...p, vision: { ...p.vision, minConfidence: Number(e.target.value) } }))}
              />
            </Field>
            <Field label="Maksimum tespit" hint="Bir fotoğrafta gösterilecek en fazla besin sayısı.">
              <NumberInput
                min={1}
                max={10}
                value={draft.vision.maxDetections}
                onChange={(e) => setDraft((p) => ({ ...p, vision: { ...p.vision, maxDetections: Number(e.target.value) } }))}
              />
            </Field>
          </div>

          {dirty && <Callout tone="warn">Kaydedilmemiş değişiklikler var.</Callout>}
        </CardBody>
      </Card>
    </>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 6) {
      setError("Yeni parola en az 6 karakter olmalı.");
      return;
    }
    if (next !== repeat) {
      setError("Parolalar eşleşmiyor.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await api.me.changePassword(current, next);
      toast.success("Parola değiştirildi");
      setCurrent("");
      setNext("");
      setRepeat("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader eyebrow="Hesap" title="Parola değiştir" />
      <CardBody>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error && <Callout tone="danger">{error}</Callout>}
          <Field label="Mevcut parola" required>
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="Yeni parola" required hint="En az 6 karakter.">
            <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Yeni parola (tekrar)" required>
            <Input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" loading={pending} icon={<KeyRound className="size-4" />}>
            Parolayı değiştir
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function SystemCard() {
  const health = useHealth();
  return (
    <Card>
      <CardHeader eyebrow="Servisler" title="Sistem" />
      <CardBody>
        {health.isLoading ? (
          <CardSkeleton lines={5} />
        ) : health.isError ? (
          <ErrorState compact error={health.error} onRetry={() => void health.refetch()} />
        ) : (
          <dl>
            <DataRow
              label="Veritabanı"
              value={<Badge tone={health.data?.db === "ok" ? "success" : "danger"} dot>{health.data?.db === "ok" ? "Çalışıyor" : "Erişilemiyor"}</Badge>}
            />
            <DataRow
              label="Görüntü servisi"
              value={
                <Badge tone={health.data?.vision.ok ? (health.data.vision.mock ? "warn" : "success") : "danger"} dot>
                  {health.data?.vision.ok ? (health.data.vision.mock ? "Mock" : "Model") : "Kapalı"}
                </Badge>
              }
            />
            <DataRow label="Model sürümü" value={health.data?.vision.modelVersion ?? "—"} />
            <DataRow label="Gecikme" value={health.data?.vision.latencyMs !== null ? `${int(health.data?.vision.latencyMs)} ms` : "—"} />
            <DataRow label="API sürümü" value={health.data?.version ?? "—"} />
            <DataRow label="Çalışma süresi" value={health.data ? `${int(Math.floor(health.data.uptimeSec / 3600))} sa` : "—"} />
            <DataRow label="Son kontrol" value={relative(health.data?.checkedAt)} />
          </dl>
        )}
      </CardBody>
    </Card>
  );
}
