"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, RotateCcw, X } from "lucide-react";
import type { ExerciseActivationReference, MuscleDTO } from "@fitfloow/core";
import { cx } from "@/lib/cx";
import { num } from "@/lib/format";
import { LOAD_STEP, formatLoad, loadDiffers, parseLoadInput, snapLoad } from "@/lib/muscleLoad";
import { Button } from "@/components/ui/Button";

type RefMuscle = ExerciseActivationReference["muscles"][number];
type RefSource = ExerciseActivationReference["sources"][number];

const LEVEL_TR = { high: "yüksek güven", medium: "orta güven", low: "düşük güven" } as const;
const LEVEL_BARS = { high: 3, medium: 2, low: 1 } as const;
const KIND_TR: Record<RefSource["kind"], string> = { exrx: "ExRx", emg: "EMG", "volume-method": "Set sayımı", review: "Derleme" };

export type ReferenceState = { status: "none" } | { status: "loading" } | { status: "error" } | { status: "ready"; reference: ExerciseActivationReference | null };

interface Row {
  key: string;
  name: string;
  color: string;
  /** Not one of the active muscles (e.g. the retired `legs`): shown only so it can be removed. */
  retired: boolean;
}

/**
 * Per-muscle load editor (0–1, step 0.05) with the seeded literature value, its confidence and its
 * sources shown read-only next to each muscle. Every active muscle has a row; a key the exercise
 * holds that is no longer active gets a row too, so it can be taken out.
 */
export function MuscleLoadEditor({
  muscles,
  loads,
  onChange,
  onReplaceAll,
  reference,
}: {
  muscles: MuscleDTO[];
  loads: Record<string, number>;
  /** `null` removes the pair. */
  onChange: (key: string, load: number | null) => void;
  onReplaceAll: (next: Record<string, number>) => void;
  reference: ReferenceState;
}) {
  const ref = reference.status === "ready" ? reference.reference : null;
  const refByKey = useMemo(() => new Map((ref?.muscles ?? []).map((m) => [m.key, m])), [ref]);
  const sourceById = useMemo(() => new Map((ref?.sources ?? []).map((s) => [s.id, s])), [ref]);

  const rows = useMemo<Row[]>(() => {
    const active = [...muscles].filter((m) => m.active).sort((a, b) => a.order - b.order);
    const known = new Map(muscles.map((m) => [m.key, m]));
    const shown = new Set(active.map((m) => m.key));
    const extra = Object.keys(loads)
      .filter((key) => !shown.has(key))
      .map((key) => {
        const m = known.get(key);
        return { key, name: m?.name ?? key, color: m?.color ?? "var(--ff-text-subtle)", retired: true };
      });
    return [...active.map((m) => ({ key: m.key, name: m.name, color: m.color, retired: false })), ...extra];
  }, [muscles, loads]);

  const selected = Object.entries(loads).filter(([, v]) => v > 0);
  const total = selected.reduce((a, [, v]) => a + v, 0);
  const differsFromReference =
    ref !== null &&
    (ref.muscles.some((m) => loadDiffers(loads[m.key], m.load)) || selected.some(([key]) => !refByKey.has(key)));

  return (
    <section aria-labelledby="muscle-loads-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p id="muscle-loads-title" className="text-[13px] font-medium text-ink">
            Kas yükleri
          </p>
          <p className="mt-0.5 text-xs text-muted" aria-live="polite">
            {selected.length > 0 ? `${selected.length} kas seçili · toplam yük ${num(total, 2)}` : "Henüz kas seçilmedi."}
          </p>
        </div>
        {ref && (
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw className="size-3.5" aria-hidden />}
            disabled={!differsFromReference}
            onClick={() => onReplaceAll(Object.fromEntries(ref.muscles.map((m) => [m.key, m.load])))}
          >
            Literatür değerlerine dön
          </Button>
        )}
      </div>

      <ReferenceNote state={reference} />

      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
        {rows.map((row) => (
          <LoadRow
            key={row.key}
            row={row}
            value={loads[row.key] ?? 0}
            literature={refByKey.get(row.key) ?? null}
            sources={sourceById}
            onChange={(load) => onChange(row.key, load)}
          />
        ))}
      </ul>
    </section>
  );
}

function ReferenceNote({ state }: { state: ReferenceState }) {
  if (state.status === "none") return null;
  let text: string;
  if (state.status === "loading") text = "Literatür değerleri yükleniyor…";
  else if (state.status === "error") text = "Literatür değerleri alınamadı; yükleri yine de düzenleyebilirsin.";
  else if (!state.reference) text = "Bu hareket için literatür değeri yok (katalog dışı).";
  else
    text = `Literatür ortalaması (${state.reference.version}) salt okunurdur: her kasın yanında değeri, güveni ve kaynakları. Salonda revize ettiğin değerleri buraya gir ve kaydet.`;
  return <p className="mb-3 text-xs leading-relaxed text-subtle">{text}</p>;
}

