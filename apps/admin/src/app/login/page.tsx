import { Suspense } from "react";
import type { Metadata } from "next";
import { Floo } from "@/components/floo/Floo";
import { Skeleton } from "@/components/ui/States";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Giriş" };

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand side — calm, one statement, Floo watching. */}
      <section className="relative hidden overflow-hidden border-r border-line bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 size-[28rem] rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(109,93,246,0.22), transparent 68%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--ff-line) 1px, transparent 1px), linear-gradient(to bottom, var(--ff-line) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at 30% 20%, black, transparent 72%)",
          }}
        />

        <div className="relative flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-[10px] bg-brand text-white">
            <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
              <path
                d="M12 2c.6 3.2 2.4 4.9 4 6.6 1.6 1.7 2.6 3.3 2.6 5.4A6.6 6.6 0 0 1 12 20.6 6.6 6.6 0 0 1 5.4 14c0-2.9 2.2-4.8 3.8-7.2C10.4 5.2 11.7 3.9 12 2Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span className="text-sm font-semibold tracking-[-0.01em] text-ink">FitFloow</span>
          <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-subtle">
            Yönetim
          </span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.03em] text-ink">
            Kaslar, hedefler ve Floo&apos;nun sesi — hepsi tek panelden.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Kas kataloğunu, hareket yüklerini, program şablonlarını ve hedef motorunun sabitlerini buradan yönetiyorsun. Değişiklikler
            mobil uygulamaya anında yansır.
          </p>
        </div>

        <div className="relative flex items-end justify-between">
          <p className="text-xs text-subtle">Türkiye saati (UTC+3) · v2</p>
          <Floo mood="happy" size={92} />
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-[22rem]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-8 place-items-center rounded-[10px] bg-brand text-white">
              <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
                <path
                  d="M12 2c.6 3.2 2.4 4.9 4 6.6 1.6 1.7 2.6 3.3 2.6 5.4A6.6 6.6 0 0 1 12 20.6 6.6 6.6 0 0 1 5.4 14c0-2.9 2.2-4.8 3.8-7.2C10.4 5.2 11.7 3.9 12 2Z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <span className="text-sm font-semibold text-ink">FitFloow Yönetim</span>
          </div>

          <p className="ff-eyebrow mb-2">Yönetici girişi</p>
          <h2 className="text-title font-semibold text-ink">Tekrar hoş geldin</h2>
          <p className="mb-7 mt-1.5 text-[13px] leading-relaxed text-muted">Devam etmek için yönetici hesabınla giriş yap.</p>

          <Suspense fallback={<LoginFormSkeleton />}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </div>
  );
}

function LoginFormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-[3.75rem]" />
      <Skeleton className="h-[3.75rem]" />
      <Skeleton className="h-11" />
    </div>
  );
}
