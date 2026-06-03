import { dbConnect } from "@/lib/mongodb";
import { BodyEntry } from "@/lib/models";
import { json, requireUser, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireUser();
  if ("response" in auth) return auth.response;
  try {
    await dbConnect();
    await BodyEntry.deleteOne({ _id: params.id, userId: auth.userId });
    return json({ ok: true });
  } catch (e: any) {
    return serverError(e?.message);
  }
}
