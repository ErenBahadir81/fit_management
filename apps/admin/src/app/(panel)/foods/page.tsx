"use client";

import { useState } from "react";
import { Apple, BadgeCheck, Download, Pencil, Plus, Trash2 } from "lucide-react";
import type { FoodDTO } from "@fitfloow/core";
import { useDebounced } from "@/hooks/useDebounced";
import { int, num } from "@/lib/format";
import { errorMessage, useDeleteFood, useFoods, useSaveFood } from "@/lib/queries";
import { PageHeader } from "@/components/layout/PanelShell";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/Overlay";
import { SearchInput } from "@/components/ui/SearchInput";
import { InlineEdit, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/Table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { FoodDialog, ImportFoodsDialog } from "./FoodDialogs";

const SOURCE_TR: Record<FoodDTO["source"], string> = { seed: "Çekirdek", off: "OFF", usda: "USDA", user: "Kullanıcı", admin: "Yönetici" };

export default function FoodsPage() {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const debounced = useDebounced(query);
  const { data, isLoading, isError, error, refetch } = useFoods({ q: debounced || undefined, source: source || undefined });

  const [dialog, setDialog] = useState<{ open: boolean; food: FoodDTO | null; seq: number }>({ open: false, food: null, seq: 0 });
  const [importOpen, setImportOpen] = useState(false);
  const [toDelete, setToDelete] = useState<FoodDTO | null>(null);

  const toast = useToast();
  const patch = useSaveFood({ onFail: (e) => toast.error("Güncellenemedi", errorMessage(e)) });
  const remove = useDeleteFood({
    onDone: () => {
      toast.success("Besin silindi");
      setToDelete(null);
    },
    onFail: (e) => toast.error("Silinemedi", errorMessage(e)),
  });

  const foods = data?.foods ?? [];
  const open = (food: FoodDTO | null) => setDialog((d) => ({ open: true, food, seq: d.seq + 1 }));

  const patchMacro = (food: FoodDTO, field: "kcal" | "protein" | "carbs" | "fat", raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    patch.mutate({
      id: food.id,
      input: {
        name: food.name,
        nameEn: food.nameEn,
        aliases: food.aliases,
        category: food.category,
        per100g: { ...food.per100g, [field]: value },
        defaultServingG: food.defaultServingG,
        servings: food.servings,
        barcode: food.barcode,
        verified: food.verified,
        brand: food.brand ?? null,
      },
    });
  };

  return (
    <>
      <PageHeader
        eyebrow="Katalog"
        title="Besinler"
        description="100 gram başına değerler. Takma adlar fotoğraf taramasındaki model etiketleriyle eşleşir."
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} placeholder="Besin, takma ad…" className="w-56" />
            <Select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Kaynağa göre filtrele" className="w-36">
              <option value="">Tüm kaynaklar</option>
              {Object.entries(SOURCE_TR).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => setImportOpen(true)}>
              İçe aktar
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => open(null)}>
              Yeni besin
            </Button>
          </>
        }
      />

      <Card>
        <TableWrap>
          <Table className="min-w-[54rem]">
            <THead>
              <tr>
                <TH width="18rem">Besin</TH>
                <TH align="right" width="6rem">
                  kcal
                </TH>
                <TH align="right" width="5.5rem">
                  Protein
                </TH>
                <TH align="right" width="5.5rem">
                  Karb.
                </TH>
                <TH align="right" width="5.5rem">
                  Yağ
                </TH>
                <TH align="right" width="6rem">
                  Porsiyon
                </TH>
                <TH width="7rem">Kaynak</TH>
                <TH align="right" width="6rem">
                  İşlem
                </TH>
              </tr>
            </THead>

            {isLoading ? (
              <TableSkeleton rows={8} cols={8} />
            ) : (
              <tbody>
                {foods.map((food) => (
                  <TR key={food.id}>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-ink">{food.name}</span>
                        {food.verified && <BadgeCheck className="size-3.5 shrink-0 text-success" aria-label="Doğrulanmış" />}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-subtle">
                        {[food.brand, food.category, food.aliases.slice(0, 2).join(", ")].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </TD>
                    <TD align="right">
                      <InlineEdit
                        label={`${food.name} kalorisi`}
                        value={int(food.per100g.kcal)}
                        type="number"
                        min={0}
                        max={900}
                        align="right"
                        onCommit={(v) => patchMacro(food, "kcal", v)}
                      />
                    </TD>
                    <TD align="right">
                      <InlineEdit
                        label={`${food.name} proteini`}
                        value={num(food.per100g.protein, 1)}
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        align="right"
                        onCommit={(v) => patchMacro(food, "protein", v)}
                      />
                    </TD>
                    <TD align="right">
                      <InlineEdit
                        label={`${food.name} karbonhidratı`}
                        value={num(food.per100g.carbs, 1)}
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        align="right"
                        onCommit={(v) => patchMacro(food, "carbs", v)}
                      />
                    </TD>
                    <TD align="right">
                      <InlineEdit
                        label={`${food.name} yağı`}
                        value={num(food.per100g.fat, 1)}
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        align="right"
                        onCommit={(v) => patchMacro(food, "fat", v)}
                      />
                    </TD>
                    <TD align="right" numeric className="text-muted">
                      {int(food.defaultServingG)} g
                    </TD>
                    <TD>
                      <Badge tone={food.source === "admin" || food.source === "seed" ? "brand" : "neutral"}>{SOURCE_TR[food.source]}</Badge>
                    </TD>
                    <TD align="right">
                      <div className="flex items-center justify-end gap-0.5">
                        <IconButton label={`${food.name} düzenle`} size="sm" onClick={() => open(food)}>
                          <Pencil className="size-3.5" aria-hidden />
                        </IconButton>
                        <IconButton label={`${food.name} sil`} size="sm" variant="danger" onClick={() => setToDelete(food)}>
                          <Trash2 className="size-3.5" aria-hidden />
                        </IconButton>
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            )}
          </Table>
        </TableWrap>

        {isError && <ErrorState error={error} onRetry={() => void refetch()} />}
        {!isLoading && !isError && foods.length === 0 && (
          <EmptyState
            icon={<Apple className="size-5" aria-hidden />}
            title={debounced || source ? "Eşleşen besin yok" : "Besin veritabanı boş"}
            description={
              debounced || source
                ? "Filtreyi temizle ya da dış kaynaktan içe aktar."
                : "Türkçe besinlerle başla veya Open Food Facts'ten içe aktar."
            }
            action={
              <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => open(null)}>
                  Yeni besin
                </Button>
                <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => setImportOpen(true)}>
                  İçe aktar
                </Button>
              </div>
            }
          />
        )}
      </Card>

      {!isLoading && foods.length > 0 && (
        <p className="mt-3 text-xs text-subtle">
          {foods.length} besin{data?.total && data.total > foods.length ? ` (toplam ${int(data.total)})` : ""} · hücrelere tıklayarak
          düzenleyebilirsin
        </p>
      )}

      <FoodDialog key={dialog.seq} open={dialog.open} food={dialog.food} onClose={() => setDialog((d) => ({ ...d, open: false }))} />
      <ImportFoodsDialog open={importOpen} onClose={() => setImportOpen(false)} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        pending={remove.isPending}
        title="Besini sil"
        message={`“${toDelete?.name ?? ""}” veritabanından kaldırılacak. Daha önce kaydedilmiş öğünler etkilenmez.`}
      />
    </>
  );
}
