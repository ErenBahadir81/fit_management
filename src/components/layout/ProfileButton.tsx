"use client";

import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { LogOut, User as UserIcon, Users as UsersIcon } from "lucide-react";
import { Sheet, Button } from "@/components/ui";
import { apiSend } from "@/lib/fetcher";
import type { UserDTO } from "@/lib/types";

export function ProfileButton() {
  const { data } = useSWR<{ user: UserDTO }>("/api/auth/me");
  const [open, setOpen] = useState(false);
  const [out, setOut] = useState(false);
  const router = useRouter();
  const user = data?.user;
  const initial = (user?.displayName || "?").charAt(0).toUpperCase();

  function goToUsers() {
    setOpen(false);
    router.push("/users");
  }

  async function logout() {
    setOut(true);
    try {
      await apiSend("/api/auth/logout", "POST");
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="tap h-11 w-11 grid place-items-center rounded-full bg-primary text-white font-bold text-lg shadow-card"
        aria-label="Profil"
      >
        {initial}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Profil"
        footer={
          <Button
            variant="soft"
            fullWidth
            size="lg"
            loading={out}
            onClick={logout}
            className="!text-fatigued !bg-fatigued/10"
          >
            <LogOut size={18} /> Çıkış Yap
          </Button>
        }
      >
        <div className="flex items-center gap-3 py-2">
          <div className="h-14 w-14 grid place-items-center rounded-2xl bg-primary-soft text-primary">
            <UserIcon size={26} />
          </div>
          <div>
            <p className="font-bold text-lg leading-tight">{user?.displayName}</p>
            <p className="text-sm text-muted">@{user?.username}</p>
          </div>
        </div>

        {user?.role === "admin" && (
          <Button variant="soft" fullWidth size="lg" className="mt-2" onClick={goToUsers}>
            <UsersIcon size={18} /> Kullanıcılar
          </Button>
        )}
      </Sheet>
    </>
  );
}
