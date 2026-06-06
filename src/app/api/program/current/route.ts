import { dbConnect } from "@/lib/mongodb";
import { Program } from "@/lib/models";
import { requireUser, json, badRequest, serverError } from "@/lib/http";
import { toProgramDTO } from "../../_lib/program-util";

export const dynamic = "force-dynamic";

/**
 * İşaretçiyi (currentIndex) doğrudan değiştirir — "canım istedi, E'den devam"
 * senaryosu. Sırayı bozmaz (sonraki tamamlamada +1 ilerler) ve yorgunluğu
 * ETKİLEMEZ (yorgunluk yalnız loglardan gelir).
 * Body: { index: 0..days.length-1 }  veya  { day: 1..days.length }
 */
export async function PUT(req: Request) {
  const auth = requireUser();
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      index?: number;
      day?: number;
    };

    await dbConnect();
    const program = await Program.findOne({ userId: auth.userId });
    if (!program) return badRequest("Program bulunamadı");

    const len = program.days?.length || 0;
    if (len === 0) return badRequest("Program boş");

    let index: number | null = null;
    if (Number.isInteger(body?.index) && body!.index! >= 0 && body!.index! < len) {
      index = body!.index!;
    } else if (
      Number.isInteger(body?.day) &&
      body!.day! >= 1 &&
      body!.day! <= len
    ) {
      index = body!.day! - 1;
    }
    if (index === null) return badRequest("Geçersiz gün");

    program.currentIndex = index;
    program.lastActionAt = new Date();
    await program.save();

    return json({ program: toProgramDTO(program) });
  } catch (e: any) {
    return serverError(e?.message);
  }
}
