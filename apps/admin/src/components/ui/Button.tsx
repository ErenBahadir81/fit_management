"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cx } from "@/lib/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  // Violet is reserved for the single primary action on a surface.
  primary: "bg-brand text-white border border-transparent hover:bg-brand-hover active:bg-brand-active disabled:bg-brand/50",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-3 hover:border-line-strong",
  ghost: "bg-transparent text-muted border border-transparent hover:bg-surface-3 hover:text-ink",
  danger: "bg-transparent text-danger border border-line hover:bg-danger-soft hover:border-danger/40",
  quiet: "bg-surface-3 text-ink border border-transparent hover:bg-line",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-xl",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, iconRight, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center font-medium whitespace-nowrap select-none",
        "transition-[background-color,border-color,color,opacity] duration-[140ms] ease-out",
        "disabled:cursor-not-allowed disabled:opacity-55",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "ghost", size = "md", className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex items-center justify-center rounded-lg transition-colors duration-[140ms] ease-out",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "size-7" : "size-9",
        VARIANTS[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export interface LinkButtonProps {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** A Link that looks exactly like a Button — navigation must stay a real anchor. */
export function LinkButton({ href, variant = "secondary", size = "md", icon, iconRight, className, children }: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center font-medium whitespace-nowrap select-none",
        "transition-[background-color,border-color,color] duration-[140ms] ease-out",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
    >
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}
