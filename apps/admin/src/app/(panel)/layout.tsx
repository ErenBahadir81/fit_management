import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-server";
import { PATHNAME_HEADER } from "@/proxy";
import { PanelShell } from "@/components/layout/PanelShell";

/** Only same-origin absolute paths may travel in `?next=`, never `//evil.com`. */
function safeNext(pathname: string | null): string | null {
  if (!pathname || !pathname.startsWith("/") || pathname.startsWith("//")) return null;
  return pathname === "/" ? null : pathname;
}

/**
 * Auth gate. A server component asks the API who the caller is (forwarding the httpOnly
 * cookies) and redirects to /login on 401 — no client flash of protected content. The
 * requested path rides along as `?next=` so signing in returns the user where they were
 * heading instead of dumping them on the dashboard.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const next = safeNext((await headers()).get(PATHNAME_HEADER));
  const nextParam = next ? `next=${encodeURIComponent(next)}` : "";

  if (!user) redirect(nextParam ? `/login?${nextParam}` : "/login");
  if (user.role !== "admin") redirect(`/login?forbidden=1${nextParam ? `&${nextParam}` : ""}`);

  return <PanelShell user={user}>{children}</PanelShell>;
}
