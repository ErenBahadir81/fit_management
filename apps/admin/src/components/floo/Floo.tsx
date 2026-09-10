"use client";

import { useId } from "react";
import type { Mood } from "@fitfloow/core";
import { cx } from "@/lib/cx";

/**
 * Floo — the FitFloow mascot (docs/plan/09-mascot.md).
 * A round violet flame-drop: body gradient #6D5DF6 → #8B7CFF, cheeks #FFB4C6, eyes #0F141C.
 * The admin panel renders him static-ish (a slow breathe that `prefers-reduced-motion` stops);
 * the expressive springs live on mobile.
 */
export function Floo({
  mood = "happy",
  size = 64,
  className,
  breathing = true,
  title,
}: {
  mood?: Mood;
  size?: number;
  className?: string;
  breathing?: boolean;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const bodyId = `floo-body-${uid}`;
  const glowId = `floo-glow-${uid}`;

  return (
    <svg
      width={size}
      height={size * 1.2}
      viewBox="0 0 100 120"
      className={cx(breathing && "origin-bottom motion-safe:animate-[ff-breathe_2.4s_ease-in-out_infinite]", className)}
      role="img"
      aria-label={title ?? `Floo — ${MOOD_TR[mood]}`}
    >
      <defs>
        <linearGradient id={bodyId} x1="20" y1="8" x2="86" y2="116" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8B7CFF" />
          <stop offset="1" stopColor="#6D5DF6" />
        </linearGradient>
        <radialGradient id={glowId} cx="0.32" cy="0.28" r="0.5">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* arms */}
      {mood === "flex" ? (
        <>
          <path d="M14 74 C 4 70, 2 58, 10 52 C 14 58, 18 64, 20 70 Z" fill="#5B4CE0" />
          <path d="M86 74 C 96 70, 98 58, 90 52 C 86 58, 82 64, 80 70 Z" fill="#5B4CE0" />
        </>
      ) : mood === "cheer" ? (
        <>
          <path d="M16 70 C 6 62, 6 50, 14 46 C 18 54, 20 62, 22 68 Z" fill="#5B4CE0" />
          <path d="M84 70 C 94 62, 94 50, 86 46 C 82 54, 80 62, 78 68 Z" fill="#5B4CE0" />
        </>
      ) : (
        <>
          <ellipse cx="12" cy="82" rx="7" ry="9" fill="#5B4CE0" />
          <ellipse cx="88" cy="82" rx="7" ry="9" fill="#5B4CE0" />
        </>
      )}

      {/* body: teardrop with a soft flame tip */}
      <path
        d="M50 118 C 22 118, 7 99, 7 77 C 7 53, 31 36, 44 15 C 47 9, 49 2, 49 2 C 49 2, 53 13, 58 23 C 70 43, 93 55, 93 77 C 93 99, 78 118, 50 118 Z"
        fill={`url(#${bodyId})`}
      />
      <path
        d="M50 118 C 22 118, 7 99, 7 77 C 7 53, 31 36, 44 15 C 47 9, 49 2, 49 2 C 49 2, 53 13, 58 23 C 70 43, 93 55, 93 77 C 93 99, 78 118, 50 118 Z"
        fill={`url(#${glowId})`}
      />

      {/* cheeks */}
      <ellipse cx="27" cy="88" rx="7" ry="4.5" fill="#FFB4C6" opacity={mood === "sleepy" ? 0.5 : 0.85} />
      <ellipse cx="73" cy="88" rx="7" ry="4.5" fill="#FFB4C6" opacity={mood === "sleepy" ? 0.5 : 0.85} />

      <Eyes mood={mood} />
      <Mouth mood={mood} />
      <Brows mood={mood} />
    </svg>
  );
}

function Eyes({ mood }: { mood: Mood }) {
  const dark = "#0F141C";
  if (mood === "cheer") {
    return (
      <g fill="none" stroke={dark} strokeWidth="4" strokeLinecap="round">
        <path d="M28 78 q 6 -8 12 0" />
        <path d="M60 78 q 6 -8 12 0" />
      </g>
    );
  }
  if (mood === "sleepy") {
    return (
      <g fill="none" stroke={dark} strokeWidth="3.5" strokeLinecap="round">
        <path d="M28 79 q 6 5 12 0" />
        <path d="M60 79 q 6 5 12 0" />
      </g>
    );
  }
  const dx = mood === "think" ? 2.5 : 0;
  const dy = mood === "worried" ? 1 : 0;
  return (
    <g>
      <ellipse cx="34" cy="77" rx="6.5" ry="7.5" fill="#ffffff" />
      <ellipse cx="66" cy="77" rx="6.5" ry="7.5" fill="#ffffff" />
      <circle cx={34 + dx} cy={77 + dy} r="4" fill={dark} />
      <circle cx={66 + dx} cy={77 + dy} r="4" fill={dark} />
      <circle cx={32.5 + dx} cy={74.5 + dy} r="1.4" fill="#ffffff" />
      <circle cx={64.5 + dx} cy={74.5 + dy} r="1.4" fill="#ffffff" />
    </g>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  const dark = "#0F141C";
  switch (mood) {
    case "cheer":
      return <path d="M42 92 q 8 10 16 0 q -8 4 -16 0 Z" fill={dark} />;
    case "flex":
      return <path d="M42 93 q 8 6 16 0" fill="none" stroke={dark} strokeWidth="3" strokeLinecap="round" />;
    case "think":
      return <path d="M44 94 h 10" fill="none" stroke={dark} strokeWidth="3" strokeLinecap="round" />;
    case "sleepy":
      return <ellipse cx="50" cy="94" rx="3.5" ry="4.5" fill={dark} opacity="0.9" />;
    case "worried":
      return <path d="M43 96 q 7 -6 14 0" fill="none" stroke={dark} strokeWidth="3" strokeLinecap="round" />;
    default:
      return <path d="M43 92 q 7 7 14 0" fill="none" stroke={dark} strokeWidth="3" strokeLinecap="round" />;
  }
}

function Brows({ mood }: { mood: Mood }) {
  if (mood !== "worried" && mood !== "think" && mood !== "flex") return null;
  const stroke = "#0F141C";
  if (mood === "worried") {
    return (
      <g fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" opacity="0.9">
        <path d="M27 65 l 12 4" />
        <path d="M73 65 l -12 4" />
      </g>
    );
  }
  if (mood === "flex") {
    return (
      <g fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" opacity="0.9">
        <path d="M28 67 l 12 -2" />
        <path d="M72 67 l -12 -2" />
      </g>
    );
  }
  return (
    <g fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" opacity="0.9">
      <path d="M28 66 l 12 1" />
      <path d="M73 63 l -11 3" />
    </g>
  );
}

export const MOOD_TR: Record<Mood, string> = {
  happy: "Mutlu",
  cheer: "Coşkulu",
  think: "Düşünceli",
  sleepy: "Uykulu",
  flex: "Kaslı",
  worried: "Endişeli",
};

/** Floo with a speech bubble — used on the dashboard and the mascot preview. */
export function FlooBubble({ mood = "happy", text, size = 56 }: { mood?: Mood; text: string; size?: number }) {
  return (
    <div className="flex items-end gap-3">
      <Floo mood={mood} size={size} />
      <div className="relative max-w-xs rounded-xl rounded-bl-sm border border-line bg-surface-2 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
        {text}
      </div>
    </div>
  );
}
