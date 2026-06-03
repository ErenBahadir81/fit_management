import { resetSeed } from "@/lib/seed";
import { json, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** ?index=0..6 önceliklidir; yoksa ?day=1..7; ikisi de yoksa 1. gün. */
function parseStart(url: URL): number {
  const idx = Number(url.searchParams.get("index"));
  if (Number.isInteger(idx) && idx >= 0 && idx <= 6) return idx;
  const day = Number(url.searchParams.get("day"));
  if (Number.isInteger(day) && day >= 1 && day <= 7) return day - 1;
  return 0;
}

export async function POST(req: Request) {
  try {
    const r = await resetSeed(parseStart(new URL(req.url)));
    return json({
      ok: true,
      ...r,
      message: `Veritabanı sıfırlandı — program ${r.startDay}. günden (${r.dayTitle}) başlıyor.`,
    });
  } catch (e: any) {
    return serverError(e?.message);
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const confirm = url.searchParams.get("confirm");
  if (confirm !== "1" && confirm !== "yes" && confirm !== "true") {
    return json({
      ok: false,
      warning: "Bu işlem Eren'e ait TÜM veriyi (program, kayıtlar, vücut, diyet) siler ve sıfırdan oluşturur.",
      usage: "Onaylamak için ?confirm=1 ekle. Başlangıç günü için &day=4 (1-7).",
    });
  }
  try {
    const r = await resetSeed(parseStart(url));
    return json({
      ok: true,
      ...r,
      message: `Veritabanı sıfırlandı — program ${r.startDay}. günden (${r.dayTitle}) başlıyor.`,
    });
  } catch (e: any) {
    return serverError(e?.message);
  }
}
