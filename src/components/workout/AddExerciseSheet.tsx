"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet, Button, Input, Badge, Segmented } from "@/components/ui";
import { Plus, Dumbbell, Sparkles, Check, Clock, StretchHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { muscleName, MUSCLE_ORDER, MuscleKey } from "@/lib/muscles";
import { EXERCISE_CATALOG, ExerciseDef } from "@/lib/exercises";
import type { ExerciseMetric, SetEntryDTO } from "@/lib/types";

/** LogSheet'in çalışma listesindeki tek seans hareketi. */
export interface SessionEntry {
  name: string;
  muscles: MuscleKey[];
  plannedSets: number;
  plannedReps: number;
  plannedRIR: number | null;
  source: "planned" | "extra";
  skipped: boolean;
  /** reps -> tekrar, time -> saniye, stretch -> esneme/mobilite */
  metric: ExerciseMetric;
  sets: SetEntryDTO[];
}

interface AddExerciseSheetProps {
  open: boolean;
  onClose: () => void;
  /** Zaten listede olan adlar (katalogda "ekli" rozeti için). */
  existingNames: string[];
  onAdd: (entry: SessionEntry) => void;
}

const METRIC_OPTIONS: { value: ExerciseMetric; label: string }[] = [
  { value: "reps", label: "Tekrar" },
  { value: "time", label: "Süre" },
  { value: "stretch", label: "Esneme" },
];

/** Bir hareketi metric'ine göre uygun başlangıç setleriyle kurar (extra). */
function makeEntry(
  name: string,
  muscles: MuscleKey[],
  metric: ExerciseMetric,
  seedSets: number,
  seedValue: number
): SessionEntry {
  let sets: SetEntryDTO[];
  if (metric === "stretch") {
    // Esneme: ekstra eklendiğinde "yapıldı" varsayılır.
    sets = [{ reps: 1, rir: null }];
  } else {
    sets = Array.from({ length: Math.max(1, seedSets) }, () => ({
      reps: seedValue,
      rir: null,
    }));
  }
  return {
    name,
    muscles,
    plannedSets: 0,
    plannedReps: 0,
    plannedRIR: null,
    source: "extra",
    skipped: false,
    metric,
    sets,
  };
}

function catalogToEntry(def: ExerciseDef): SessionEntry {
  const metric = def.metric ?? "reps";
  // time -> defaultReps saniyedir; reps -> defaultReps tekrardır.
  return makeEntry(def.name, def.muscles, metric, def.defaultSets, def.defaultReps);
}

/** Süre tabanlı hareketler için makul varsayılan saniye. */
const DEFAULT_TIME_SECONDS = 30;
const DEFAULT_REPS = 10;

function metricIcon(metric: ExerciseMetric) {
  if (metric === "time") return Clock;
  if (metric === "stretch") return StretchHorizontal;
  return Dumbbell;
}

export function AddExerciseSheet({
  open,
  onClose,
  existingNames,
  onAdd,
}: AddExerciseSheetProps) {
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState("");
  const [muscles, setMuscles] = useState<MuscleKey[]>([]);
  const [metric, setMetric] = useState<ExerciseMetric>("reps");

  // Sheet her açıldığında özel-hareket formunu sıfırla.
  useEffect(() => {
    if (!open) return;
    setCustom(false);
    setName("");
    setMuscles([]);
    setMetric("reps");
  }, [open]);

  const has = useMemo(
    () => new Set(existingNames.map((n) => n.toLowerCase())),
    [existingNames]
  );

  function toggleMuscle(k: MuscleKey) {
    setMuscles((prev) =>
      prev.includes(k) ? prev.filter((m) => m !== k) : [...prev, k]
    );
  }

  // Esnemede kas seçimi gerekmez; tekrar/süre için ≥1 kas şart.
  const musclesRequired = metric !== "stretch";
  const customValid =
    name.trim().length > 0 && (!musclesRequired || muscles.length > 0);

  function addCustom() {
    const clean = name.trim();
    if (!clean) return;
    if (musclesRequired && muscles.length === 0) return;
    const seedValue = metric === "time" ? DEFAULT_TIME_SECONDS : DEFAULT_REPS;
    onAdd(
      makeEntry(
        clean.slice(0, 80),
        musclesRequired ? muscles : [],
        metric,
        1,
        seedValue
      )
    );
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Hareket Ekle"
      subtitle={custom ? "Özel hareket oluştur" : "Katalogdan seç veya özel ekle"}
      footer={
        custom ? (
          <Button
            fullWidth
            size="lg"
            disabled={!customValid}
            onClick={addCustom}
          >
            <Check size={18} /> Ekle
          </Button>
        ) : undefined
      }
    >
      {custom ? (
        <div className="space-y-4 pb-1">
          <Input
            label="Hareket adı"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Face Pull"
            autoFocus
          />

          <div>
            <span className="block text-sm font-medium text-ink mb-2">
              Ölçü birimi
            </span>
            <Segmented
              value={metric}
              onChange={(v) => setMetric(v)}
              options={METRIC_OPTIONS}
            />
            <p className="text-[12px] text-muted mt-2 px-0.5">
              {metric === "time"
                ? "Süre: her set saniye olarak girilir (örn. plank)."
                : metric === "stretch"
                ? "Esneme/mobilite: kas yükü yok, sadece yapıldı işareti."
                : "Tekrar: klasik set × tekrar."}
            </p>
          </div>

          {musclesRequired && (
            <div>
              <span className="block text-sm font-medium text-ink mb-2">
                Çalışan kaslar
              </span>
              <div className="flex flex-wrap gap-2">
                {MUSCLE_ORDER.map((k) => {
                  const active = muscles.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggleMuscle(k)}
                      className={cn(
                        "tap inline-flex items-center gap-1.5 rounded-full border px-3.5 h-10 text-sm font-semibold transition-colors",
                        active
                          ? "border-primary bg-primary-soft text-primary"
                          : "border-border bg-surface text-muted active:bg-surface-2"
                      )}
                    >
                      {active && <Check size={14} />}
                      {muscleName(k)}
                    </button>
                  );
                })}
              </div>
              {muscles.length === 0 && (
                <p className="text-[12px] text-muted mt-2 px-0.5">
                  En az bir kas grubu seç.
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setCustom(false)}
            className="tap w-full h-11 inline-flex items-center justify-center gap-1.5 rounded-2xl border border-border text-sm font-semibold text-muted active:bg-surface-2"
          >
            Katalogdan seç
          </button>
        </div>
      ) : (
        <div className="space-y-2 pb-2">
          <button
            type="button"
            onClick={() => setCustom(true)}
            className="tap w-full flex items-center justify-between gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary-soft/40 p-3.5 text-left active:bg-primary-soft"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-9 w-9 grid place-items-center rounded-xl bg-primary-soft text-primary shrink-0">
                <Sparkles size={16} />
              </span>
              <div className="min-w-0">
                <p className="font-bold text-primary leading-tight">
                  Özel hareket
                </p>
                <p className="text-[11px] text-muted">
                  Katalogda yoksa kendin tanımla
                </p>
              </div>
            </div>
            <Plus size={18} className="text-primary shrink-0" />
          </button>

          {EXERCISE_CATALOG.map((def) => {
            const added = has.has(def.name.toLowerCase());
            const metric = def.metric ?? "reps";
            const MIcon = metricIcon(metric);
            return (
              <button
                key={def.name}
                type="button"
                onClick={() => {
                  onAdd(catalogToEntry(def));
                  onClose();
                }}
                className="tap w-full flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3.5 text-left active:bg-surface-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <MIcon size={15} className="text-primary shrink-0" />
                    <span className="font-bold truncate">{def.name}</span>
                    {added && <Badge color="var(--primary)">ekli</Badge>}
                  </div>
                  <p className="text-[11px] text-muted mt-1 truncate">
                    {metric === "stretch"
                      ? "Esneme / Mobilite"
                      : def.muscles.map(muscleName).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-semibold text-muted tabular-nums">
                    {metric === "stretch"
                      ? "—"
                      : metric === "time"
                      ? `${def.defaultSets}×${def.defaultReps} sn`
                      : `${def.defaultSets}×${def.defaultReps}`}
                  </span>
                  <span className="h-8 w-8 grid place-items-center rounded-full bg-primary-soft text-primary">
                    <Plus size={16} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
