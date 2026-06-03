import { dbConnect } from "@/lib/mongodb";
import { Program } from "@/lib/models";
import { requireUser, json, badRequest, serverError } from "@/lib/http";
import { toProgramDTO } from "../../_lib/program-util";

export const dynamic = "force-dynamic";

/**
 * İşaretçiyi (currentIndex) doğrudan değiştirir — "canım istedi, E'den devam"
 * senaryosu. Sırayı bozmaz (sonraki tamamlamada +1 ilerler) ve yorgunluğu
 * ETKİLEMEZ (yorgunluk yalnız loglardan gelir).
 * Body: { index: 0..6 }  veya  { day: 1..7 }
 */
export async function PUT(req: Request) {
  const auth = requireUser();
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      index?: number;
      day?: number;
    };

    let index: number | null = null;
    if (Number.isInteger(body?.index) && body!.index! >= 0 && body!.index! <= 6) {
      index = body!.index!;
    } else if (Number.isInteger(body?.day) && body!.day! >= 1 && body!.day! <= 7) {
      index = body!.day! - 1;
    }
    if (index === null) return badRequest("Geçersiz gün (0-6 index veya 1-7 day)");

    await dbConnect();
    const program = await Program.findOne({ userId: auth.userId });
    if (!program) return badRequest("Program bulunamadı");
    if (!program.days?.[index]) return badRequest("Gün bulunamadı");

    program.currentIndex = index;
    program.lastActionAt = new Date();
    await program.save();

    return json({ program: toProgramDTO(program) });
  } catch (e: any) {
    return serverError(e?.message);
  }
}
