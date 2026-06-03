import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/mongodb";
import { User } from "@/lib/models";
import { ensureSeeded } from "@/lib/seed";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { toUserDTO } from "@/lib/serialize";
import { badRequest, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) return badRequest("Kullanıcı adı ve şifre gerekli");

    await ensureSeeded();
    await dbConnect();

    const user = await User.findOne({ username: String(username).toLowerCase().trim() });
    if (!user) return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 401 });

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return NextResponse.json({ error: "Şifre hatalı" }, { status: 401 });

    const res = NextResponse.json({ user: toUserDTO(user) });
    res.cookies.set(SESSION_COOKIE, String(user._id), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (e: any) {
    return serverError(e?.message || "Giriş başarısız");
  }
}
