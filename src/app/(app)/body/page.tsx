"use client";

import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { Scale, Plus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProfileButton } from "@/components/layout/ProfileButton";
import { Button, PageLoader, EmptyState, SectionTitle, Card } from "@/components/ui";
import {
  SnapshotCard,
  MetricChartCard,
  HistoryList,
  MeasureSheet,
} from "@/components/body";
import type { Gender } from "@/lib/navy";
import type { BodyEntryDTO } from "@/lib/types";

interface BodyResponse {
  entries: BodyEntryDTO[]; // artan (eskiden yeniye)
  profile: { gender: Gender; heightCm: number | null };
}

const KEY = "/api/body";

export default function BodyPage() {
  const { data, error, isLoading } = useSWR<BodyResponse>(KEY);
  const [sheetOpen, setSheetOpen] = useState(false);

  const reload = () => mutate(KEY);

  // Artan sıralı orijinal (grafik için), tersi (en yeni önce) snapshot/geçmiş için.
  const ascending = data?.entries ?? [];
  const descending = useMemo(() => [...ascending].reverse(), [ascending]);

  const latest = descending[0];
  const prev = descending[1];

  const profileGender: Gender = data?.profile.gender ?? "male";
  const profileHeightCm = data?.profile.heightCm ?? null;

  return (
    <>
      <AppHeader
        title="Vücut"
        subtitle="Kilo & yağ oranı takibi"
        right={<ProfileButton />}
      />

      <div className="px-5 py-4 space-y-5">
        {isLoading ? (
          <PageLoader />
        ) : error ? (
          <Card className="p-6 text-center text-sm text-muted">
            Veriler yüklenemedi. Lütfen tekrar dene.
          </Card>
        ) : !latest ? (
          <EmptyState
            icon={<Scale size={26} />}
            title="Henüz ölçüm yok"
            desc="İlk ölçümünü ekleyerek yağ oranını ve değişimini takip et."
            action={
              <Button variant="primary" onClick={() => setSheetOpen(true)}>
                <Plus size={18} /> Ölçüm Ekle
              </Button>
            }
          />
        ) : (
          <>
            <SnapshotCard latest={latest} prev={prev} />

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => setSheetOpen(true)}
            >
              <Plus size={18} /> Yeni Ölçüm
            </Button>

            <MetricChartCard entries={ascending} />

            <section>
              <SectionTitle title="Geçmiş" />
              <HistoryList entries={descending} onChanged={reload} />
            </section>
          </>
        )}
      </div>

      <MeasureSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        profileGender={profileGender}
        profileHeightCm={profileHeightCm}
        lastEntry={latest}
        onSaved={reload}
      />
    </>
  );
}
