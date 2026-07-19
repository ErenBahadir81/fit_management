import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { dbConnect } from "@/lib/mongodb";
import { User } from "@/lib/models";
import { UsersAdminClient } from "./UsersAdminClient";

export const dynamic = "force-dynamic";

/**
 * Gizli yönetim alanı — hiçbir menüde/linkte gösterilmez, yalnızca
 * doğrudan /users adresine gidilerek erişilir. Admin rolü dışındaki
 * kullanıcılar ana sayfaya yönlendirilir.
 */
export default async function UsersPage() {
  const uid = getUserId();
  if (!uid) redirect("/login");

  await dbConnect();
  const me = await User.findById(uid).lean<{ role?: string }>();
  if (!me || me.role !== "admin") redirect("/");

  return <UsersAdminClient />;
}
