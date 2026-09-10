import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-server";
import { PanelShell } from "@/components/layout/PanelShell";

/**
 * Auth gate. A server component asks the API who the caller is (forwarding the httpOnly
 * cookies) and redirects to /login on 401 — no client flash of protected content.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/login?forbidden=1");

  return <PanelShell user={user}>{children}</PanelShell>;
}
