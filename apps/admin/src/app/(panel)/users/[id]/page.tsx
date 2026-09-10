"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Dumbbell, Ruler, Target, TrendingDown } from "lucide-react";
import { ACTIVITY_TR, BODY_FAT_CATEGORY_TR, WEEKDAYS_TR, bodyFatCategory } from "@fitfloow/core";
import { date, dateShort, int, kcal, kg, num, pct, relative } from "@/lib/format";
import { useUserOverview } from "@/lib/queries";
import { PageHeader } from "@/components/layout/PanelShell";
import { RoadmapChart } from "@/components/charts/RoadmapChart";
import { Badge, DeltaChip } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataRow, MeterBar, StatTile } from "@/components/ui/Stat";
import { CardSkeleton, EmptyState, ErrorState, Skeleton } from "@/components/ui/States";

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { data, isLoading, isError, error, refetch } = useUserOverview(id);

  if (isError) {
    return (
      <Card>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Card>
    );
  }

  const user = data?.user;
  const body = data?.latestBody ?? null;
  const goal = data?.goal ?? null;
  const program = data?.program ?? null;
  const report = data?.weekReport ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Kullanıcı"
        title={user?.displayName ?? "Yükleniyor…"}
        description={
          user
            ? `@${user.username} · ${user.role === "admin" ? "Yönetici" : "Kullanıcı"} · ${ACTIVITY_TR[user.activityLevel]} · Ölçüm günü ${WEEKDAYS_TR[user.measurementDay]}`
            : undefined
        }
        actions={
          <Button href="/users" as="span" size="sm" icon={<ArrowLeft className="size-3.5" />} onClick={undefined} asChild={false}>
            <Link href="/users">Listeye dön</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Güncel kilo"
          value={body ? kg(body.weightKg) : "—"}
          loading={isLoading}
          icon={<TrendingDown className="size-4" aria-hidden />}
          hint={body ? `${date(body.dateKey)} ölçümü` : "ölçüm yok"}
        />
        <StatTile
          label="Yağ oranı"
          value={body ? pct(body.bodyFatPct) : "—"}
          loading={isLoading}
          accent
          icon={<Ruler className="size-4" aria-hidden />}
          hint={body && user ? BODY_FAT_CATEGORY_TR[bodyFatCategory(user.gender, body.bodyFatPct)] : undefined}
        />
        <StatTile
          label="Yağsız kütle"
          value={body ? kg(body.leanMassKg) : "—"}
          loading={isLoading}
          icon={<Dumbbell className="size-4" aria-hidden />}
          hint={body ? `Yağ ${kg(body.fatMassKg)}` : undefined}
        />
        <StatTile
          label="Hafta puanı"
          value={report ? int(report.score) : "—"}
          loading={isLoading}
          icon={<CalendarDays className="size-4" aria-hidden />}
          hint={report ? `${int(report.nutrition.daysLogged)}/7 gün kayıtlı` : "rapor yok"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader
            eyebrow="Hedef"
            title={goal ? `Yağ oranı hedefi %${num(goal.targetBodyFatPct, 1)}` : "Aktif hedef yok"}
            description={
              goal
                ? `${date(goal.start.dateKey)} tarihinde başladı · ${goal.plan.estimatedWeeks} hafta · ${kcal(goal.plan.initialDailyCalorieTarget)}/gün`
                : "Kullanıcı mobil uygulamadan bir hedef belirlediğinde yol haritası burada görünür."
            }
            actions={goal ? <Badge tone={goal.status === "active" ? "brand" : "neutral"}>{goal.status === "active" ? "Aktif" : goal.status === "completed" ? "Tamamlandı" : "Bırakıldı"}</Badge> : undefined}
          />
          <CardBody>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : goal ? (
              <>
                <RoadmapChart roadmap={goal.plan.roadmap} targetWeightKg={goal.plan.targetWeightKg} />
                <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
                  <DataRow label="Kaybedilecek yağ" value={kg(goal.plan.fatToLoseKg, 2)} />
                  <DataRow label="Hedef kilo" value={kg(goal.plan.targetWeightKg)} />
                  <DataRow label="Toplam açık" value={kcal(goal.plan.totalDeficitKcal)} />
                  <DataRow label="TDEE" value={kcal(goal.plan.tdee)} />
                  <DataRow label="İlk hafta hızı" value={`${num(goal.plan.initialRateKgPerWeek, 2)} kg/hf`} />
                  <DataRow label="Tahmini bitiş" value={date(goal.plan.targetDate)} />
                </dl>
              </>
            ) : (
              <EmptyState
                compact
                icon={<Target className="size-5" aria-hidden />}
                title="Hedef tanımlı değil"
                description="Kullanıcı bir yağ oranı hedefi belirlediğinde plan, haftalık hız ve kalori hedefi burada listelenir."
              />
            )}
          </CardBody>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader eyebrow="Antrenman" title={program?.name ?? "Program atanmamış"} />
            <CardBody>
              {isLoading ? (
                <CardSkeleton lines={4} />
              ) : program ? (
                <dl>
                  <DataRow label="Döngü uzunluğu" value={`${program.days.length} gün`} />
                  <DataRow label="Sıradaki gün" value={program.days[program.currentIndex]?.title ?? "—"} />
                  <DataRow label="Hafta" value={int(program.weekNumber)} />
                  <DataRow label="Son işlem" value={relative(program.lastActionAt)} />
                </dl>
              ) : (
                <EmptyState
                  compact
                  mascot={false}
                  icon={<CalendarDays className="size-5" aria-hidden />}
                  title="Program yok"
                  description="Kullanıcılar listesinden bir şablon atayabilirsin."
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader eyebrow="Bu hafta" title="Rapor özeti" />
            <CardBody>
              {isLoading ? (
                <CardSkeleton lines={5} />
              ) : report ? (
                <>
                  <dl>
                    <DataRow label="Kayıtlı gün" value={`${int(report.nutrition.daysLogged)} / 7`} />
                    <DataRow label="Ortalama kalori" value={kcal(report.nutrition.avgKcal)} />
                    <DataRow
                      label="Biriken açık"
                      value={
                        <span className="flex items-center gap-2">
                          {kcal(report.nutrition.deficitBankedKcal)}
                          <span className="text-xs text-subtle">≈ {kg(report.nutrition.fatEquivalentKg, 2)} yağ</span>
                        </span>
                      }
                    />
                    <DataRow label="Antrenman" value={`${int(report.training.sessions)} / ${int(report.training.plannedSessions)}`} />
                    <DataRow label="Trend kilo" value={<DeltaChip value={report.body.ewmaDelta} suffix=" kg" />} />
                  </dl>
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted">Haftalık açık hedefi</span>
                      <span className="tnum text-ink">%{int(report.nutrition.deficitPct)}</span>
                    </div>
                    <MeterBar
                      value={Math.max(0, report.nutrition.deficitBankedKcal)}
                      max={Math.max(1, report.nutrition.deficitPlannedKcal)}
                      label="Haftalık açık"
                    />
                  </div>
                </>
              ) : (
                <EmptyState compact mascot={false} title="Rapor yok" description="Bu hafta için henüz veri girilmemiş." />
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader eyebrow="Geçmiş" title="Son antrenmanlar" description="En son kaydedilen 5 seans." />
        <CardBody className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-5">
              <CardSkeleton lines={5} />
            </div>
          ) : (data?.lastWorkouts.length ?? 0) === 0 ? (
            <EmptyState
              compact
              icon={<Dumbbell className="size-5" aria-hidden />}
              title="Kayıtlı antrenman yok"
              description="Kullanıcı bir seansı tamamladığında burada listelenir."
            />
          ) : (
            <ul className="divide-y divide-line">
              {data?.lastWorkouts.map((log) => {
                const sets = log.strength.reduce((s, e) => s + e.sets.length, 0);
                return (
                  <li key={log.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                    <span className="w-16 shrink-0 text-xs tnum text-subtle">{dateShort(log.dateKey)}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{log.title}</span>
                    {log.isOffDay ? (
                      <Badge tone="neutral">Dinlenme</Badge>
                    ) : (
                      <>
                        <span className="text-xs tnum text-muted">{sets} set</span>
                        {log.run && <Badge tone="info">{num(log.run.totalKm, 1)} km koşu</Badge>}
                        {log.swim && <Badge tone="info">{num(log.swim.totalKm, 1)} km yüzme</Badge>}
                        {log.durationMin !== null && <span className="text-xs tnum text-subtle">{int(log.durationMin)} dk</span>}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
