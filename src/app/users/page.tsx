import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { dbConnect } from "@/lib/mongodb";
import { User } from "@/lib/models";
import { ensureSeeded } from "@/lib/seed";
import { UsersAdminClient } from "./UsersAdminClient";

export const dynamic = "force-dynamic";

/**
 * Gizli yönetim alanı — hiçbir footer/bottom-nav'da gösterilmez, yalnızca
 * doğrudan /users adresine gidilerek (veya Profil popup'ındaki admin-only
 * linkle) erişilir. Admin rolü dışındaki kullanıcılar ana sayfaya
 * yönlendirilir. ensureSeeded() burada da çağrılıyor ki eski (rol alanı
 * eklenmeden önce oluşmuş) oturumlarda role="admin" backfill'i garanti
 * bu istek tamamlanmadan önce bitmiş olsun.
 */
export default async function UsersPage() {
  const uid = getUserId();
  if (!uid) redirect("/login");

  await ensureSeeded();
  await dbConnect();
  const me = await User.findById(uid).lean<{ role?: string }>();
  if (!me || me.role !== "admin") redirect("/");

  return <UsersAdminClient />;
}
