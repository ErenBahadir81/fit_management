import { dbConnect } from "@/lib/mongodb";
import { DietTarget } from "@/lib/models";
import { requireUser, json, badRequest, serverError } from "@/lib/http";
import type { DietTargetDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function toTargetDTO(doc: any): DietTargetDTO {
  return {
    calories: Number(doc?.calories) || 0,
    protein: Number(doc?.protein) || 0,
    carbs: Number(doc?.carbs) || 0,
    fat: Number(doc?.fat) || 0,
  };
}

export async function PUT(req: Request) {
  const auth = requireUser();
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json()) as Partial<DietTargetDTO>;

    const calories = toNum(body?.calories);
    const protein = toNum(body?.protein);
    const carbs = toNum(body?.carbs);
    const fat = toNum(body?.fat);

    if (
      [calories, protein, carbs, fat].some((n) => Number.isNaN(n) || n < 0)
    ) {
      return badRequest("Hedef değerleri 0 veya daha büyük olmalı");
    }

    await dbConnect();
    const doc = await DietTarget.findOneAndUpdate(
      { userId: auth.userId },
      { $set: { calories, protein, carbs, fat } },
      { upsert: true, new: true }
    ).lean();

    return json({ target: toTargetDTO(doc) });
  } catch (e: any) {
    return serverError(e?.message);
  }
}
