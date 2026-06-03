import { dbConnect } from "@/lib/mongodb";
import { BodyEntry, User } from "@/lib/models";
import { json, requireUser, badRequest, serverError } from "@/lib/http";
import { navyBodyFat, bodyComposition, Gender } from "@/lib/navy";
import type { BodyEntryDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

function toBodyEntryDTO(e: any): BodyEntryDTO {
  return {
    id: String(e._id),
    date: new Date(e.date).toISOString(),
    gender: e.gender,
    heightCm: e.heightCm,
    neckCm: e.neckCm,
    waistCm: e.waistCm,
    hipCm: e.hipCm ?? null,
    weightKg: e.weightKg,
    bodyFatPct: e.bodyFatPct,
    fatMassKg: e.fatMassKg,
    leanMassKg: e.leanMassKg,
  };
}

function isPositive(n: unknown): n is number {
  return typeof n === "number" && isFinite(n) && n > 0;
}

export async function GET() {
  const auth = requireUser();
  if ("response" in auth) return auth.response;
  try {
    await dbConnect();
    const [docs, user] = await Promise.all([
      BodyEntry.find({ userId: auth.userId }).sort({ date: 1 }).lean(),
      User.findById(auth.userId).lean<{ gender?: Gender; heightCm?: number | null }>(),
    ]);
    const entries: BodyEntryDTO[] = (docs as any[]).map(toBodyEntryDTO);
    return json({
      entries,
      profile: {
        gender: (user?.gender ?? "male") as Gender,
        heightCm: user?.heightCm ?? null,
      },
    });
  } catch (e: any) {
    return serverError(e?.message);
  }
}

export async function POST(req: Request) {
  const auth = requireUser();
  if ("response" in auth) return auth.response;
  try {
    const body = await req.json();
    const gender: Gender = body.gender === "female" ? "female" : "male";
    const heightCm = Number(body.heightCm);
    const neckCm = Number(body.neckCm);
    const waistCm = Number(body.waistCm);
    const weightKg = Number(body.weightKg);
    const hipCm = body.hipCm != null ? Number(body.hipCm) : undefined;

    if (
      !isPositive(heightCm) ||
      !isPositive(neckCm) ||
      !isPositive(waistCm) ||
      !isPositive(weightKg)
    ) {
      return badRequest("Tüm ölçüler sıfırdan büyük olmalı");
    }
    if (gender === "female" && !isPositive(hipCm)) {
      return badRequest("Kadınlar için kalça ölçüsü gerekli");
    }

    const bf = navyBodyFat({ gender, heightCm, neckCm, waistCm, hipCm });
    if (bf == null) {
      return badRequest(
        "Ölçümler geçersiz — bel ölçüsü boyun ölçüsünden büyük olmalı"
      );
    }

    const { fatMassKg, leanMassKg } = bodyComposition(weightKg, bf);

    await dbConnect();
    const created = await BodyEntry.create({
      userId: auth.userId,
      date: new Date(),
      gender,
      heightCm,
      neckCm,
      waistCm,
      hipCm: gender === "female" ? hipCm : null,
      weightKg,
      bodyFatPct: bf,
      fatMassKg,
      leanMassKg,
    });

    // Profil bilgisini güncelle (cinsiyet + boy hatırlansın)
    await User.findByIdAndUpdate(auth.userId, { gender, heightCm });

    return json({ entry: toBodyEntryDTO(created.toObject()) });
  } catch (e: any) {
    return serverError(e?.message);
  }
}
