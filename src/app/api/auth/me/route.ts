import { dbConnect } from "@/lib/mongodb";
import { User } from "@/lib/models";
import { ensureSeeded } from "@/lib/seed";
import { getUserId } from "@/lib/auth";
import { toUserDTO } from "@/lib/serialize";
import { json, unauthorized, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();
    const uid = getUserId();
    if (!uid) return unauthorized();
    await dbConnect();
    const user = await User.findById(uid);
    if (!user) return unauthorized();
    return json({ user: toUserDTO(user) });
  } catch (e: any) {
    return serverError(e?.message || "Hata");
  }
}
