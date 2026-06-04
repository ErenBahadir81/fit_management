"use client";

import useSWR from "swr";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProfileButton } from "@/components/layout/ProfileButton";
import { Ring, PageLoader, SectionTitle, EmptyState, Card, CardBody } from "@/components/ui";
import { Activity, HeartPulse } from "lucide-react";
import { WEEKDAYS_TR_LONG, mondayIndex } from "@/lib/utils";
import { statusColor, statusLabel, statusOf, MuscleReadiness } from "@/lib/recovery";
import type { DayDTO, UserDTO, WorkoutLogDTO } from "@/lib/types";
import { TodayCard } from "@/components/workout/TodayCard";
import { RecoveryGrid } from "@/components/workout/RecoveryGrid";
import { WeekStrip, ScheduleEntry } from "@/components/workout/WeekStrip";

interface ProgramResponse {
  program: { id: string; name: string; weekNumber: number; currentIndex: number };
  current: { index: number; day: DayDTO };
  todayLog: WorkoutLogDTO | null;
  schedule: ScheduleEntry[];
}

interface RecoveryResponse {
  muscles: MuscleReadiness[];
  generatedAt: string;
}

function todayLongDate(): string {
  const d = new Date();
  const wd = WEEKDAYS_TR_LONG[mondayIndex(d)];
  return `${wd}, ${d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" })}`;
}

export default function HomePage() {
  const { data: me } = useSWR<{ user: UserDTO }>("/api/auth/me");
  const { data: prog, error: progErr } = useSWR<ProgramResponse>("/api/program");
  const { data: rec } = useSWR<RecoveryResponse>("/api/recovery");

  const name = me?.user?.displayName?.split(" ")[0];

  const loading = !prog && !progErr;

  const muscles = rec?.muscles ?? [];
  const avg =
    muscles.length > 0
      ? Math.round(muscles.reduce((a, m) => a + m.readiness, 0) / muscles.length)
      : 0;
  const avgStatus = statusOf(avg);
  const avgColor = statusColor(avgStatus);

  return (
    <>
      <AppHeader
        title={`Merhaba, ${name || "Sporcu"}`}
        subtitle={todayLongDate()}
        right={<ProfileButton />}
      />

      <div className="px-5 py-4 space-y-5">
        {loading ? (
          <PageLoader />
        ) : progErr ? (
          <EmptyState
            icon={<Activity size={24} />}
            title="Program yüklenemedi"
            desc="Lütfen birazdan tekrar dene."
          />
        ) : prog ? (
          <>
            {/* Bugün */}
            <section>
              <TodayCard day={prog.current.day} todayLog={prog.todayLog} />
            </section>

            {/* Hafta şeridi */}
            {prog.schedule.length > 0 && (
              <section>
                <SectionTitle title="Bu Hafta" />
                <WeekStrip schedule={prog.schedule} />
              </section>
            )}

            {/* Yenilenme (merkez parça) */}
            <section>
              <SectionTitle title="Kas Yenilenmesi" />
              {muscles.length > 0 ? (
                <div className="space-y-3">
                  <Card>
                    <CardBody className="p-5 flex items-center gap-4">
                      <Ring value={avg} size={92} stroke={10} color={avgColor}>
                        <span
                          className="text-2xl font-extrabold tabular-nums leading-none"
                          style={{ color: avgColor }}
                        >
                          {avg}%
                        </span>
                      </Ring>
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold uppercase tracking-wide text-muted">
                          Genel Hazırlık
                        </p>
                        <p className="text-xl font-extrabold leading-tight mt-0.5">
                          {statusLabel(avgStatus)}
                        </p>
                        <p className="text-[13px] text-muted mt-1 inline-flex items-center gap-1.5">
                          <HeartPulse size={14} style={{ color: avgColor }} />
                          {readyCount(muscles)} kas hazır · {fatiguedCount(muscles)}{" "}
                          yorgun
                        </p>
                      </div>
                    </CardBody>
                  </Card>

                  <RecoveryGrid muscles={muscles} />
                </div>
              ) : (
                <EmptyState
                  icon={<HeartPulse size={24} />}
                  title="Henüz veri yok"
                  desc="İlk antrenmanını tamamladığında kaslarının yenilenmesi burada görünecek."
                />
              )}
            </section>
          </>
        ) : null}
      </div>
    </>
  );
}

function readyCount(m: MuscleReadiness[]): number {
  return m.filter((x) => x.status === "ready").length;
}
function fatiguedCount(m: MuscleReadiness[]): number {
  return m.filter((x) => x.status === "fatigued").length;
}
