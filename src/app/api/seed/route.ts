import { ensureSeeded } from "@/lib/seed";
import { json, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

async function run() {
  try {
    await ensureSeeded();
    return json({ ok: true });
  } catch (e: any) {
    return serverError(e?.message || "Seed başarısız");
  }
}

export const GET = run;
export const POST = run;
