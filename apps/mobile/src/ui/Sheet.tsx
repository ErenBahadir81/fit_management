import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, View, type ViewStyle, type StyleProp } from "react-native";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps, type BottomSheetModalProps } from "@gorhom/bottom-sheet";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { springs } from "../theme/motion";
import { radii, spacing } from "../theme/tokens";
import { Text } from "./Text";

export interface SheetRef {
  present: () => void;
  dismiss: () => void;
}

export interface SheetProps extends Partial<Omit<BottomSheetModalProps, "children" | "ref">> {
  children: React.ReactNode;
  title?: string;
  /** Pad content with the screen gutter (default true). */
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * Declarative mode: `true` presents on mount / when it flips to true, `false` dismisses.
   * Pair it with `onDismiss` to unmount the sheet after the close animation. Leave undefined to
   * drive the sheet through the ref (`useSheet`).
   */
  open?: boolean;
}

function Backdrop(props: BottomSheetBackdropProps) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />;
}

/**
 * The one bottom sheet (gorhom v5): dynamic sizing, dimmed backdrop, drag handle, keyboard-aware
 * (`interactive`) and the app's `gentle` spring. Imperative (`useSheet` → ref) or declarative (`open`).
 * Full-screen flows (camera, workout logger) are routes under `app/(modals)` instead.
 */
export const Sheet = forwardRef<SheetRef, SheetProps>(function Sheet({ children, title, padded = true, contentStyle, open, ...rest }, ref) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const modal = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => ({ present: () => modal.current?.present(), dismiss: () => modal.current?.dismiss() }), []);

  useEffect(() => {
    if (open === undefined) return;
    if (open) modal.current?.present();
    else modal.current?.dismiss();
  }, [open]);

  // One spring for every sheet; reduced motion gets a short, non-bouncy timing-like spring.
  const animationConfigs = useMemo(() => (reduce ? { damping: 40, stiffness: 400, mass: 1, overshootClamping: true } : { ...springs.gentle, overshootClamping: false }), [reduce]);

  return (
    <BottomSheetModal
      ref={modal}
      enableDynamicSizing
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      animationConfigs={animationConfigs}
      backdropComponent={Backdrop}
      backgroundStyle={{ backgroundColor: isDark ? colors.surfaceElevated : colors.surface, borderRadius: radii.sheet }}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong, width: 40, height: 5 }}
      {...rest}
    >
      <BottomSheetView style={[padded && styles.padded, { paddingBottom: insets.bottom + spacing.lg }, contentStyle]}>
        {title ? (
          <Text variant="heading" style={styles.title} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

export function useSheet() {
  const ref = useRef<SheetRef>(null);
  const present = useCallback(() => ref.current?.present(), []);
  const dismiss = useCallback(() => ref.current?.dismiss(), []);
  return { ref, present, dismiss };
}

/** Button row for sheet footers. */
export function SheetActions({ children }: { children: React.ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

const styles = StyleSheet.create({
  padded: { paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, gap: spacing.lg },
  title: { marginBottom: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
});