function LoadRow({
  row,
  value,
  literature,
  sources,
  onChange,
}: {
  row: Row;
  value: number;
  literature: RefMuscle | null;
  sources: Map<string, RefSource>;
  onChange: (load: number | null) => void;
}) {
  const on = value > 0;
  const revised = literature !== null && loadDiffers(on ? value : undefined, literature.load);
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const commit = (text: string) => {
    setDraft(null);
    const parsed = parseLoadInput(text);
    if (parsed === null) return; // empty or out of range → keep the previous value
    if (parsed === 0) onChange(null);
    else onChange(Math.max(LOAD_STEP, snapLoad(parsed)));
  };

  const nudge = (dir: 1 | -1) => {
    const next = snapLoad(value + dir * LOAD_STEP);
    onChange(next > 0 ? next : null);
  };

  return (
    <li className={cx(on ? "bg-brand-soft/35" : "bg-surface")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 sm:flex-nowrap">
        <button
          type="button"
          onClick={() => onChange(on ? null : (literature?.load ?? 1))}
          aria-pressed={on}
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: row.color }} />
          <span className={cx("truncate text-[13px]", on ? "font-medium text-ink" : "text-muted")}>{row.name}</span>
          {row.retired && <span className="shrink-0 rounded border border-line px-1 text-[10px] leading-4 text-subtle">pasif</span>}
        </button>

        <input
          type="range"
          min={0}
          max={1}
          step={LOAD_STEP}
          value={value}
          aria-label={`${row.name} yükü`}
          aria-valuetext={on ? formatLoad(value) : "yok"}
          onChange={(e) => {
            setDraft(null);
            const next = snapLoad(Number(e.target.value));
            onChange(next > 0 ? next : null);
          }}
          className={cx(
            "h-1 w-28 shrink-0 cursor-pointer appearance-none rounded-full bg-line",
            on ? "accent-[var(--ff-brand)]" : "accent-[var(--ff-text-subtle)]"
          )}
        />

        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={`${row.name} yükü (sayı)`}
          value={draft ?? (on ? formatLoad(value) : "")}
          placeholder="—"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(e.currentTarget.value);
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              setDraft(null);
              nudge(e.key === "ArrowUp" ? 1 : -1);
            }
          }}
          className="h-8 w-14 shrink-0 rounded-md border border-line bg-surface px-2 text-right text-[13px] tnum text-ink placeholder:text-subtle hover:border-line-strong focus-visible:border-brand focus-visible:outline-none"
        />

        {literature ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panelId}
            title={`Literatür ${formatLoad(literature.load)} · ${LEVEL_TR[literature.confidence.level]} (${literature.confidence.n} tahmin, fark ${formatLoad(literature.confidence.spread)})`}
            className={cx(
              "inline-flex h-7 w-[7rem] shrink-0 items-center gap-1.5 rounded-md border px-1.5 text-[11px] tnum transition-colors duration-[140ms] ease-out",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              open ? "border-line-strong bg-surface-3 text-ink" : "border-line bg-surface-2 text-muted hover:text-ink"
            )}
          >
            <span className="sr-only">Literatür değeri</span>
            <span aria-hidden className="text-subtle">
              Lit.
            </span>
            <span className="min-w-7">{formatLoad(literature.load)}</span>
            <ConfidenceBars level={literature.confidence.level} />
            <span className="sr-only">{LEVEL_TR[literature.confidence.level]}, kaynakları göster</span>
            {revised && (
              <>
                <span aria-hidden title="Literatürden farklı" className="size-1.5 rounded-full bg-info" />
                <span className="sr-only">(değer literatürden farklı)</span>
              </>
            )}
            <ChevronDown aria-hidden className={cx("ml-auto size-3 transition-transform duration-[140ms] ease-out", open && "rotate-180")} />
          </button>
        ) : (
          <span aria-hidden className="inline-flex h-7 w-[7rem] shrink-0 items-center justify-center text-[11px] text-subtle">
            —
          </span>
        )}

        <button
          type="button"
          aria-label={`${row.name} yükünü kaldır`}
          onClick={() => onChange(null)}
          disabled={!on}
          className="grid size-6 shrink-0 place-items-center rounded text-subtle hover:text-ink disabled:invisible"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      {literature && open && (
        <div id={panelId} className="border-t border-line bg-surface-2 px-3 py-2.5 sm:pl-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              Literatür ortalaması <span className="font-medium text-ink tnum">{formatLoad(literature.load)}</span> ·{" "}
              {LEVEL_TR[literature.confidence.level]} · {literature.confidence.n} tahmin, en büyük fark{" "}
              <span className="tnum">{formatLoad(literature.confidence.spread)}</span>
            </p>
            <Button variant="quiet" size="sm" disabled={!revised} onClick={() => onChange(literature.load)}>
              Bu değeri uygula
            </Button>
          </div>
          <ul className="mt-2 space-y-1.5" aria-label={`${row.name} kaynakları`}>
            {literature.sources.map((id) => {
              const src = sources.get(id);
              return (
                <li key={id} className="flex items-start gap-2 text-xs leading-snug">
                  <span className="mt-px w-[4.25rem] shrink-0 rounded border border-line bg-surface px-1 text-center text-[10px] leading-4 text-muted">
                    {src ? KIND_TR[src.kind] : "?"}
                  </span>
                  {src ? (
                    <a href={src.url} target="_blank" rel="noreferrer noopener" className="group min-w-0 break-words text-ink hover:text-brand-text">
                      {src.title}
                      {src.year && !src.title.includes(String(src.year)) ? ` (${src.year})` : ""}
                      <ExternalLink aria-hidden className="ml-1 inline size-3 align-[-2px] text-subtle group-hover:text-brand-text" />
                    </a>
                  ) : (
                    <span className="text-muted">{id}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </li>
  );
}

function ConfidenceBars({ level }: { level: RefMuscle["confidence"]["level"] }) {
  const filled = LEVEL_BARS[level];
  return (
    <span aria-hidden className="inline-flex items-end gap-[2px]">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cx("w-[3px] rounded-[1px]", i <= filled ? "bg-current" : "bg-line-strong")}
          style={{ height: 4 + i * 2 }}
        />
      ))}
    </span>
  );
}
