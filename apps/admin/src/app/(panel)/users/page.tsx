"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, KeyRound, MoreHorizontal, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import type { AdminUserDTO } from "@fitfloow/core";
import { useDebounced } from "@/hooks/useDebounced";
import { relative } from "@/lib/format";
import { errorMessage, useDeleteUser, useResetPassword, useTemplates, useUsers, useAssignProgram } from "@/lib/queries";
import { PageHeader } from "@/components/layout/PanelShell";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { ConfirmDialog, Dialog } from "@/components/ui/Overlay";
import { SearchInput } from "@/components/ui/SearchInput";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/Table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { UserDrawer } from "./UserDrawer";

const GOAL_TONE = { active: "brand", completed: "success", abandoned: "neutral" } as const;
const GOAL_TR = { active: "Aktif", completed: "Tamamlandı", abandoned: "Bırakıldı" } as const;

type SortKey = "displayName" | "lastSeenAt" | "createdAt";

export default function UsersPage() {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const { data, isLoading, isError, error, refetch } = useUsers(debounced || undefined);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "lastSeenAt", dir: "desc" });

  const [drawer, setDrawer] = useState<{ open: boolean; user: AdminUserDTO | null; seq: number }>({ open: false, user: null, seq: 0 });
  const [toDelete, setToDelete] = useState<AdminUserDTO | null>(null);
  const [toReset, setToReset] = useState<AdminUserDTO | null>(null);
  const [toAssign, setToAssign] = useState<AdminUserDTO | null>(null);

  const toast = useToast();
  const remove = useDeleteUser({
    onDone: () => {
      toast.success("Kullanıcı silindi");
      setToDelete(null);
    },
    onFail: (e) => toast.error("Silinemedi", errorMessage(e)),
  });

  const users = useMemo(() => {
    const list = [...(data?.users ?? [])];
    const dir = sort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (sort.key === "displayName") return a.displayName.localeCompare(b.displayName, "tr") * dir;
      const av = a[sort.key] ?? "";
      const bv = b[sort.key] ?? "";
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
    });
    return list;
  }, [data?.users, sort]);

  const toggleSort = (key: SortKey) => setSort((p) => ({ key, dir: p.key === key && p.dir === "desc" ? "asc" : "desc" }));

  return (
    <>
      <PageHeader
        eyebrow="Hesaplar"
        title="Kullanıcılar"
        description="Hesap oluştur, program ata, parola sıfırla. Silme işlemi kullanıcının tüm verisini kaldırır."
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} placeholder="Ad veya kullanıcı adı…" className="w-56" />
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => setDrawer((d) => ({ open: true, user: null, seq: d.seq + 1 }))}
            >
              Yeni kullanıcı
            </Button>
          </>
        }
      />

      <Card>
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH sortable sorted={sort.key === "displayName" ? sort.dir : null} onSort={() => toggleSort("displayName")}>
                  Kullanıcı
                </TH>
                <TH>Rol</TH>
                <TH>Cinsiyet</TH>
                <TH>Program</TH>
                <TH>Hedef</TH>
                <TH sortable sorted={sort.key === "lastSeenAt" ? sort.dir : null} onSort={() => toggleSort("lastSeenAt")}>
                  Son görülme
                </TH>
                <TH align="right" width="9rem">
                  İşlem
                </TH>
              </tr>
            </THead>

            {isLoading ? (
              <TableSkeleton rows={6} cols={7} />
            ) : (
              <tbody>
                {users.map((u) => (
                  <TR key={u.id} interactive>
                    <TD>
                      <Link href={`/users/${u.id}`} className="flex items-center gap-2.5 rounded">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-[11px] font-semibold text-muted">
                          {u.displayName.slice(0, 2).toLocaleUpperCase("tr")}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{u.displayName}</span>
                          <span className="block truncate text-xs text-subtle">@{u.username}</span>
                        </span>
                      </Link>
                    </TD>
                    <TD>
                      <Badge tone={u.role === "admin" ? "brand" : "neutral"}>{u.role === "admin" ? "Yönetici" : "Kullanıcı"}</Badge>
                    </TD>
                    <TD className="text-muted">{u.gender === "male" ? "Erkek" : "Kadın"}</TD>
                    <TD>
                      {u.hasProgram ? (
                        <span className="text-muted">Atanmış</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setToAssign(u)}
                          className="text-brand-text underline-offset-2 transition-colors hover:underline"
                        >
                          Program ata
                        </button>
                      )}
                    </TD>
                    <TD>
                      {u.goalStatus ? (
                        <Badge tone={GOAL_TONE[u.goalStatus]} dot>
                          {GOAL_TR[u.goalStatus]}
                        </Badge>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </TD>
                    <TD className="text-muted">{relative(u.lastSeenAt ?? null)}</TD>
                    <TD align="right">
                      <div className="flex items-center justify-end gap-0.5">
                        <IconButton
                          label="Düzenle"
                          size="sm"
                          onClick={() => setDrawer((d) => ({ open: true, user: u, seq: d.seq + 1 }))}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </IconButton>
                        <IconButton label="Parola sıfırla" size="sm" onClick={() => setToReset(u)}>
                          <KeyRound className="size-3.5" aria-hidden />
                        </IconButton>
                        <IconButton label="Program ata" size="sm" onClick={() => setToAssign(u)}>
                          <CalendarDays className="size-3.5" aria-hidden />
                        </IconButton>
                        <IconButton label="Sil" size="sm" variant="danger" onClick={() => setToDelete(u)}>
                          <Trash2 className="size-3.5" aria-hidden />
                        </IconButton>
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            )}
          </Table>
        </TableWrap>

        {isError && <ErrorState error={error} onRetry={() => void refetch()} />}
        {!isLoading && !isError && users.length === 0 && (
          <EmptyState
            icon={<UserPlus className="size-5" aria-hidden />}
            title={debounced ? "Eşleşen kullanıcı yok" : "Henüz kullanıcı yok"}
            description={
              debounced
                ? `“${debounced}” için sonuç bulunamadı. Aramayı temizleyip tekrar dene.`
                : "İlk hesabı oluştur; mobil uygulamaya bu bilgilerle giriş yapılır."
            }
            action={
              <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setDrawer((d) => ({ open: true, user: null, seq: d.seq + 1 }))}>
                Yeni kullanıcı
              </Button>
            }
          />
        )}
      </Card>

      {!isLoading && users.length > 0 && (
        <p className="mt-3 text-xs text-subtle">
          {users.length} kullanıcı gösteriliyor{debounced ? ` · “${debounced}” araması` : ""}
        </p>
      )}

      <UserDrawer
        key={drawer.seq}
        open={drawer.open}
        user={drawer.user}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        pending={remove.isPending}
        title="Kullanıcıyı sil"
        message={`${toDelete?.displayName ?? ""} ve bu kullanıcıya ait tüm antrenman, ölçüm, öğün kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz.`}
      />

      <ResetPasswordDialog user={toReset} onClose={() => setToReset(null)} />
      <AssignProgramDialog user={toAssign} onClose={() => setToAssign(null)} />

      <div className="sr-only" aria-hidden>
        <MoreHorizontal />
      </div>
    </>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: AdminUserDTO | null; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const reset = useResetPassword({
    onDone: () => {
      toast.success("Parola güncellendi", user ? `@${user.username}` : undefined);
      setPassword("");
      onClose();
    },
    onFail: (e) => setError(errorMessage(e)),
  });

  const submit = () => {
    if (password.length < 6) {
      setError("Parola en az 6 karakter olmalı");
      return;
    }
    setError(null);
    if (user) reset.mutate({ id: user.id, password });
  };

  return (
    <Dialog
      open={Boolean(user)}
      onClose={onClose}
      title="Parolayı sıfırla"
      description={user ? `${user.displayName} (@${user.username}) için yeni parola belirle.` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={reset.isPending}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={submit} loading={reset.isPending}>
            Parolayı değiştir
          </Button>
        </>
      }
    >
      <Field label="Yeni parola" error={error} required hint="En az 6 karakter. Kullanıcıya güvenli bir kanaldan ilet.">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" data-autofocus />
      </Field>
    </Dialog>
  );
}

function AssignProgramDialog({ user, onClose }: { user: AdminUserDTO | null; onClose: () => void }) {
  const templates = useTemplates();
  const [templateId, setTemplateId] = useState("");
  const toast = useToast();
  const assign = useAssignProgram({
    onDone: () => {
      toast.success("Program atandı", user?.displayName);
      onClose();
    },
    onFail: (e) => toast.error("Program atanamadı", errorMessage(e)),
  });

  const list = templates.data?.templates ?? [];
  const selected = templateId || list[0]?.id || "";

  return (
    <Dialog
      open={Boolean(user)}
      onClose={onClose}
      title="Program ata"
      description={user ? `${user.displayName} için bir şablon seç; mevcut program değiştirilir.` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={assign.isPending}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={() => user && selected && assign.mutate({ id: user.id, templateId: selected })} loading={assign.isPending} disabled={!selected}>
            Ata
          </Button>
        </>
      }
    >
      {templates.isLoading ? (
        <p className="text-[13px] text-muted">Şablonlar yükleniyor…</p>
      ) : list.length === 0 ? (
        <p className="text-[13px] text-muted">Henüz program şablonu yok. Önce Programlar sayfasından bir şablon oluştur.</p>
      ) : (
        <Field label="Program şablonu">
          <Select value={selected} onChange={(e) => setTemplateId(e.target.value)} data-autofocus>
            {list.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.cycleLength} gün
              </option>
            ))}
          </Select>
        </Field>
      )}
    </Dialog>
  );
}
