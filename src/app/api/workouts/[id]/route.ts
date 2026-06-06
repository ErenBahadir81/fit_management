import { dbConnect } from "@/lib/mongodb";
import { WorkoutLog } from "@/lib/models";
import { requireUser, json, badRequest, serverError } from "@/lib/http";
import {
  buildRunEntry,
  sanitizeSegments,
  sanitizeStrengthEntries,
  toWorkoutLogDTO,
} from "../../_lib/program-util";

export const dynamic = "force-dynamic";

interface CardioBody {
  segments?: { km: number; min: number }[];
}
interface EditBody {
  strength?: unknown;
  run?: CardioBody | null;
  swim?: CardioBody | null;
}

/**
 * Mevcut bir antrenman kaydını ID ile düzenler.
 * İşaretçiye DOKUNMAZ, hafta ilerletmez, kardiyo hedefi progression'ı yapmaz.
 * Bu sayede "tamamlanmış günü düzenle" işlemi sıradaki günle karışmaz.
 */
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireUser();
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as EditBody;

    await dbConnect();
    const log = await WorkoutLog.findOne({
      _id: params.id,
      userId: auth.userId,
    });
    if (!log) return badRequest("Kayıt bulunamadı");
    if (log.isOffDay) return badRequest("Dinlenme günü düzenlenemez");

    const strength = sanitizeStrengthEntries(body?.strength);
    const runSegs = sanitizeSegments(body?.run?.segments);
    const swimSegs = sanitizeSegments(body?.swim?.segments);

    log.strength = strength;
    log.run = buildRunEntry(runSegs, log.run?.targetKm ?? 0, log.run?.targetMin ?? 0);
    log.swim = buildRunEntry(swimSegs, log.swim?.targetKm ?? 0, log.swim?.targetMin ?? 0);
    log.markModified("strength");
    log.markModified("run");
    log.markModified("swim");
    await log.save();

    return json({ log: toWorkoutLogDTO(log) });
  } catch (e: any) {
    return serverError(e?.message);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireUser();
  if ("response" in auth) return auth.response;

  try {
    await dbConnect();
    const res = await WorkoutLog.deleteOne({
      _id: params.id,
      userId: auth.userId,
    });
    if (res.deletedCount === 0) return badRequest("Kayıt bulunamadı");
    return json({ ok: true });
  } catch (e: any) {
    return serverError(e?.message);
  }
}
