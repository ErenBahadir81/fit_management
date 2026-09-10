import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "../lib/haptics";
import { useTheme } from "../theme/ThemeProvider";
import { radii, spacing } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export type ToastKind = "success" | "error" | "info";
export interface ToastOptions {
  message: string;
  kind?: ToastKind;
  /** ms, default 2500 */
  duration?: number;
}
interface ToastApi {
  show: (opts: ToastOptions) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const icons: Record<ToastKind, IconName> = { success: "checkmark-circle", error: "alert-circle", info: "information-circle" };

/** Inline toasts — never alert dialogs. One at a time, auto-hides, haptic per kind. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const show = useCallback(
    (opts: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current);
      const kind = opts.kind ?? "info";
      setToast({ ...opts, kind, id: ++seq.current });
      if (kind === "success") void haptic.success();
      else if (kind === "error") void haptic.error();
      else void haptic.select();
      timer.current = setTimeout(() => setToast(null), opts.duration ?? 2500);
    },
    []
  );
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const api = useMemo(() => ({ show, hide }), [show, hide]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastHost toast={toast} onDismiss={hide} />
    </ToastContext.Provider>
  );
}

function ToastHost({ toast, onDismiss }: { toast: (ToastOptions & { id: number }) | null; onDismiss: () => void }) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  const kind = toast.kind ?? "info";
  const tint = { success: colors.success, error: colors.danger, info: colors.primary }[kind];
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing.sm }]}>
      <Animated.View
        key={toast.id}
        entering={FadeInUp.springify().damping(18).stiffness(220)}
        exiting={FadeOutUp.duration(160)}
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        onTouchEnd={onDismiss}
        style={[styles.toast, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, shadows.elevated]}
      >
        <Icon name={icons[kind]} size={20} color={tint} />
        <Text variant="bodyStrong" style={styles.text} numberOfLines={2}>
          {toast.message}
        </Text>
      </Animated.View>
    </View>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 1000, paddingHorizontal: spacing.gutter },
  toast: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radii.md, borderWidth: 1, maxWidth: 420 },
  text: { flexShrink: 1 },
});
