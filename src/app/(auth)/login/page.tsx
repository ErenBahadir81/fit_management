"use client";

import { useState } from "react";
import { Dumbbell } from "lucide-react";
import { Input, Button } from "@/components/ui";
import { apiSend } from "@/lib/fetcher";

export default function LoginPage() {
  const [username, setUsername] = useState("eren");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiSend("/api/auth/login", "POST", { username, password });
      window.location.href = "/";
    } catch (err: any) {
      setError(err?.message || "Giriş başarısız");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] mx-auto max-w-app flex flex-col justify-center px-6 py-10">
      <div className="flex flex-col items-center mb-8">
        <div className="h-16 w-16 grid place-items-center rounded-3xl bg-primary text-white shadow-pop mb-4">
          <Dumbbell size={30} />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">FitFloow</h1>
        <p className="text-muted mt-1 text-center">
          Antrenman, yenilenme ve vücut takibin tek yerde
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <Input
          label="Kullanıcı adı"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="eren"
        />
        <Input
          label="Şifre"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        {error && (
          <div className="text-sm text-fatigued bg-fatigued/10 rounded-xl px-3 py-2 text-center font-medium">
            {error}
          </div>
        )}

        <Button type="submit" size="lg" fullWidth loading={loading} className="mt-2">
          Giriş Yap
        </Button>
      </form>

      <p className="text-center text-xs text-muted mt-6">
        Demo hesabı:{" "}
        <span className="font-semibold text-ink">eren</span> /{" "}
        <span className="font-semibold text-ink">Asd*123</span>
      </p>
    </div>
  );
}
