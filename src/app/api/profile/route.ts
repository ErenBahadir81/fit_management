import { dbConnect } from "@/lib/mongodb";
import { User } from "@/lib/models";
import { toUserDTO } from "@/lib/serialize";
import { json, requireUser, serverError, badRequest } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = requireUser();
  if ("response" in auth) return auth.response;
  try {
    await dbConnect();
    const user = await User.findById(auth.userId);
    if (!user) return badRequest("Kullanıcı yok");
    return json({ user: toUserDTO(user) });
  } catch (e: any) {
    return serverError(e?.message);
  }
}

export async function PUT(req: Request) {
  const auth = requireUser();
  if ("response" in auth) return auth.response;
  try {
    const body = await req.json();
    const update: Record<string, unknown> = {};
    if (body.gender === "male" || body.gender === "female") update.gender = body.gender;
    if (typeof body.heightCm === "number") update.heightCm = body.heightCm;
    if (typeof body.displayName === "string" && body.displayName.trim())
      update.displayName = body.displayName.trim();

    await dbConnect();
    const user = await User.findByIdAndUpdate(auth.userId, update, { new: true });
    if (!user) return badRequest("Kullanıcı yok");
    return json({ user: toUserDTO(user) });
  } catch (e: any) {
    return serverError(e?.message);
  }
}
