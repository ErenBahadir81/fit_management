"use client";

import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { Salad, Utensils } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProfileButton } from "@/components/layout/ProfileButton";
import { PageLoader, EmptyState, Button } from "@/components/ui";
import {
  DaySummary,
  MealSection,
  AddItemSheet,
  TargetSheet,
  WeekHistory,
  MEALS,
  type Meal,
  type HistoryDay,
  type Totals,
} from "@/components/diet";
import { apiSend } from "@/lib/fetcher";
import { todayKey } from "@/lib/utils";
import type { DietItemDTO, DietTargetDTO } from "@/lib/types";

interface DietResponse {
  dateKey: string;
  target: DietTargetDTO;
  items: DietItemDTO[];
  totals: Totals;
  history: HistoryDay[];
}

const ENDPOINT = "/api/diet";

/** Bugünün uzun Türkçe tarihi: "3 Haziran Salı". */
function longDateTR(): string {
  return new Date().toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });
}

export default function DietPage() {
  const { data, isLoading } = useSWR<DietResponse>(ENDPOINT);

  const [addMeal, setAddMeal] = useState<Meal | null>(null);
  const [targetOpen, setTargetOpen] = useState(false);

  // Öğeleri öğüne göre grupla; her öğenin gerçek (global) indexini koru.
  const grouped = useMemo(() => {
    const map: Record<Meal, { item: DietItemDTO; index: number }[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    (data?.items ?? []).forEach((item, index) => {
      map[item.meal].push({ item, index });
    });
    return map;
  }, [data?.items]);

  async function refresh() {
    await mutate(ENDPOINT);
  }

  async function deleteItem(index: number) {
    await apiSend(ENDPOINT, "DELETE", { index });
    await refresh();
  }

  const header = (
    <AppHeader title="Diyet" subtitle={longDateTR()} right={<ProfileButton />} />
  );

  if (isLoading || !data) {
    return (
      <>
        {header}
        <PageLoader />
      </>
    );
  }

  const totalItems = data.items.length;

  return (
    <>
      {header}

      <div className="px-5 py-4 space-y-5">
        <DaySummary
          totals={data.totals}
          target={data.target}
          onEditTarget={() => setTargetOpen(true)}
        />

        {totalItems === 0 && (
          <EmptyState
            icon={<Utensils size={26} />}
            title="Bugün henüz besin yok"
            desc="Öğünlerine yiyecek ekleyerek kalori ve makrolarını takip et."
            action={
              <Button
                variant="primary"
                size="md"
                onClick={() => setAddMeal("breakfast")}
              >
                <Salad size={18} /> İlk besini ekle
              </Button>
            }
          />
        )}

        <div className="space-y-3">
          {MEALS.map((m) => (
            <MealSection
              key={m.key}
              meta={m}
              items={grouped[m.key]}
              onAdd={() => setAddMeal(m.key)}
              onDelete={deleteItem}
            />
          ))}
        </div>

        <WeekHistory
          history={data.history}
          target={data.target.calories}
          todayKey={todayKey()}
        />
      </div>

      <AddItemSheet
        open={addMeal !== null}
        onClose={() => setAddMeal(null)}
        meal={addMeal ?? "breakfast"}
        onSaved={refresh}
      />

      <TargetSheet
        open={targetOpen}
        onClose={() => setTargetOpen(false)}
        target={data.target}
        onSaved={refresh}
      />
    </>
  );
}
