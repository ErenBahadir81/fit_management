"use client";

import { useMemo, useState } from "react";
import { Sheet, Button, Input, Segmented } from "@/components/ui";
import type { SegmentedOption } from "@/components/ui";
import { Percent, AlertCircle } from "lucide-react";
import { navyBodyFat, bodyComposition, bodyFatCategory } from "@/lib/navy";
import type { Gender } from "@/lib/navy";
import { apiSend } from "@/lib/fetcher";
import { fmtNum } from "@/lib/utils";
import type { BodyEntryDTO } from "@/lib/types";

const GENDER_OPTIONS: SegmentedOption<Gender>[] = [
  { value: "male", label: "Erkek" },
  { value: "female", label: "Kadın" },
];

/** Sayısal alan değerini parse eder; boş/geçersizse null. */
function parseNum(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function MeasureSheet({
  open,
  onClose,
  profileGender,
  profileHeightCm,
  lastEntry,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profileGender: Gender;
  profileHeightCm: number | null;
  /** Boyun/bel/kalça ön doldurma için son ölçüm (varsa). */
  lastEntry?: BodyEntryDTO;
  onSaved: () => void | Promise<void>;
}) {
  const [gender, setGender] = useState<Gender>(profileGender);
  const [height, setHeight] = useState<string>(
    profileHeightCm != null ? String(profileHeightCm) : ""
  );
  const [neck, setNeck] = useState<string>(
    lastEntry ? String(lastEntry.neckCm) : ""
  );
  const [waist, setWaist] = useState<string>(
    lastEntry ? String(lastEntry.waistCm) : ""
  );
  const [hip, setHip] = useState<string>(
    lastEntry?.hipCm != null ? String(lastEntry.hipCm) : ""
  );
  const [weight, setWeight] = useState<string>(
    lastEntry ? String(lastEntry.weightKg) : ""
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heightN = parseNum(height);
  const neckN = parseNum(neck);
  const waistN = parseNum(waist);
  const hipN = parseNum(hip);
  const weightN = parseNum(weight);

  const isFemale = gender === "female";

  // Tüm zorunlu alanlar girilmiş mi?
  const fieldsFilled =
    heightN != null &&
    neckN != null &&
    waistN != null &&
    weightN != null &&
    (!isFemale || hipN != null);

  // Canlı önizleme: girilen değerlerle Navy %BF + kompozisyon.
  const preview = useMemo(() => {
    if (
      heightN == null ||
      neckN == null ||
      waistN == null ||
      weightN == null ||
      (isFemale && hipN == null)
    ) {
      return null;
    }
    const bf = navyBodyFat({
      gender,
      heightCm: heightN,
      neckCm: neckN,
      waistCm: waistN,
      hipCm: isFemale ? hipN ?? undefined : undefined,
    });
    if (bf == null) return null;
    const { fatMassKg, leanMassKg } = bodyComposition(weightN, bf);
    return {
      bf,
      fatMassKg,
      leanMassKg,
      category: bodyFatCategory(gender, bf),
    };
  }, [gender, isFemale, heightN, neckN, waistN, hipN, weightN]);

  const valid = fieldsFilled && preview != null;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiSend("/api/body", "POST", {
        gender,
        heightCm: heightN,
        neckCm: neckN,
        waistCm: waistN,
        hipCm: isFemale ? hipN : undefined,
        weightKg: weightN,
      });
      await onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Kaydedilemedi");
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ölçüm Ekle"
      subtitle="US Navy yöntemiyle yağ oranı hesaplanır"
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={saving}
          disabled={!valid}
          onClick={save}
        >
          Kaydet
        </Button>
      }
    >
      <div className="space-y-4 py-1">
        <Segmented value={gender} onChange={setGender} options={GENDER_OPTIONS} />

        <Input
          label="Boy"
          type="number"
          inputMode="decimal"
          suffix="cm"
          placeholder="180"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Boyun"
            type="number"
            inputMode="decimal"
            suffix="cm"
            placeholder="38"
            value={neck}
            onChange={(e) => setNeck(e.target.value)}
          />
          <Input
            label="Bel"
            type="number"
            inputMode="decimal"
            suffix="cm"
            placeholder="84"
            value={waist}
            onChange={(e) => setWaist(e.target.value)}
          />
        </div>

        {isFemale && (
          <Input
            label="Kalça"
            type="number"
            inputMode="decimal"
            suffix="cm"
            placeholder="96"
            value={hip}
            onChange={(e) => setHip(e.target.value)}
          />
        )}

        <Input
          label="Kilo"
          type="number"
          inputMode="decimal"
          suffix="kg"
          placeholder="78"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />

        {/* Canlı önizleme */}
        {preview ? (
          <div className="rounded-2xl bg-primary-soft/60 border border-primary/15 px-4 py-3">
            <div className="flex items-center gap-2 text-primary">
              <Percent size={16} />
              <span className="text-sm font-bold">
                Tahmini yağ oranı: %{fmtNum(preview.bf, 1)}
              </span>
            </div>
            <p className="text-xs text-muted mt-1 tabular-nums">
              Yağsız kütle: {fmtNum(preview.leanMassKg, 1)} kg · Yağ kütlesi:{" "}
              {fmtNum(preview.fatMassKg, 1)} kg · {preview.category}
            </p>
          </div>
        ) : fieldsFilled ? (
          <div className="rounded-2xl bg-fatigued/10 border border-fatigued/20 px-4 py-3 flex items-start gap-2">
            <AlertCircle size={16} className="text-fatigued mt-0.5 shrink-0" />
            <p className="text-xs text-fatigued font-medium">
              Ölçümler geçersiz — bel ölçüsü boyun ölçüsünden büyük olmalı
              {isFemale ? " (kalça dahil)" : ""}.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted px-1">
            Yağ oranını görmek için tüm ölçüleri gir.
          </p>
        )}

        {error && (
          <p className="text-xs text-fatigued font-medium px-1">{error}</p>
        )}
      </div>
    </Sheet>
  );
}
