"use client";

import { useState } from "react";
import { ACTIVITY_TR, WEEKDAYS_TR, zAdminCreateUserInput, zAdminUpdateUserInput, type AdminUserDTO } from "@fitfloow/core";
import { errorMessage, useCreateUser, useUpdateUser } from "@/lib/queries";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Field, Input, NumberInput, Select, Switch } from "@/components/ui/Field";
import { Drawer } from "@/components/ui/Overlay";
import { Callout } from "@/components/ui/States";

type Errors = Record<string, string>;

interface Draft {
  username: string;
  displayName: string;
  password: string;
  role: "admin" | "user";
  gender: "male" | "female";
  heightCm: string;
  birthDate: string;
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "veryActive";
  measurementDay: number;
  mascotEnabled: boolean;
}

function draftFrom(user: AdminUserDTO | null): Draft {
  return {
    username: user?.username ?? "",
    displayName: user?.displayName ?? "",
    password: "",
    role: user?.role ?? "user",
    gender: user?.gender ?? "male",
    heightCm: user?.heightCm ? String(user.heightCm) : "",
    birthDate: user?.birthDate ?? "",
    activityLevel: user?.activityLevel ?? "moderate",
    measurementDay: user?.measurementDay ?? 0,
    mascotEnabled: user?.mascotEnabled ?? true,
  };
}

const FIELD_LABELS: Record<string, string> = {
  username: "Kullanıcı adı",
  displayName: "Ad soyad",
  password: "Parola",
  heightCm: "Boy",
  birthDate: "Doğum tarihi",
};

export function UserDrawer({ open, onClose, user }: { open: boolean; onClose: () => void; user: AdminUserDTO | null }) {
  const isEdit = Boolean(user);
  const toast = useToast();
  // Remounting on open (see the `key` where this is rendered) keeps the draft fresh.
  const [draft, setDraft] = useState<Draft>(() => draftFrom(user));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const done = () => {
    toast.success(isEdit ? "Kullanıcı güncellendi" : "Kullanıcı oluşturuldu", draft.displayName);
    onClose();
  };
  const fail = (error: unknown) => setFormError(errorMessage(error));

  const create = useCreateUser({ onDone: done, onFail: fail });
  const update = useUpdateUser({ onDone: done, onFail: fail });
  const pending = create.isPending || update.isPending;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const payload = {
      username: draft.username.trim(),
      displayName: draft.displayName.trim(),
      role: draft.role,
      gender: draft.gender,
      heightCm: draft.heightCm ? Number(draft.heightCm) : null,
      birthDate: draft.birthDate || null,
      activityLevel: draft.activityLevel,
      measurementDay: draft.measurementDay,
      ...(draft.password ? { password: draft.password } : {}),
    };

    const schema = isEdit ? zAdminUpdateUserInput : zAdminCreateUserInput;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        next[key] = `${FIELD_LABELS[key] ?? "Alan"} geçersiz: ${issue.message}`;
      }
      setErrors(next);
      return;
    }
    setErrors({});

    if (isEdit && user) update.mutate({ id: user.id, input: parsed.data });
    else create.mutate(parsed.data as Parameters<typeof create.mutate>[0]);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? "Kullanıcıyı düzenle" : "Yeni kullanıcı"}
      description={isEdit ? `@${user?.username}` : "Mobil uygulamaya giriş yapacak hesabı oluştur."}
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Vazgeç
          </Button>
          <Button variant="primary" type="submit" form="user-form" loading={pending}>
            {isEdit ? "Kaydet" : "Oluştur"}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError && (
          <Callout tone="danger" title="Kaydedilemedi">
            {formError}
          </Callout>
        )}

        <Field label="Ad soyad" error={errors.displayName} required>
          <Input value={draft.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="Eren Yılmaz" data-autofocus />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kullanıcı adı" error={errors.username} required hint="Küçük harf, rakam, nokta ve alt çizgi.">
            <Input
              value={draft.username}
              onChange={(e) => set("username", e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              placeholder="eren"
            />
          </Field>
          <Field
            label={isEdit ? "Yeni parola" : "Parola"}
            error={errors.password}
            required={!isEdit}
            hint={isEdit ? "Boş bırakırsan değişmez." : "En az 6 karakter."}
          >
            <Input type="password" value={draft.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rol">
            <Select value={draft.role} onChange={(e) => set("role", e.target.value as Draft["role"])}>
              <option value="user">Kullanıcı</option>
              <option value="admin">Yönetici</option>
            </Select>
          </Field>
          <Field label="Cinsiyet" hint="Navy yağ formülü ve hedef bantları için gerekli.">
            <Select value={draft.gender} onChange={(e) => set("gender", e.target.value as Draft["gender"])}>
              <option value="male">Erkek</option>
              <option value="female">Kadın</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Boy" error={errors.heightCm}>
            <NumberInput unit="cm" min={100} max={250} value={draft.heightCm} onChange={(e) => set("heightCm", e.target.value)} placeholder="183" />
          </Field>
          <Field label="Doğum tarihi" error={errors.birthDate} hint="Mifflin-St Jeor karışımı için.">
            <Input type="date" value={draft.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Aktivite seviyesi">
            <Select value={draft.activityLevel} onChange={(e) => set("activityLevel", e.target.value as Draft["activityLevel"])}>
              {Object.entries(ACTIVITY_TR).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ölçüm günü" hint="Haftalık rapor bu günde başlar.">
            <Select value={draft.measurementDay} onChange={(e) => set("measurementDay", Number(e.target.value))}>
              {WEEKDAYS_TR.map((label, i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3.5 py-3">
          <div>
            <p className="text-[13px] font-medium text-ink">Floo mesajları</p>
            <p className="mt-0.5 text-xs text-muted">Maskot motivasyon metinlerini göster.</p>
          </div>
          <Switch checked={draft.mascotEnabled} onChange={(v) => set("mascotEnabled", v)} label="Floo mesajları" />
        </div>
      </form>
    </Drawer>
  );
}
