"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Camera, ImageOff, RefreshCw, ScanLine } from "lucide-react";
import { cx } from "@/lib/cx";
import { itemEnter, listEnter } from "@/lib/motion";
import { int, num, relative } from "@/lib/format";
import { useScans } from "@/lib/queries";
import { PageHeader } from "@/components/layout/PanelShell";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Field";
import { StatTile } from "@/components/ui/Stat";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";

type Filter = "all" | "low" | "empty";

function confidenceTone(confidence: number): Tone {
  if (confidence >= 0.7) return "success";
  if (confidence >= 0.4) return "warn";
  return "danger";
}

export default function ScansPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useScans(40);
  const [filter, setFilter] = useState<Filter>("all");

  const scans = data?.scans ?? [];

  const stats = useMemo(() => {
    const all = scans.flatMap((s) => s.detections);
    const withFood = all.filter((d) => d.food).length;
    const avg = all.length > 0 ? all.reduce((s, d) => s + d.confidence, 0) / all.length : 0;
    const empty = scans.filter((s) => s.detections.length === 0).length;
    return { scans: scans.length, detections: all.length, matchRate: all.length ? (withFood / all.length) * 100 : 0, avg: avg * 100, empty };
  }, [scans]);

  const visible = scans.filter((s) => {
    if (filter === "empty") return s.detections.length === 0;
    if (filter === "low") return s.detections.length > 0 && Math.max(...s.detections.map((d) => d.confidence)) < 0.5;
    return true;
  });

  return (
    <>
      <PageHeader
        eyebrow="Kalite izleme"
        title="Fotoğraf taramaları"
        description="Modelin ne gördüğü, ne kadar emin olduğu ve hangi besinle eşleştiği. Düşük güvenli taramalar besin takma adlarını iyileştirmek için ipucudur."
        actions={
          <Button size="sm" onClick={() => void refetch()} loading={isFetching} icon={<RefreshCw className="size-3.5" />}>
            Yenile
          </Button>
        }
      />

      <motion.div variants={listEnter} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Tarama" value={int(stats.scans)} loading={isLoading} icon={<ScanLine className="size-4" aria-hidden />} hint="son 40 kayıt" />
        <StatTile label="Tespit" value={int(stats.detections)} loading={isLoading} icon={<Camera className="size-4" aria-hidden />} hint="toplam etiket" />
        <StatTile
          label="Eşleşme oranı"
          value={`%${num(stats.matchRate, 0)}`}
          loading={isLoading}
          accent
          hint="besin veritabanında karşılığı bulunan"
        />
        <StatTile label="Ortalama güven" value={`%${num(stats.avg, 0)}`} loading={isLoading} hint={`${int(stats.empty)} boş tarama`} />
      </motion.div>

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.07em] text-subtle">Son taramalar</h2>
        <Segmented
          size="sm"
          label="Tarama filtresi"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Tümü" },
            { value: "low", label: "Düşük güven" },
            { value: "empty", label: "Tespit yok" },
          ]}
        />
      </div>

      {isError ? (
        <Card>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      ) : isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ScanLine className="size-5" aria-hidden />}
            title={filter === "all" ? "Henüz tarama yok" : "Bu filtreye uyan tarama yok"}
            description={
              filter === "all"
                ? "Kullanıcılar mobil uygulamadan yemek fotoğrafı çektiğinde burada listelenir."
                : "Filtreyi değiştirerek tüm taramaları görebilirsin."
            }
          />
        </Card>
      ) : (
        <motion.ul variants={listEnter} initial="hidden" animate="show" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((scan) => {
            const best = scan.detections[0];
            return (
              <motion.li key={scan.id} variants={itemEnter}>
                <Card className="flex h-full flex-col">
                  <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-surface-2 text-subtle">
                      {scan.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={scan.imageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <ImageOff className="size-4" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">@{scan.username}</p>
                      <p className="text-xs text-subtle">{relative(scan.createdAt)}</p>
                    </div>
                    {scan.mock && <Badge tone="warn">Mock</Badge>}
                  </div>

                  <CardBody className="flex-1 p-4">
                    {scan.detections.length === 0 ? (
                      <p className="py-4 text-center text-[13px] text-muted">Model hiçbir yemek tanıyamadı.</p>
                    ) : (
                      <ul className="space-y-2.5">
                        {scan.detections.map((d, i) => (
                          <li key={`${d.label}-${i}`}>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className={cx("truncate text-[13px]", i === 0 ? "font-medium text-ink" : "text-muted")}>{d.labelTr}</span>
                              <Badge tone={confidenceTone(d.confidence)} className="shrink-0">
                                %{num(d.confidence * 100, 0)}
                              </Badge>
                            </div>
                            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-3">
                              <span
                                className="block h-full rounded-full"
                                style={{
                                  width: `${Math.round(d.confidence * 100)}%`,
                                  background:
                                    d.confidence >= 0.7 ? "var(--ff-success)" : d.confidence >= 0.4 ? "var(--ff-warn)" : "var(--ff-danger)",
                                }}
                              />
                            </div>
                            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-subtle">
                              <code className="font-mono">{d.label}</code>
                              <span aria-hidden>→</span>
                              {d.food ? (
                                <span className="text-muted">
                                  {d.food.name} · {int(d.suggestedGrams)} g
                                </span>
                              ) : (
                                <span className="text-danger">veritabanında eşleşme yok</span>
                              )}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardBody>

                  <div className="border-t border-line bg-surface-2 px-4 py-2 text-[11px] text-subtle">
                    {best?.food ? `Kaydedilen: ${best.food.name}` : "Öğüne eklenmedi"}
                  </div>
                </Card>
              </motion.li>
            );
          })}
        </motion.ul>
      )}

      {!isLoading && !isError && scans.length > 0 && (
        <p className="mt-3 text-xs text-subtle">
          {visible.length} / {scans.length} tarama gösteriliyor
        </p>
      )}
    </>
  );
}
