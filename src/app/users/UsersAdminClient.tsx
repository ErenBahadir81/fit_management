"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Users as UsersIcon,
} from "lucide-react";
import {
  Button,
  Card,
  Input,
  Segmented,
  Sheet,
  Badge,
  PageLoader,
  EmptyState,
} from "@/components/ui";
import type { SegmentedOption } from "@/components/ui";
import { apiSend } from "@/lib/fetcher";
import type { Gender, UserAdminDTO, UserRole } from "@/lib/types";

const KEY = "/api/users";

const GENDER_OPTIONS: SegmentedOption<Gender>[] = [
  { value: "male", label: "Erkek" },
  { value: "female", label: "Kadın" },
];

const ROLE_OPTIONS: SegmentedOption<UserRole>[] = [
  { value: "user", label: "Kullanıcı" },
  { value: "admin", label: "Yönetici" },
];

interface FormState {
  username: string;
  displayName: string;
  password: string;
  gender: Gender;
  role: UserRole;
  heightCm: string;
}

const EMPTY_FORM: FormState = {
  username: "",
  displayName: "",
  password: "",
  gender: "male",
  role: "user",
  heightCm: "",
};

function toFormState(u: UserAdminDTO): FormState {
  return {
    username: u.username,
    displayName: u.displayName,
    password: "",
    gender: u.gender,
    role: u.role,
    heightCm: u.heightCm != null ? String(u.heightCm) : "",
  };
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  });
}

