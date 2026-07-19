import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/mongodb";
import { User, Program } from "@/lib/models";
import { requireAdmin, json, badRequest, serverError } from "@/lib/http";
import { toUserAdminDTO } from "@/lib/serialize";
import { SEED_PROGRAM_DAYS } from "@/lib/program-data";

export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    await dbConnect();
    const users = await User.find({}).sort({ createdAt: 1 });
    return json({ users: users.map(toUserAdminDTO) });
  } catch (e: any) {
    return serverError(e?.message);
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const body = await req.json();
    const username = String(body?.username || "").toLowerCase().trim();
    const displayName = String(body?.displayName || "").trim();
    const password = String(body?.password || "");
    const gender = body?.gender === "female" ? "female" : "male";
    const role = body?.role === "admin" ? "admin" : "user";
    const heightCmRaw = body?.heightCm;
    const heightCm =
      heightCmRaw != null && heightCmRaw !== "" && Number.isFinite(Number(heightCmRaw))
        ? Number(heightCmRaw)
        : null;

    if (!USERNAME_RE.test(username)) {
      return badRequest(
        "Kullanıcı adı 3-20 karakter olmalı; sadece küçük harf, rakam, alt çizgi ve nokta içerebilir"
      );
    }
    if (!displayName) return badRequest("Ad soyad gerekli");
    if (password.length < 4) return badRequest("Şifre en az 4 karakter olmalı");

    await dbConnect();
    const existing = await User.findOne({ username });
    if (existing) return badRequest("Bu kullanıcı adı zaten kullanılıyor");

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      displayName,
      passwordHash,
      passwordPlain: password,
      role,
      gender,
      heightCm,
    });

    // Uygulamanın diğer sayfaları (program/vücut/diyet) çalışabilsin diye
    // varsayılan bir haftalık program oluşturulur; diyet hedefi ilk
    // görüntülemede otomatik oluşuyor (bkz. /api/diet).
    await Program.create({
      userId: user._id,
      name: "Haftalık Program",
      days: SEED_PROGRAM_DAYS,
      currentIndex: 0,
      weekNumber: 1,
      startedAt: new Date(),
      lastActionAt: new Date(),
    });

    return json({ user: toUserAdminDTO(user) }, 201);
  } catch (e: any) {
    if (e?.code === 11000) return badRequest("Bu kullanıcı adı zaten kullanılıyor");
    return serverError(e?.message);
  }
}
