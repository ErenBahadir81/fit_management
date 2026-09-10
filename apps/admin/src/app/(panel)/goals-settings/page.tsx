"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { DEFAULT_GOAL_SETTINGS, validateRateTable, type GoalSettings, type SettingsDTO } from "@fitfloow/core";
import { errorMessage, useSaveSettings, useSettings } from "@/lib/queries";
import { PageHeader } from "@/components/layout/PanelShell";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/Overlay";
import { CardSkeleton, ErrorState, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { ConstantsForm } from "./ConstantsForm";
import { GoalSimulator } from "./GoalSimulator";
import { RateTableEditor } from "./RateTableEditor";

export default function GoalSettingsPage() {
  const settings = useSettings();

  if (settings.isError) {
    return (
      <Card>
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      </Card>
    );
  }

  if (settings.isLoading || !settings.data) {
    return (
      <>
        <PageHeader eyebrow="Sistem" title="Hedef motoru" description="Ayarlar yükleniyor…" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Card className="mt-4 p-5">
          <CardSkeleton lines={8} />
        </Card>
      </>
    );
  }

  return <GoalSettingsEditor key={settings.data.updatedAt ?? "initial"} settings={settings.data} />;
}

function GoalSettingsEditor({ settings }: { settings: SettingsDTO }) {
  const toast = useToast();
  const [draft, setDraft] = useState<SettingsDTO>(() => structuredClone(settings));
  const [tab, setTab] = useState<"constants" | "table">("constants");
  const [resetOpen, setResetOpen] = useState(false);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);
  const problems = useMemo(() => validateRateTable(draft.goal.rateTable), [draft.goal.rateTable]);

  const save = useSaveSettings({
    onDone: () => toast.success("Hedef ayarları kaydedildi"),
    onFail: (e) => toast.error("Kaydedilemedi", errorMessage(e)),
  });

  const setGoal = (goal: GoalSettings) => setDraft((prev) => ({ ...prev, goal }));

  return (
    <>
      <PageHeader
        eyebrow="Sistem"
        title="Hedef motoru"
        description="Yağ kaybı planını üreten tüm sabitler ve güvenli hız tablosu. Değişiklikler yeni hesaplanan planları etkiler; mevcut hedefler bir sonraki kalibrasyonda güncellenir."
        actions={
          <>
            <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => setResetOpen(true)}>
              Varsayılanlara dön
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Save className="size-3.5" />}
              onClick={() => save.mutate(draft)}
              loading={save.isPending}
              disabled={!dirty || problems.length > 0}
            >
              {dirty ? "Kaydet" : "Kaydedildi"}
            </Button>
          </>
        }
      />

      {dirty && problems.length > 0 && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5 text-[13px] text-ink">
          Oran tablosunda {problems.length} sorun var; düzeltmeden kaydedemezsin.
        </div>
      )}

      <GoalSimulator settings={draft.goal} />

      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label="Ayar bölümü"
            value={tab}
            onChange={setTab}
            options={[
              { value: "constants", label: "Sabitler" },
              { value: "table", label: "Oran tablosu" },
            ]}
          />
          {dirty && <span className="text-xs text-warn">Kaydedilmemiş değişiklikler</span>}
        </div>

        <Card>
          {tab === "constants" ? (
            <>
              <CardHeader
                eyebrow="Sabitler"
                title="Hesap parametreleri"
                description="Her alan docs/plan/03-goal-engine.md adımlarına birebir karşılık gelir."
              />
              <ConstantsForm goal={draft.goal} onChange={setGoal} />
            </>
          ) : (
            <>
              <CardHeader
                eyebrow="Güvenli hız"
                title="Oran tablosu"
                description="Her cinsiyet için bantlar 0–100 aralığını boşluksuz kapsamalı; üst sınır hariç tutulur."
              />
              <RateTableEditor bands={draft.goal.rateTable} onChange={(rateTable) => setGoal({ ...draft.goal, rateTable })} />
            </>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => {
          setDraft((prev) => ({ ...prev, goal: structuredClone(DEFAULT_GOAL_SETTINGS) }));
          setResetOpen(false);
          toast.success("Varsayılanlar yüklendi", "Kaydetmeyi unutma.");
        }}
        danger={false}
        confirmLabel="Varsayılanları yükle"
        title="Varsayılanlara dön"
        message="Tüm hedef sabitleri ve 16 bantlık araştırma tablosu araştırma varsayılanlarına döner. Kaydedene kadar sunucuda bir şey değişmez."
      />
    </>
  );
}
