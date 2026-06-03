"use client";

import { useState } from "react";
import { mutate } from "swr";
import { Card, CardBody, Button, Badge } from "@/components/ui";
import {
  Dumbbell,
  Footprints,
  Check,
  CheckCircle2,
  SkipForward,
  Pencil,
  MoonStar,
  Flame,
  Timer,
} from "lucide-react";
import { fmtNum, fmtMinutes, fmtPace } from "@/lib/utils";
import { apiSend } from "@/lib/fetcher";
import type { DayDTO, WorkoutLogDTO } from "@/lib/types";
import { LogSheet } from "./LogSheet";

interface TodayCardProps {
  day: DayDTO;
  todayLog: WorkoutLogDTO | null;
}

export function TodayCard({ day, todayLog }: TodayCardProps) {
  const [logOpen, setLogOpen] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const completed = !!todayLog && !todayLog.isOffDay;
  const offDay = !!todayLog && todayLog.isOffDay;

  async function refresh() {
    await Promise.all([mutate("/api/program"), mutate("/api/recovery"), mutate("/api/workouts")]);
  }

  async function doSkip() {
    setSkipping(true);
    setErr(null);
    try {
      await apiSend("/api/program/skip", "POST");
      await refresh();
      setConfirmSkip(false);
    } catch (e: any) {
      setErr(e?.message || "Atlanamadı");
    } finally {
      setSkipping(false);
    }
  }

  const Icon = day.kind === "run" ? Footprints : Dumbbell;

  /* ------------------------------- completed ------------------------------ */
  if (completed && todayLog) {
    return (
      <>
        <Card>
          <CardBody className="p-5">
            <div className="flex items-center gap-2.5">
              <span className="h-10 w-10 grid place-items-center rounded-2xl bg-ready/12 text-ready">
                <CheckCircle2 size={22} />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ready leading-tight">
                  Bugün tamamlandı ✓
                </p>
                <p className="font-extrabold text-lg leading-tight truncate">
                  {todayLog.title}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {todayLog.strength.map((e, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2.5"
                >
                  <span className="font-semibold text-sm truncate">{e.name}</span>
                  <span className="text-xs font-bold text-muted tabular-nums shrink-0">
                    {e.sets.length} set ·{" "}
                    {e.sets.map((s) => s.reps).join("·")} tkr
                  </span>
                </div>
              ))}
              {todayLog.run && (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
                  <span className="font-semibold text-sm inline-flex items-center gap-1.5">
                    <Footprints size={15} className="text-primary" /> Koşu
                  </span>
                  <span className="text-xs font-bold text-muted tabular-nums shrink-0">
                    {fmtNum(todayLog.run.totalKm)} km · {fmtMinutes(todayLog.run.totalMin)} ·{" "}
                    {fmtPace(
                      todayLog.run.totalKm > 0
                        ? todayLog.run.totalMin / todayLog.run.totalKm
                        : 0
                    )}
                  </span>
                </div>
              )}
            </div>

            <Button
              variant="soft"
              fullWidth
              className="mt-4"
              onClick={() => setLogOpen(true)}
            >
              <Pencil size={16} /> Düzenle
            </Button>
          </CardBody>
        </Card>

        <LogSheet
          open={logOpen}
          onClose={() => setLogOpen(false)}
          day={day}
          existing={todayLog}
          onSaved={refresh}
        />
      </>
    );
  }

  /* -------------------------------- off-day ------------------------------- */
  if (offDay) {
    return (
      <Card>
        <CardBody className="p-5">
          <div className="flex items-center gap-3">
            <span className="h-12 w-12 grid place-items-center rounded-2xl bg-surface-2 text-muted">
              <MoonStar size={24} />
            </span>
            <div>
              <p className="font-extrabold text-lg leading-tight">
                Bugün dinlenme · atlandı
              </p>
              <p className="text-sm text-muted mt-0.5">
                Program kaymadı, sıradaki gün korunuyor.
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 flex items-center gap-2">
            <Icon size={16} className="text-primary shrink-0" />
            <span className="text-sm font-semibold">Sıradaki: {day.title}</span>
            {day.focus && (
              <span className="text-xs text-muted truncate">· {day.focus}</span>
            )}
          </div>
        </CardBody>
      </Card>
    );
  }

  /* -------------------------------- pending ------------------------------- */
  const totalSets = day.exercises.reduce((a, e) => a + e.targetSets, 0);
  return (
    <>
      <Card>
        <CardBody className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-bold uppercase tracking-wide text-primary">
                {day.order}. Gün · Sıradaki
              </p>
              <h2 className="text-2xl font-extrabold leading-tight mt-0.5 truncate">
                {day.title}
              </h2>
              {day.focus && (
                <div className="mt-1.5">
                  <Badge color="var(--primary)">
                    <Flame size={12} /> {day.focus}
                  </Badge>
                </div>
              )}
            </div>
            <span className="h-12 w-12 grid place-items-center rounded-2xl bg-primary-soft text-primary shrink-0">
              <Icon size={24} />
            </span>
          </div>

          <div className="mt-4 space-y-1.5">
            {day.exercises.map((e, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2.5"
              >
                <span className="font-semibold text-sm truncate">{e.name}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-bold text-muted tabular-nums">
                    {e.targetSets}×{e.targetReps}
                  </span>
                  {e.targetRIR !== null && (
                    <Badge color="var(--muted)">RIR {e.targetRIR}</Badge>
                  )}
                </span>
              </div>
            ))}
            {day.run && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
                <span className="font-semibold text-sm inline-flex items-center gap-1.5">
                  <Footprints size={15} className="text-primary" />{" "}
                  {day.run.label || "Koşu"}
                </span>
                <span className="text-xs font-bold text-muted tabular-nums shrink-0">
                  {fmtNum(day.run.targetKm)} km · {Math.round(day.run.targetMin)} dk
                </span>
              </div>
            )}
            {day.exercises.length === 0 && !day.run && (
              <div className="flex items-center gap-2 text-muted text-sm py-2">
                <Timer size={16} /> Bu gün için hedef tanımlı değil.
              </div>
            )}
          </div>

          {totalSets > 0 && (
            <p className="text-[12px] text-muted mt-3 px-0.5">
              Toplam {totalSets} set hedefleniyor.
            </p>
          )}

          <div className="mt-4 space-y-2">
            <Button
              fullWidth
              size="lg"
              onClick={() => setLogOpen(true)}
            >
              <Check size={18} /> Antrenmanı Tamamla
            </Button>

            {confirmSkip ? (
              <div className="rounded-2xl border border-border bg-surface-2/60 p-3">
                <p className="text-sm font-semibold text-center">
                  Bugünü dinlenme olarak işaretle?
                </p>
                <p className="text-[12px] text-muted text-center mt-0.5">
                  Program kaymaz — bu gün yarın tekrar gelir.
                </p>
                {err && (
                  <p className="text-xs text-fatigued text-center mt-1.5">{err}</p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setConfirmSkip(false);
                      setErr(null);
                    }}
                  >
                    Vazgeç
                  </Button>
                  <Button
                    variant="soft"
                    loading={skipping}
                    onClick={doSkip}
                  >
                    <SkipForward size={16} /> Atla
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="soft"
                fullWidth
                onClick={() => setConfirmSkip(true)}
              >
                <SkipForward size={16} /> Atla
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <LogSheet
        open={logOpen}
        onClose={() => setLogOpen(false)}
        day={day}
        existing={null}
        onSaved={refresh}
      />
    </>
  );
}
