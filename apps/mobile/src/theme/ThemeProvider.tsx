import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { STORAGE_KEYS, storage } from "../lib/storage";
import { dark, light, radii, shadowsFor, spacing, type, type Scheme, type ThemeColors, type ThemeMode, type ThemeShadows } from "./tokens";

export interface Theme {
  mode: ThemeMode;
  scheme: Scheme;
  isDark: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  type: typeof type;
  shadows: ThemeShadows;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<Theme | null>(null);

function readStoredMode(): ThemeMode {
  const v = storage.getString(STORAGE_KEYS.themeMode);
  return v === "light" || v === "dark" ? v : "system";
}

export function ThemeProvider({ children, initialMode }: { children: React.ReactNode; initialMode?: ThemeMode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(() => initialMode ?? readStoredMode());

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    if (m === "system") storage.remove(STORAGE_KEYS.themeMode);
    else storage.set(STORAGE_KEYS.themeMode, m);
  }, []);

  const scheme: Scheme = mode === "system" ? (system === "dark" ? "dark" : "light") : mode;

  const value = useMemo<Theme>(
    () => ({
      mode,
      scheme,
      isDark: scheme === "dark",
      colors: scheme === "dark" ? dark : light,
      spacing,
      radii,
      type,
      shadows: shadowsFor(scheme),
      setMode,
    }),
    [mode, scheme, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/** Memoize a style factory on the current scheme: `const s = useThemedStyles(t => ({ box: { backgroundColor: t.colors.surface } }))`. */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(theme), [theme]);
}
