import { dbConnect } from "@/lib/mongodb";
import { DietTarget, DietLog } from "@/lib/models";
import { requireUser, json, badRequest, serverError } from "@/lib/http";
import { WEEKDAYS_TR } from "@/lib/utils";
import { trDateKey, trMondayIndexFromKey, trShiftKey } from "@/lib/time";
import type { DietItemDTO, DietTargetDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const DEFAULT_TARGET = { calories: 2500, protein: 175, carbs: 260, fat: 75 };

type Meal = DietItemDTO["meal"];
const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

interface Totals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function emptyTotals(): Totals {
  return { calories: 0, protein: 0, carbs: 0, fat: 0 };
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Mongo doc -> temiz DietItemDTO */
function toItemDTO(raw: any): DietItemDTO {
  const meal: Meal = MEALS.includes(raw?.meal) ? raw.meal : "snack";
  return {
    name: String(raw?.name ?? ""),
    qty: toNum(raw?.qty) || 1,
    calories: toNum(raw?.calories),
    protein: toNum(raw?.protein),
    carbs: toNum(raw?.carbs),
    fat: toNum(raw?.fat),
    meal,
  };
}

function sumItems(items: DietItemDTO[]): Totals {
  return items.reduce<Totals>((acc, it) => {
    acc.calories += it.calories;
    acc.protein += it.protein;
    acc.carbs += it.carbs;
    acc.fat += it.fat;
    return acc;
  }, emptyTotals());
}

function toTargetDTO(doc: any): DietTargetDTO {
  return {
    calories: toNum(doc?.calories),
    protein: toNum(doc?.protein),
    carbs: toNum(doc?.carbs),
    fat: toNum(doc?.fat),
  };
}

/** verilen günden geriye doğru `count` adet dateKey (artan sırada, Türkiye günleri) */
function lastKeys(baseKey: string, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) keys.push(trShiftKey(baseKey, -i));
  return keys;
}

export async function GET(req: Request) {
  const auth = requireUser();
  if ("response" in auth) return auth.response;

  try {
    await dbConnect();

    const url = new URL(req.url);
    const qDate = url.searchParams.get("date");
    const dateKey =
      qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate) ? qDate : trDateKey();

    // Hedef (yoksa varsayılan oluştur)
    let targetDoc = await DietTarget.findOne({ userId: auth.userId }).lean();
    if (!targetDoc) {
      const created = await DietTarget.create({
        userId: auth.userId,
        ...DEFAULT_TARGET,
      });
      targetDoc = created.toObject();
    }
    const target = toTargetDTO(targetDoc);

    // Seçili günün kayıtları
    const log = await DietLog.findOne({
      userId: auth.userId,
      dateKey,
    }).lean();
    const items: DietItemDTO[] = ((log as any)?.items ?? []).map(toItemDTO);
    const totals = sumItems(items);

    // Son 7 gün geçmişi (seçili gün dahil, artan sırada, eksik günler 0)
    const keys = lastKeys(dateKey, 7);
    const logs = await DietLog.find({
      userId: auth.userId,
      dateKey: { $in: keys },
    }).lean();

    const byKey = new Map<string, Totals>();
    for (const l of logs as any[]) {
      const t = sumItems((l?.items ?? []).map(toItemDTO));
      byKey.set(l.dateKey, t);
    }

    const history = keys.map((key) => {
      const t = byKey.get(key) ?? emptyTotals();
      return {
        dateKey: key,
        weekdayShort: WEEKDAYS_TR[trMondayIndexFromKey(key)],
        calories: t.calories,
        protein: t.protein,
        carbs: t.carbs,
        fat: t.fat,
      };
    });

    return json({ dateKey, target, items, totals, history });
  } catch (e: any) {
    return serverError(e?.message);
  }
}

export async function POST(req: Request) {
  const auth = requireUser();
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json()) as { item?: Partial<DietItemDTO> };
    const raw = body?.item;
    if (!raw || typeof raw.name !== "string" || !raw.name.trim()) {
      return badRequest("Besin adı gerekli");
    }

    const item: DietItemDTO = {
      name: raw.name.trim(),
      qty: Math.max(0, toNum(raw.qty)) || 1,
      calories: Math.max(0, toNum(raw.calories)),
      protein: Math.max(0, toNum(raw.protein)),
      carbs: Math.max(0, toNum(raw.carbs)),
      fat: Math.max(0, toNum(raw.fat)),
      meal: MEALS.includes(raw.meal as Meal) ? (raw.meal as Meal) : "snack",
    };

    await dbConnect();
    const dateKey = trDateKey();
    const log = await DietLog.findOneAndUpdate(
      { userId: auth.userId, dateKey },
      { $push: { items: item }, $setOnInsert: { userId: auth.userId, dateKey } },
      { upsert: true, new: true }
    ).lean();

    const items: DietItemDTO[] = ((log as any)?.items ?? []).map(toItemDTO);
    return json({ items, totals: sumItems(items) });
  } catch (e: any) {
    return serverError(e?.message);
  }
}

export async function DELETE(req: Request) {
  const auth = requireUser();
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json()) as { index?: number };
    const index = Number(body?.index);
    if (!Number.isInteger(index) || index < 0) {
      return badRequest("Geçersiz öğe");
    }

    await dbConnect();
    const dateKey = trDateKey();
    const log = await DietLog.findOne({ userId: auth.userId, dateKey });

    if (!log || !Array.isArray(log.items) || index >= log.items.length) {
      const items: DietItemDTO[] = ((log as any)?.items ?? []).map(toItemDTO);
      return json({ items, totals: sumItems(items) });
    }

    log.items.splice(index, 1);
    log.markModified("items");
    await log.save();

    const items: DietItemDTO[] = (log.items ?? []).map(toItemDTO);
    return json({ items, totals: sumItems(items) });
  } catch (e: any) {
    return serverError(e?.message);
  }
}
