"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "fitfloow.admin.theme";

/**
 * Runs before hydration so the first paint is already in the right theme.
 * Keep it dependency-free and tiny — it is inlined into the document head.
 */
export const themeBootstrapScript = `(function(){try{var m=localStorage.getItem('${THEME_STORAGE_KEY}');var e=document.documentElement;e.classList.remove('dark','light');if(m==='dark')e.classList.add('dark');else if(m==='light')e.classList.add('light');}catch(e){}})();`;

/* ---------------------------------------------------------------------------
 * Theme lives in an external store (localStorage + the document class) rather
 * than in React state, so there is no setState-in-effect and no hydration flash:
 * the bootstrap script above and `readMode()` read exactly the same value.
 * ------------------------------------------------------------------------- */

let modeCache: ThemeMode | null = null;
const modeListeners = new Set<() => void>();

function readMode(): ThemeMode {
  if (modeCache) return modeCache;
  let stored: ThemeMode = "system";
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "dark" || raw === "light" || raw === "system") stored = raw;
  } catch {
    /* storage blocked — stay on system */
  }
  modeCache = stored;
  return stored;
}

function subscribeMode(onChange: () => void): () => void {
  modeListeners.add(onChange);
  return () => modeListeners.delete(onChange);
}

function applyMode(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.remove("dark", "light");
  if (mode === "dark") el.classList.add("dark");
  else if (mode === "light") el.classList.add("light");
}

export function setThemeMode(mode: ThemeMode): void {
  modeCache = mode;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* storage blocked — the class still switches for this session */
  }
  applyMode(mode);
  modeListeners.forEach((l) => l());
}

/** Media-query store shared by every hook below (one listener per query). */
function mediaStore(query: string) {
  let cache: boolean | null = null;
  return {
    subscribe(onChange: () => void) {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(query);
      const handler = () => {
        cache = mq.matches;
        onChange();
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    },
    get() {
      if (cache === null) {
        cache = typeof window !== "undefined" && Boolean(window.matchMedia) ? window.matchMedia(query).matches : false;
      }
      return cache;
    },
  };
}

const darkQuery = mediaStore("(prefers-color-scheme: dark)");
const reducedQuery = mediaStore("(prefers-reduced-motion: reduce)");

/** Provider kept so the tree has one obvious place to wrap; the store is module-level. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export interface ThemeValue {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export function useTheme(): ThemeValue {
  const mode = useSyncExternalStore(subscribeMode, readMode, () => "system" as ThemeMode);
  const systemDark = useSyncExternalStore(darkQuery.subscribe, darkQuery.get, () => false);
  const resolved: "light" | "dark" = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  const toggle = useCallback(() => {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    setThemeMode(next);
  }, []);

  return useMemo(() => ({ mode, resolved, setMode: setThemeMode, toggle }), [mode, resolved, toggle]);
}

/** True when the OS asks for less motion — for chart libraries motion cannot reach. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(reducedQuery.subscribe, reducedQuery.get, () => false);
}

/** True once React is running in the browser — the portal-mount guard. */
const noopSubscribe = () => () => {};
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
