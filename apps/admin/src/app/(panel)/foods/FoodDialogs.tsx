"use client";

import { useState } from "react";
import { Check, Download, Plus } from "lucide-react";
import { zFoodInput, type FoodDTO, type FoodInput } from "@fitfloow/core";
import { int, num } from "@/lib/format";
import { errorMessage, useImportFoods, useSaveFood } from "@/lib/queries";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, NumberInput, Segmented, Switch } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Overlay";
import { Callout, EmptyState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";

export function FoodDialog({ open, onClose, food }: { open: boolean; onClose: () => void; food: FoodDTO | null }) {
  const isEdit = Boolean(food);
  const toast = useToast();
  const [name, setName] = useState(food?.name ?? "");
  const [nameEn, setNameEn] = useState(food?.nameEn ?? "");
  const [category, setCategory] = useState(food?.category ?? "diğer");
  const [brand, setBrand] = useState(food?.brand ?? "");
  const [barcode, setBarcode] = useState(food?.barcode ?? "");
  const [kcal, setKcal] = useState(String(food?.per100g.kcal ?? 0));
  const [protein, setProtein] = useState(String(food?.per100g.protein ?? 0));
  const [carbs, setCarbs] = useState(String(food?.per100g.carbs ?? 0));
  const [fat, setFat] = useState(String(food?.per100g.fat ?? 0));
  const [serving, setServing] = useState(String(food?.defaultServingG ?? 100));
  const [aliases, setAliases] = useState((food?.aliases ?? []).join(", "));
  const [verified, setVerified] = useState(food?.verified ?? false);
  const [error, setError] = useState<string | null>(null);

  const save = useSaveFood({
    onDone: () => {
      toast.success(isEdit ? "Besin güncellendi" : "Besin eklendi", name);
      onClose();
    },
    onFail: (e) => setError(errorMessage(e)),
  });

  // Atwater cross-check: macros should roughly reproduce the stated calories.
  const derivedKcal = 4 * Number(protein) + 4 * Number(carbs) + 9 * Number(fat);
  const drift = Number(kcal) > 0 ? Math.abs(derivedKcal - Number(kcal)) / Number(kcal) : 0;

  const submit = () => {
    const input: FoodInput = {
      name: name.trim(),
      nameEn: nameEn.trim() || null,
      aliases: aliases
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      category: category.trim() || "diğer",
      per100g: { kcal: Number(kcal), protein: Number(protein), carbs: Number(carbs), fat: Number(fat) },
      defaultServingG: Number(serving) || 100,
      servings: food?.servings ?? [{ label: "porsiyon", grams: Number(serving) || 100 }],
      barcode: barcode.trim() || null,
      verified,
      brand: brand.trim() || null,
    };
    const parsed = zFoodInput.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · "));
      return;
    }
    setError(null);
    save.mutate({ id: food?.id ?? null, input: parsed.data });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Besini düzenle" : "Yeni besin"}
      description="Değerler 100 gram içindir. Takma adlar fotoğraf tarama etiketleriyle eşleşmek için kullanılır."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>
            {isEdit ? "Kaydet" : "Ekle"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Callout tone="danger">{error}</Callout>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ad" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tavuk göğsü (ızgara)" data-autofocus />
          </Field>
          <Field label="İngilizce ad" hint="Vision etiketleriyle eşleşmeye yardımcı olur.">
            <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Grilled chicken breast" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Kategori">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="et" />
          </Field>
          <Field label="Marka">
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="—" />
          </Field>
          <Field label="Barkod">
            <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="8690000000000" spellCheck={false} />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">100 g için</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Kalori" required>
              <NumberInput unit="kcal" min={0} max={900} value={kcal} onChange={(e) => setKcal(e.target.value)} />
            </Field>
            <Field label="Protein" required>
              <NumberInput unit="g" min={0} max={100} step={0.1} value={protein} onChange={(e) => setProtein(e.target.value)} />
            </Field>
            <Field label="Karbonhidrat" required>
              <NumberInput unit="g" min={0} max={100} step={0.1} value={carbs} onChange={(e) => setCarbs(e.target.value)} />
            </Field>
            <Field label="Yağ" required>
              <NumberInput unit="g" min={0} max={100} step={0.1} value={fat} onChange={(e) => setFat(e.target.value)} />
            </Field>
          </div>
          {drift > 0.15 && (
            <p className="mt-2 text-xs text-warn">
              Makrolardan hesaplanan kalori {int(derivedKcal)} kcal — girilen değerden %{int(drift * 100)} sapıyor. Kontrol et.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Varsayılan porsiyon" hint="Mobil uygulamada önerilen gramaj.">
            <NumberInput unit="g" min={1} max={2000} value={serving} onChange={(e) => setServing(e.target.value)} />
          </Field>
          <Field label="Takma adlar" hint="Virgülle ayır: chicken_breast, grilled_chicken">
            <Input value={aliases} onChange={(e) => setAliases(e.target.value)} spellCheck={false} />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3.5 py-3">
          <div>
            <p className="text-[13px] font-medium text-ink">Doğrulanmış</p>
            <p className="mt-0.5 text-xs text-muted">Doğrulanmış besinler aramada öne çıkar.</p>
          </div>
          <Switch checked={verified} onChange={setVerified} label="Doğrulanmış" />
        </div>
      </div>
    </Dialog>
  );
}

export function ImportFoodsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"off" | "usda">("off");
  const [results, setResults] = useState<FoodDTO[]>([]);
  const [error, setError] = useState<string | null>(null);

  const importFoods = useImportFoods({
    onFail: (e) => setError(errorMessage(e)),
  });

  const run = async () => {
    if (!query.trim()) {
      setError("Aranacak bir terim gir.");
      return;
    }
    setError(null);
    const res = await importFoods.mutateAsync({ query: query.trim(), source, limit: 5 });
    setResults(res.foods);
    toast.success(`${res.foods.length} besin içe aktarıldı`, source === "off" ? "Open Food Facts" : "USDA");
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Besin içe aktar"
      description="Dış kaynaktan arama yapıp sonuçları yerel veritabanına ekler. Değerleri sonradan düzenleyebilirsin."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Kapat
          </Button>
          <Button variant="primary" icon={<Download className="size-3.5" />} onClick={() => void run()} loading={importFoods.isPending}>
            İçe aktar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Callout tone="danger">{error}</Callout>}

        <div className="flex items-end gap-3">
          <Field label="Arama" className="flex-1" required>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="mercimek çorbası" data-autofocus />
          </Field>
          <Segmented
            label="Kaynak"
            value={source}
            onChange={setSource}
            options={[
              { value: "off", label: "Open Food Facts" },
              { value: "usda", label: "USDA" },
            ]}
          />
        </div>

        {results.length === 0 ? (
          <EmptyState
            compact
            mascot={false}
            icon={<Download className="size-5" aria-hidden />}
            title="Henüz sonuç yok"
            description="Bir terim yazıp içe aktar; eklenen besinler aşağıda listelenir."
          />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {results.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                <Check className="size-3.5 shrink-0 text-success" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{f.name}</span>
                  <span className="text-xs tnum text-subtle">
                    {int(f.per100g.kcal)} kcal · P {num(f.per100g.protein, 1)} · K {num(f.per100g.carbs, 1)} · Y {num(f.per100g.fat, 1)}
                  </span>
                </span>
                <Badge tone="neutral">{f.source.toUpperCase()}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

export function EmptyFoodsAction({ onCreate, onImport }: { onCreate: () => void; onImport: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={onCreate}>
        Yeni besin
      </Button>
      <Button size="sm" icon={<Download className="size-3.5" />} onClick={onImport}>
        İçe aktar
      </Button>
    </div>
  );
}
