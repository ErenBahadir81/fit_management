"use client";

import { useState } from "react";
import { Card, Spinner } from "@/components/ui";
import { Trash2 } from "lucide-react";
import { apiSend } from "@/lib/fetcher";
import { fmtNum } from "@/lib/utils";
import type { BodyEntryDTO } from "@/lib/types";

function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Row({
  entry,
  onDeleted,
}: {
  entry: BodyEntryDTO;
  onDeleted: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await apiSend(`/api/body/${entry.id}`, "DELETE");
      await onDeleted();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{fullDate(entry.date)}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted tabular-nums">
          <span>
            <span className="text-recovering font-semibold">
              %{fmtNum(entry.bodyFatPct, 1)}
            </span>{" "}
            yağ
          </span>
          <span>{fmtNum(entry.weightKg, 1)} kg</span>
          <span>{fmtNum(entry.leanMassKg, 1)} kg yağsız</span>
        </div>
      </div>
      <button
        onClick={remove}
        disabled={busy}
        aria-label="Ölçümü sil"
        className="tap h-9 w-9 grid place-items-center rounded-full bg-surface-2 text-muted shrink-0 disabled:opacity-50"
      >
        {busy ? <Spinner className="h-4 w-4" /> : <Trash2 size={16} />}
      </button>
    </div>
  );
}

export function HistoryList({
  entries,
  onChanged,
}: {
  /** Gösterim sırasıyla (yeniden eskiye) */
  entries: BodyEntryDTO[];
  onChanged: () => void | Promise<void>;
}) {
  return (
    <Card className="overflow-hidden divide-y divide-border">
      {entries.map((e) => (
        <Row key={e.id} entry={e} onDeleted={onChanged} />
      ))}
    </Card>
  );
}
