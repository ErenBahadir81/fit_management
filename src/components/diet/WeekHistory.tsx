"use client";

import { Card, CardBody, SectionTitle } from "@/components/ui";
import { clamp, fmtNum } from "@/lib/utils";

export interface HistoryDay {
  dateKey: string;
  weekdayShort: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function WeekHistory({
  history,
  target,
  todayKey,
}: {
  history: HistoryDay[];
  /** Kalori hedefi (bar yüksekliği oranı için). */
  target: number;
  /** Bugünün dateKey'i (vurgulamak için). */
  todayKey: string;
}) {
  const goal = target > 0 ? target : 0;

  return (
    <div>
      <SectionTitle title="Son 7 Gün" />
      <Card>
        <CardBody className="p-4">
          <div className="flex items-end justify-between gap-1.5 h-32">
            {history.map((d) => {
              const ratio = goal > 0 ? clamp((d.calories / goal) * 100, 0, 100) : 0;
              const over = goal > 0 && d.calories > goal;
              const isToday = d.dateKey === todayKey;
              const color = over ? "var(--fatigued)" : "var(--ready)";
              return (
                <div
                  key={d.dateKey}
                  className="flex-1 flex flex-col items-center gap-1.5 min-w-0"
                >
                  <span className="text-[10px] font-semibold text-muted tabular-nums">
                    {d.calories > 0 ? fmtNum(d.calories, 0) : ""}
                  </span>
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-lg rounded-b-sm bg-surface-2 relative overflow-hidden"
                      style={{ height: "100%" }}
                    >
                      <div
                        className="absolute bottom-0 inset-x-0 rounded-t-lg"
                        style={{
                          height: `${Math.max(ratio, d.calories > 0 ? 6 : 0)}%`,
                          background: color,
                          transition:
                            "height 0.6s cubic-bezier(0.22,1,0.36,1)",
                        }}
                      />
                    </div>
                  </div>
                  <span
                    className={
                      "text-[11px] font-semibold tabular-nums " +
                      (isToday ? "text-primary" : "text-muted")
                    }
                  >
                    {d.weekdayShort}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-border">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--ready)" }}
              />
              Hedef içi
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--fatigued)" }}
              />
              Hedef aşıldı
            </span>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
