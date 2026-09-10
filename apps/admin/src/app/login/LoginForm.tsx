"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { zLoginInput } from "@fitfloow/core";
import { api, USE_FAKE_API } from "@/lib/api";
import { errorMessage } from "@/lib/queries";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Callout } from "@/components/ui/States";

interface FieldErrors {
  username?: string;
  password?: string;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsed = zLoginInput.safeParse({ username, password });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "username") next.username = "Geçerli bir kullanıcı adı gir";
        if (key === "password") next.password = "Parola boş olamaz";
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await api.auth.login(parsed.data.username, parsed.data.password);
      router.push(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (error) {
      setFormError(errorMessage(error));
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && (
        <Callout tone="danger" title="Giriş yapılamadı">
          {formError}
        </Callout>
      )}

      <Field label="Kullanıcı adı" error={errors.username} required>
        <Input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="eren"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </Field>

      <Field label="Parola" error={errors.password} required>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-1 w-full" iconRight={<ArrowRight className="size-4" />}>
        {pending ? "Giriş yapılıyor…" : "Giriş yap"}
      </Button>

      {USE_FAKE_API && (
        <p className="text-center text-xs leading-relaxed text-subtle">
          Demo modu açık — <span className="font-medium text-muted">eren</span> / <span className="font-medium text-muted">fitfloow</span>
        </p>
      )}
    </form>
  );
}
