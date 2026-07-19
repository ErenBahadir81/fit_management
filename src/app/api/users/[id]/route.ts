import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/mongodb";
import {
  User,
  Program,
  WorkoutLog,
  BodyEntry,
  DietTarget,
  DietLog,
} from "@/lib/models";
import { requireAdmin, json, badRequest, serverError } from "@/lib/http";
import { toUserAdminDTO } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const body = await req.json();
    await dbConnect();
    const user = await User.findById(params.id);
    if (!user) return badRequest("Kullanıcı bulunamadı");

    if (typeof body.displayName === "string" && body.displayName.trim()) {
      user.displayName = body.displayName.trim();
    }

    if (typeof body.username === "string" && body.username.trim()) {
      const uname = body.username.toLowerCase().trim();
      if (!USERNAME_RE.test(uname)) {
        return badRequest(
          "Kullanıcı adı 3-20 karakter olmalı; sadece küçük harf, rakam, alt çizgi ve nokta içerebilir"
        );
      }
      if (uname !== user.username) {
        const dup = await User.findOne({ username: uname, _id: { $ne: user._id } });
        if (dup) return badRequest("Bu kullanıcı adı zaten kullanılıyor");
        user.username = uname;
      }
    }

    if (body.gender === "male" || body.gender === "female") {
      user.gender = body.gender;
    }

    if (body.heightCm === null) {
      user.heightCm = null;
    } else if (body.heightCm !== undefined) {
      const h = Number(body.heightCm);
      if (!Number.isFinite(h)) return badRequest("Geçersiz boy değeri");
      user.heightCm = h;
    }

    if (body.role === "admin" || body.role === "user") {
      if (user.role === "admin" && body.role !== "admin") {
        const otherAdmins = await User.countDocuments({
          role: "admin",
          _id: { $ne: user._id },
        });
        if (otherAdmins === 0) return badRequest("Son yönetici rolü kaldırılamaz");
      }
      user.role = body.role;
    }

    if (typeof body.password === "string" && body.password.trim()) {
      if (body.password.length < 4) return badRequest("Şifre en az 4 karakter olmalı");
      user.passwordHash = await bcrypt.hash(body.password, 10);
      user.passwordPlain = body.password;
    }

    await user.save();
    return json({ user: toUserAdminDTO(user) });
  } catch (e: any) {
    if (e?.code === 11000) return badRequest("Bu kullanıcı adı zaten kullanılıyor");
    return serverError(e?.message);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    await dbConnect();
    const user = await User.findById(params.id);
    if (!user) return badRequest("Kullanıcı bulunamadı");

    if (String(user._id) === auth.userId) {
      return badRequest("Kendi hesabını silemezsin");
    }
    if (user.role === "admin") {
      const otherAdmins = await User.countDocuments({
        role: "admin",
        _id: { $ne: user._id },
      });
      if (otherAdmins === 0) return badRequest("Son yönetici hesabı silinemez");
    }

    const uid = user._id;
    await Promise.all([
      Program.deleteMany({ userId: uid }),
      WorkoutLog.deleteMany({ userId: uid }),
      BodyEntry.deleteMany({ userId: uid }),
      DietTarget.deleteMany({ userId: uid }),
      DietLog.deleteMany({ userId: uid }),
    ]);
    await User.deleteOne({ _id: uid });

    return json({ ok: true });
  } catch (e: any) {
    return serverError(e?.message);
  }
}
