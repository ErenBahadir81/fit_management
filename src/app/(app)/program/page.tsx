"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProfileButton } from "@/components/layout/ProfileButton";
import {
  Card,
  CardBody,
  Button,
  Badge,
  PageLoader,
  SectionTitle,
  EmptyState,
} from "@/components/ui";
import {
  Footprints,
  Waves,
  Pencil,
  CalendarRange,
  Info,
  Play,
  Check,
} from "lucide-react";
import { cn, fmtNum } from "@/lib/utils";
import { apiSend } from "@/lib/fetcher";
import type { ExerciseMetric, ExerciseTargetDTO, DayDTO, ProgramDTO, WorkoutLogDTO } from "@/lib/types";
import { EditDaySheet } from "@/components/workout/EditDaySheet";
import type { ScheduleEntry } from "@/components/workout/WeekStrip";
import { kindIcon } from "@/components/workout/workout-ui";

/** Hedef metni (reps -> 5×10, time -> 5×30 sn, stretch -> Esneme). */
function targetText(e: ExerciseTargetDTO): string {
  const metric: ExerciseMetric = e.metric ?? "reps";
  if (metric === "stretch") return "Esneme / Mobilite";
  if (metric === "time") return `${e.targetSets}×${e.targetReps} sn`;
  return `${e.targetSets}×${e.targetReps}`;
}

interface ProgramResponse {
  program: ProgramDTO;
  current: { index: number; day: DayDTO };
  todayLog: WorkoutLogDTO | null;
  schedule: ScheduleEntry[];
}

