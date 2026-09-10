"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Activity, ArrowUpRight, Camera, Database, Dumbbell, RefreshCw, Server, Target, Users, Utensils } from "lucide-react";
import { WEEKDAYS_TR, keyWeekday, trDateKey } from "@fitfloow/core";
import { listEnter } from "@/lib/motion";
import { date, int, num, relative } from "@/lib/format";
import { useDashboard, useHealth } from "@/lib/queries";
import { PageHeader } from "@/components/layout/PanelShell";
import { ActivityChart, Sparkline } from "@/components/charts/ActivityChart";
import { CHART } from "@/components/charts/chart-kit";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatTile } from "@/components/ui/Stat";
import { CardSkeleton, ErrorState, Skeleton } from "@/components/ui/States";
import { FlooBubble } from "@/components/floo/Floo";

export default function DashboardPage() {
  const dashboard = useDashboard();
  const health = useHealth();
  const d = dashboard.data;
  const series = d?.series ?? [];
  const todayKey = trDateKey();

  return (
    <>
      <PageHeader
        eyebrow="Genel bakış"
        title="Panel"
        description={`${WEEKDAYS_TR[keyWeekday(todayKey)]}, ${date(todayKey)} · Son 14 günün aktivitesi ve sistem durumu.`}
        actions={
          <Button
            size="sm"
            onClick={() => {
              void dashboard.refetch();
              void health.refetch();
            }}
            loading={dashboard.isFetching}
            icon={<RefreshCw className="size-3.5" />}
          >
            Yenile
          </Button>
        }
      />

      {dashboard.isError ? (
        <Card>
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        </Card>
      ) : (
        <motion.div variants={listEnter} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatTile
            label="Kullanıcı"
            value={int(d?.users)}
            loading={dashboard.isLoading}
            icon={<Users className="size-4" aria-hidden />}
            hint={<span>{int(d?.activeUsers7d)} kişi son 7 günde aktif</span>}
          />
          <StatTile
            label="Aktif hedef"
            value={int(d?.goalsActive)}
            loading={dashboard.isLoading}
            accent
            icon={<Target className="size-4" aria-hidden />}
            hint="devam eden yağ oranı hedefi"
          />
          <StatTile
            label="Antrenman · 7g"
            value={int(d?.workouts7d)}
            loading={dashboard.isLoading}
            icon={<Dumbbell className="size-4" aria-hidden />}
            chart={<Sparkline values={series.map((s) => s.workouts)} color={CHART.brand} className="h-full w-full" />}
          />
          <StatTile
            label="Öğün · 7g"
            value={int(d?.meals7d)}
            loading={dashboard.isLoading}
            icon={<Utensils className="size-4" aria-hidden />}
            chart={<Sparkline values={series.map((s) => s.meals)} color={CHART.info} className="h-full w-full" />}
          />
          <StatTile
            label="Tarama · 7g"
            value={int(d?.scans7d)}
            loading={dashboard.isLoading}
            icon={<Camera className="size-4" aria-hidden />}
            chart={<Sparkline values={series.map((s) => s.scans)} color={CHART.success} className="h-full w-full" />}
          />
          <StatTile
            label="Günlük ortalama"
            value={series.length ? num(series.reduce((s, x) => s + x.meals, 0) / series.length, 1) : "—"}
            loading={dashboard.isLoading}
            icon={<Activity className="size-4" aria-hidden />}
            hint="öğün / gün (14 gün)"
          />
        </motion.div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader eyebrow="Son 14 gün" title="Aktivite" description="Kaydedilen antrenman, öğün ve fotoğraf taraması sayısı." />
          <CardBody>
            {dashboard.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : series.length === 0 ? (
              <p className="py-16 text-center text-[13px] text-muted">Gösterilecek aktivite yok.</p>
            ) : (
              <ActivityChart data={series} />
            )}
          </CardBody>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader eyebrow="Servisler" title="Sistem durumu" />
            <CardBody className="space-y-3">
              {health.isLoading ? (
                <CardSkeleton lines={4} />
              ) : health.isError ? (
                <ErrorState compact error={health.error} onRetry={() => void health.refetch()} />
              ) : (
                <>
                  <HealthRow
                    icon={<Database className="size-4" aria-hidden />}
                    label="Veritabanı"
                    value={health.data?.db === "ok" ? "Çalışıyor" : "Erişilemiyor"}
                    tone={health.data?.db === "ok" ? "success" : "danger"}
                  />
                  <HealthRow
                    icon={<Camera className="size-4" aria-hidden />}
                    label="Görüntü servisi"
                    value={health.data?.vision.ok ? (health.data.vision.mock ? "Mock mod" : "Model yüklü") : "Kapalı"}
                    tone={health.data?.vision.ok ? (health.data.vision.mock ? "warn" : "success") : "danger"}
                    detail={health.data?.vision.latencyMs !== null ? `${int(health.data?.vision.latencyMs)} ms` : undefined}
                  />
                  <HealthRow
                    icon={<Server className="size-4" aria-hidden />}
                    label="API sürümü"
                    value={health.data?.version ?? "—"}
                    tone="neutral"
                    detail={health.data ? `${Math.floor(health.data.uptimeSec / 3600)} sa çalışıyor` : undefined}
                  />
                  <p className="pt-1 text-xs text-subtle">Son kontrol {relative(health.data?.checkedAt)}</p>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <FlooBubble
                mood="happy"
                text="Panel hazır. Kas hedeflerini güncellersen mobil taraf anında yeni değerlerle çalışır."
                size={52}
              />
              <div className="mt-4 flex flex-col gap-1">
                <QuickLink href="/users" label="Kullanıcı ekle veya düzenle" />
                <QuickLink href="/programs" label="Program şablonu hazırla" />
                <QuickLink href="/goals-settings" label="Hedef motorunu ayarla" />
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function HealthRow({
  icon,
  label,
  value,
  tone,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "success" | "warn" | "danger" | "neutral";
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-subtle">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        {detail && <p className="text-xs text-subtle tnum">{detail}</p>}
      </div>
      <Badge tone={tone} dot>
        {value}
      </Badge>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-2 rounded-lg border border-transparent px-2.5 py-2 text-[13px] text-muted transition-colors hover:border-line hover:bg-surface-2 hover:text-ink"
    >
      {label}
      <ArrowUpRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </Link>
  );
}
