"use client";

import { useMemo, useState } from "react";
import { Info, Plus, Trash2 } from "lucide-react";
import { validateRateTable, type Gender, type RateBand } from "@fitfloow/core";
import { cx } from "@/lib/cx";
import { num } from "@/lib/format";
import { Button, IconButton } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Field";
import { InlineEdit, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/Table";
import { Callout } from "@/components/ui/States";

const SEX_TR: Record<Gender, string> = { male: "Erkek", female: "Kadın" };

/**
 * Rate-table editor. Bands must be contiguous and cover 0..100 per sex — `validateRateTable`
 * from core is the single source of truth for that rule, and the page refuses to save while
 * it reports problems.
 */
export function RateTableEditor({ bands, onChange }: { bands: RateBand[]; onChange: (next: RateBand[]) => void }) {
  const [sex, setSex] = useState<Gender>("male");
  const problems = useMemo(() => validateRateTable(bands), [bands]);
  const sexProblems = problems.filter((p) => p.startsWith(sex));

  const rows = useMemo(() => bands.map((b, i) => ({ band: b, index: i })).filter((r) => r.band.sex === sex).sort((a, b) => a.band.bfMin - b.band.bfMin), [bands, sex]);

  const patch = (index: number, changes: Partial<RateBand>) => onChange(bands.map((b, i) => (i === index ? { ...b, ...changes } : b)));

  const addBand = () => {
    const last = rows[rows.length - 1]?.band;
    const bfMin = last ? Math.min(99, last.bfMax) : 0;
    const next: RateBand = {
      sex,
      bfMin,
      bfMax: 100,
      conservativePctBwPerWeek: last?.conservativePctBwPerWeek ?? 0.5,
      optimalPctBwPerWeek: last?.optimalPctBwPerWeek ?? 0.75,
      aggressivePctBwPerWeek: last?.aggressivePctBwPerWeek ?? 1,
      maxKgPerWeek: last?.maxKgPerWeek ?? 1,
      note: "",
      sourceUrl: "",
    };
    onChange([...bands, next]);
  };

  const removeBand = (index: number) => onChange(bands.filter((_, i) => i !== index));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <Segmented
          label="Cinsiyet"
          value={sex}
          onChange={setSex}
          options={[
            { value: "male", label: SEX_TR.male },
            { value: "female", label: SEX_TR.female },
          ]}
        />
        <Button size="sm" icon={<Plus className="size-3.5" />} onClick={addBand}>
          Bant ekle
        </Button>
      </div>

      {problems.length > 0 && (
        <div className="px-5 pt-4">
          <Callout tone="danger" title="Oran tablosu geçersiz">
            <ul className="mt-1 list-disc space-y-0.5 pl-4" data-testid="rate-table-problems">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Callout>
        </div>
      )}

      <TableWrap>
        <Table className="min-w-[46rem]">
          <THead>
            <tr>
              <TH width="9rem">Yağ % aralığı</TH>
              <TH align="right" width="6.5rem">
                Temkinli
              </TH>
              <TH align="right" width="6.5rem">
                Optimal
              </TH>
              <TH align="right" width="6.5rem">
                Agresif
              </TH>
              <TH align="right" width="6.5rem">
                Maks kg/hf
              </TH>
              <TH>Not</TH>
              <TH align="right" width="3.5rem">
                <span className="sr-only">İşlem</span>
              </TH>
            </tr>
          </THead>
          <tbody>
            {rows.map(({ band, index }, i) => {
              const gap = i > 0 && rows[i - 1].band.bfMax !== band.bfMin;
              return (
                <TR key={index} className={cx(gap && "bg-danger-soft/40")}>
                  <TD>
                    <div className="flex items-center gap-1">
                      <InlineEdit
                        label={`${SEX_TR[band.sex]} ${i + 1}. bant alt sınır`}
                        value={band.bfMin}
                        type="number"
                        min={0}
                        max={100}
                        align="right"
                        className="w-14"
                        onCommit={(v) => patch(index, { bfMin: Math.max(0, Math.min(100, Number(v) || 0)) })}
                      />
                      <span className="text-subtle" aria-hidden>
                        –
                      </span>
                      <InlineEdit
                        label={`${SEX_TR[band.sex]} ${i + 1}. bant üst sınır`}
                        value={band.bfMax}
                        type="number"
                        min={0}
                        max={100}
                        align="right"
                        className="w-14"
                        onCommit={(v) => patch(index, { bfMax: Math.max(0, Math.min(100, Number(v) || 0)) })}
                      />
                    </div>
                  </TD>
                  {(["conservativePctBwPerWeek", "optimalPctBwPerWeek", "aggressivePctBwPerWeek"] as const).map((field) => (
                    <TD key={field} align="right">
                      <InlineEdit
                        label={`${SEX_TR[band.sex]} ${band.bfMin}-${band.bfMax} ${
                          field === "conservativePctBwPerWeek" ? "temkinli" : field === "optimalPctBwPerWeek" ? "optimal" : "agresif"
                        } oran`}
                        value={band[field]}
                        type="number"
                        min={0}
                        max={3}
                        step={0.05}
                        align="right"
                        suffix=" %"
                        onCommit={(v) => patch(index, { [field]: Math.max(0, Math.min(3, Number(v) || 0)) })}
                      />
                    </TD>
                  ))}
                  <TD align="right">
                    <InlineEdit
                      label={`${SEX_TR[band.sex]} ${band.bfMin}-${band.bfMax} maksimum kg`}
                      value={band.maxKgPerWeek}
                      type="number"
                      min={0}
                      max={3}
                      step={0.05}
                      align="right"
                      onCommit={(v) => patch(index, { maxKgPerWeek: Math.max(0, Math.min(3, Number(v) || 0)) })}
                    />
                  </TD>
                  <TD className="max-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-xs text-muted" title={band.note}>
                        {band.note || "—"}
                      </span>
                      {band.sourceUrl && (
                        <a
                          href={band.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={band.sourceUrl}
                          aria-label="Kaynağı aç"
                          className="shrink-0 text-subtle transition-colors hover:text-brand-text"
                        >
                          <Info className="size-3.5" aria-hidden />
                        </a>
                      )}
                    </span>
                  </TD>
                  <TD align="right">
                    <IconButton
                      label={`${SEX_TR[band.sex]} ${band.bfMin}-${band.bfMax} bandını sil`}
                      size="sm"
                      variant="danger"
                      onClick={() => removeBand(index)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </IconButton>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>

      <div className="border-t border-line px-5 py-3 text-xs text-subtle">
        {rows.length} bant · {SEX_TR[sex]} · {sexProblems.length === 0 ? "0–100 aralığı kesintisiz kapsanıyor." : `${sexProblems.length} sorun var.`}{" "}
        Oranlar vücut ağırlığının haftalık yüzdesi; {num(0.5, 1)} % = 100 kg için 0,5 kg/hafta.
      </div>
    </div>
  );
}
