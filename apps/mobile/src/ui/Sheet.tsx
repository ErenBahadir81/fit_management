import React, { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { StyleSheet, View, type ViewStyle, type StyleProp } from "react-native";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps, type BottomSheetModalProps } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
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
}

function Backdrop(props: BottomSheetBackdropProps) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />;
}

/**
 * Bottom sheet (gorhom v5) with dynamic sizing, dimmed backdrop, drag handle and keyboard awareness.
 * `const ref = useSheet(); <Sheet ref={ref}>…</Sheet>; ref.current?.present()`.
 * Use full-screen modal routes (app/(modals)) instead when the flow needs the whole screen.
 */
export const Sheet = forwardRef<SheetRef, SheetProps>(function Sheet({ children, title, padded = true, contentStyle, ...rest }, ref) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const modal = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => ({ present: () => modal.current?.present(), dismiss: () => modal.current?.dismiss() }), []);

  return (
    <BottomSheetModal
      ref={modal}
      enableDynamicSizing
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
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
