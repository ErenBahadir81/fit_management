import { resetSeed } from "@/lib/seed";
import { json, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

function parseUser(url: URL): string {
  const u = (url.searchParams.get("user") || "eren").toLowerCase();
  return u === "inci" ? "inci" : "eren";
}

/** ?index=0..N önceliklidir; yoksa ?day=1..N; ikisi de yoksa 1. gün. resetSeed ayrıca clamp eder. */
function parseStart(url: URL): number {
  const idxRaw = url.searchParams.get("index");
  if (idxRaw !== null && idxRaw.trim() !== "") {
    const idx = Number(idxRaw);
    if (Number.isInteger(idx) && idx >= 0) return idx;
  }
  const dayRaw = url.searchParams.get("day");
  if (dayRaw !== null && dayRaw.trim() !== "") {
    const day = Number(dayRaw);
    if (Number.isInteger(day) && day >= 1) return day - 1;
  }
  return 0;
}

async function run(url: URL) {
  const r = await resetSeed(parseUser(url), parseStart(url));
  return json({
    ok: true,
    ...r,
    message: `${r.user} sıfırlandı — program ${r.startDay}. günden (${r.dayTitle}) başlıyor.`,
  });
}

export async function POST(req: Request) {
  try {
    return await run(new URL(req.url));
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
      warning:
        "Bu işlem seçili kullanıcının TÜM verisini (program, kayıtlar, vücut, diyet) siler ve sıfırdan oluşturur.",
      usage:
        "Onaylamak için ?confirm=1 ekle. Kullanıcı: ?user=eren|inci, başlangıç günü: &day=N.",
    });
  }
  try {
    return await run(url);
  } catch (e: any) {
    return serverError(e?.message);
  }
}