export default function ProgramPage() {
  const { data, error } = useSWR<ProgramResponse>("/api/program");
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const program = data?.program;
  const loading = !data && !error;

  return (
    <>
      <AppHeader
        title="Program"
        subtitle={
          program ? `Hafta ${program.weekNumber} · ${program.name}` : undefined
        }
        right={<ProfileButton />}
      />

      <div className="px-5 py-4 space-y-5">
        {loading ? (
          <PageLoader />
        ) : error || !data || !program ? (
          <EmptyState
            icon={<CalendarRange size={24} />}
            title="Program yüklenemedi"
            desc="Lütfen birazdan tekrar dene."
          />
        ) : (
          <>
            {/* Takvim haritası */}
            <section>
              <SectionTitle title="Sıradaki 7 Gün" />
              <Card>
                <CardBody className="p-2">
                  {data.schedule.map((s) => {
                    const today = s.offset === 0;
                    const Icon = kindIcon(s.kind);
                    return (
                      <div
                        key={s.offset}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl px-3 py-2.5",
                          today && "bg-primary-soft/60"
                        )}
                      >
                        <span
                          className={cn(
                            "w-20 shrink-0 text-[13px] font-bold",
                            today ? "text-primary" : "text-ink"
                          )}
                        >
                          {s.weekdayLong}
                        </span>
                        <span
                          className={cn(
                            "h-8 w-8 grid place-items-center rounded-xl shrink-0",
                            today
                              ? "bg-primary text-white"
                              : "bg-surface-2 text-muted"
                          )}
                        >
                          <Icon size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm leading-tight truncate">
                            {s.title}
                          </p>
                          {s.focus && (
                            <p className="text-[11px] text-muted truncate">
                              {s.focus}
                            </p>
                          )}
                        </div>
                        {today && <Badge color="var(--primary)">Bugün</Badge>}
                      </div>
                    );
                  })}
                </CardBody>
              </Card>
              <div className="mt-2 flex items-start gap-2 px-1">
                <Info size={14} className="text-muted shrink-0 mt-0.5" />
                <p className="text-[12px] text-muted leading-snug">
                  Bir günü atlarsan program otomatik kayar.
                </p>
              </div>
            </section>

            {/* Gün kartları */}
            <section>
              <SectionTitle title="Günler" />
              <div className="mb-3 flex items-start gap-2 px-1">
                <Info size={14} className="text-muted shrink-0 mt-0.5" />
                <p className="text-[12px] text-muted leading-snug">
                  İstediğin günden devam edebilirsin; sıra korunur, yorgunluk
                  etkilenmez.
                </p>
              </div>
              <div className="space-y-3">
                {program.days.map((day, i) => (
                  <DayCard
                    key={i}
                    day={day}
                    isCurrent={i === program.currentIndex}
                    onEdit={() => setEditIndex(i)}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {editIndex !== null && program && (
        <EditDaySheet
          open={editIndex !== null}
          onClose={() => setEditIndex(null)}
          day={program.days[editIndex]}
          dayIndex={editIndex}
        />
      )}
    </>
  );
}

function DayCard({
  day,
  isCurrent,
  onEdit,
}: {
  day: DayDTO;
  isCurrent: boolean;
  onEdit: () => void;
}) {
  const Icon = kindIcon(day.kind);
  const [confirm, setConfirm] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function jumpHere() {
    setJumping(true);
    setErr(null);
    try {
      // order 1..N -> index 0..N-1 (döngü uzunluğu sabit değil). Sıra korunur, yorgunluk etkilenmez.
      await apiSend("/api/program/current", "PUT", { index: day.order - 1 });
      await mutate("/api/program");
      setConfirm(false);
    } catch (e: any) {
      setErr(e?.message || "Güncellenemedi");
    } finally {
      setJumping(false);
    }
  }

  return (
    <Card className={cn(isCurrent && "ring-2 ring-primary/30")}>
      <CardBody className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="h-10 w-10 grid place-items-center rounded-2xl bg-primary-soft text-primary shrink-0 text-sm font-extrabold">
              {day.order}.
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-lg leading-tight truncate">
                  {day.title}
                </h3>
                {isCurrent && <Badge color="var(--primary)">Sıradaki</Badge>}
              </div>
              {day.focus && (
                <p className="text-[13px] text-muted truncate">{day.focus}</p>
              )}
            </div>
          </div>
          <span className="h-9 w-9 grid place-items-center rounded-xl bg-surface-2 text-muted shrink-0">
            <Icon size={17} />
          </span>
        </div>

        <div className="mt-3 space-y-1.5">
          {day.exercises.map((e, i) => {
            const isStretch = (e.metric ?? "reps") === "stretch";
            return (
              <div
                key={i}
                className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2"
              >
                <span className="font-medium text-sm truncate">{e.name}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-bold text-muted tabular-nums">
                    {targetText(e)}
                  </span>
                  {!isStretch && e.targetRIR !== null && (
                    <Badge color="var(--muted)">RIR {e.targetRIR}</Badge>
                  )}
                </span>
              </div>
            );
          })}
          {day.run && (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
              <span className="font-medium text-sm inline-flex items-center gap-1.5">
                <Footprints size={14} className="text-primary" />{" "}
                {day.run.label || "Koşu"}
              </span>
              <span className="text-xs font-bold text-muted tabular-nums shrink-0">
                {fmtNum(day.run.targetKm)} km · {Math.round(day.run.targetMin)} dk
              </span>
            </div>
          )}
          {day.swim && (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
              <span className="font-medium text-sm inline-flex items-center gap-1.5">
                <Waves size={14} className="text-primary" />{" "}
                {day.swim.label || "Yüzme"}
              </span>
              <span className="text-xs font-bold text-muted tabular-nums shrink-0">
                {fmtNum(day.swim.targetKm)} km · {Math.round(day.swim.targetMin)} dk
              </span>
            </div>
          )}
          {day.exercises.length === 0 && !day.run && !day.swim && (
            <p className="text-sm text-muted px-1 py-1">Hedef tanımlı değil.</p>
          )}
        </div>

        {isCurrent ? (
          <Button
            variant="ghost"
            fullWidth
            size="sm"
            className="mt-3"
            onClick={onEdit}
          >
            <Pencil size={15} /> Düzenle
          </Button>
        ) : confirm ? (
          <div className="mt-3 rounded-2xl border border-border bg-surface-2/60 p-3">
            <p className="text-sm font-semibold text-center">
              {day.order}. günden devam edilsin mi?
            </p>
            <p className="text-[12px] text-muted text-center mt-0.5">
              Sıra korunur, yorgunluk etkilenmez.
            </p>
            {err && (
              <p className="text-xs text-fatigued text-center mt-1.5">{err}</p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirm(false);
                  setErr(null);
                }}
              >
                Vazgeç
              </Button>
              <Button loading={jumping} onClick={jumpHere}>
                <Check size={16} /> Evet
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil size={15} /> Düzenle
            </Button>
            <Button variant="soft" size="sm" onClick={() => setConfirm(true)}>
              <Play size={15} /> Buradan devam et
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