export function UsersAdminClient() {
  const { data, error, isLoading } = useSWR<{ users: UserAdminDTO[] }>(KEY);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserAdminDTO | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const users = data?.users ?? [];

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(u: UserAdminDTO) {
    setEditing(u);
    setFormOpen(true);
  }

  function toggleReveal(id: string) {
    setRevealed((r) => ({ ...r, [id]: !r[id] }));
  }

  async function remove(u: UserAdminDTO) {
    if (busyId) return;
    setBusyId(u.id);
    setRowError(null);
    try {
      await apiSend(`/api/users/${u.id}`, "DELETE");
      setConfirmingId(null);
      await mutate(KEY);
    } catch (e: any) {
      setRowError(e?.message || "Silinemedi");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-bg">
      <header className="border-b border-border bg-surface/95 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 shrink-0 grid place-items-center rounded-2xl bg-primary text-white">
              <UsersIcon size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold leading-tight truncate">
                Kullanıcı Yönetimi
              </h1>
              <p className="text-xs text-muted truncate">
                Yalnızca yöneticiler erişebilir · /users
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/"
              className="tap inline-flex items-center gap-1.5 h-10 px-3 rounded-2xl text-sm font-semibold text-muted hover:bg-surface-2"
            >
              <ArrowLeft size={16} /> Uygulamaya dön
            </Link>
            <Button onClick={openCreate}>
              <Plus size={18} /> Yeni Kullanıcı
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {isLoading ? (
          <PageLoader />
        ) : error ? (
          <Card className="p-6 text-center text-sm text-muted">
            Kullanıcılar yüklenemedi. Lütfen tekrar dene.
          </Card>
        ) : users.length === 0 ? (
          <EmptyState
            icon={<UsersIcon size={24} />}
            title="Henüz kullanıcı yok"
            action={
              <Button onClick={openCreate}>
                <Plus size={18} /> Yeni Kullanıcı
              </Button>
            }
          />
        ) : (
          <Card className="overflow-hidden">
            {rowError && (
              <div className="px-5 py-2.5 text-sm font-medium text-fatigued bg-fatigued/10 border-b border-border">
                {rowError}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-wide text-muted">
                    <th className="px-5 py-3">Ad Soyad</th>
                    <th className="px-5 py-3">Kullanıcı adı</th>
                    <th className="px-5 py-3">Rol</th>
                    <th className="px-5 py-3">Şifre</th>
                    <th className="px-5 py-3">Oluşturulma</th>
                    <th className="px-5 py-3 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-5 py-3 font-semibold text-ink whitespace-nowrap">
                        {u.displayName}
                      </td>
                      <td className="px-5 py-3 text-muted whitespace-nowrap">
                        @{u.username}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {u.role === "admin" ? (
                          <Badge color="var(--primary)">
                            <ShieldCheck size={12} /> Yönetici
                          </Badge>
                        ) : (
                          <Badge>Kullanıcı</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <button
                          onClick={() => toggleReveal(u.id)}
                          className="tap inline-flex items-center gap-1.5 font-mono text-xs bg-surface-2 rounded-lg px-2.5 py-1.5 text-ink"
                        >
                          {revealed[u.id] ? u.password || "—" : "••••••••"}
                          {revealed[u.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-muted whitespace-nowrap">
                        {fullDate(u.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {confirmingId === u.id ? (
                            <>
                              <span className="text-xs text-muted mr-1">
                                Emin misin?
                              </span>
                              <Button
                                size="sm"
                                variant="danger"
                                loading={busyId === u.id}
                                onClick={() => remove(u)}
                              >
                                Sil
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busyId === u.id}
                                onClick={() => setConfirmingId(null)}
                              >
                                Vazgeç
                              </Button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => openEdit(u)}
                                aria-label="Düzenle"
                                className="tap h-9 w-9 grid place-items-center rounded-full bg-surface-2 text-muted"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                onClick={() => {
                                  setRowError(null);
                                  setConfirmingId(u.id);
                                }}
                                aria-label="Sil"
                                className="tap h-9 w-9 grid place-items-center rounded-full bg-surface-2 text-muted"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>

      <UserFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        onSaved={() => mutate(KEY)}
      />
    </div>
  );
}

function UserFormSheet({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: UserAdminDTO | null;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sheet her açıldığında formu ilgili kullanıcıya (veya boşa) sıfırla.
  useEffect(() => {
    if (open) {
      setForm(editing ? toFormState(editing) : EMPTY_FORM);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const usernameValid = /^[a-z0-9_.]{3,20}$/.test(form.username.trim().toLowerCase());
  const passwordValid = editing ? form.password.length === 0 || form.password.length >= 4 : form.password.length >= 4;
  const valid = usernameValid && form.displayName.trim().length > 0 && passwordValid;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const heightCm = form.heightCm.trim() ? Number(form.heightCm) : null;
      const payload = {
        username: form.username.trim().toLowerCase(),
        displayName: form.displayName.trim(),
        gender: form.gender,
        role: form.role,
        heightCm,
        ...(form.password ? { password: form.password } : {}),
      };
      if (editing) {
        await apiSend(`/api/users/${editing.id}`, "PUT", payload);
      } else {
        await apiSend("/api/users", "POST", payload);
      }
      await onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Kullanıcıyı Düzenle" : "Yeni Kullanıcı"}
      subtitle={editing ? `@${editing.username}` : "Basit kullanıcı ekleme"}
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={saving}
          disabled={!valid}
          onClick={save}
        >
          Kaydet
        </Button>
      }
    >
      <div className="space-y-4 py-1">
        <Input
          label="Ad Soyad"
          value={form.displayName}
          onChange={(e) => set("displayName", e.target.value)}
          placeholder="Örn. Ayşe Yılmaz"
        />
        <Input
          label="Kullanıcı adı"
          value={form.username}
          onChange={(e) => set("username", e.target.value.toLowerCase())}
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="ornek"
          hint="3-20 karakter; küçük harf, rakam, _ ve . içerebilir"
        />
        <Input
          label={editing ? "Şifre (değiştirmek için gir)" : "Şifre"}
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          placeholder={editing ? "Değişmesin" : "En az 4 karakter"}
        />

        <div>
          <span className="block text-sm font-medium text-ink mb-1.5">Cinsiyet</span>
          <Segmented value={form.gender} onChange={(v) => set("gender", v)} options={GENDER_OPTIONS} />
        </div>

        <div>
          <span className="block text-sm font-medium text-ink mb-1.5">Rol</span>
          <Segmented value={form.role} onChange={(v) => set("role", v)} options={ROLE_OPTIONS} />
        </div>

        <Input
          label="Boy (opsiyonel)"
          type="number"
          inputMode="decimal"
          suffix="cm"
          value={form.heightCm}
          onChange={(e) => set("heightCm", e.target.value)}
          placeholder="178"
        />

        {error && <p className="text-xs text-fatigued font-medium px-1">{error}</p>}
      </div>
    </Sheet>
  );
}
