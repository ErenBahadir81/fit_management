import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { BottomNav } from "@/components/layout/BottomNav";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  if (!getUserId()) redirect("/login");

  return (
    <div className="relative mx-auto max-w-app min-h-[100dvh] bg-bg">
      <main className="pb-28">{children}</main>
      <BottomNav />
    </div>
  );
}
