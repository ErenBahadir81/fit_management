import React from "react";
import { View, type ViewProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radii } from "../theme/tokens";

export interface SurfaceProps extends ViewProps {
  elevated?: boolean;
  muted?: boolean;
  radius?: keyof typeof radii;
  bordered?: boolean;
}

/** A themed background plane (no padding). Use `Card` for content blocks. */
export function Surface({ elevated, muted, radius = "card", bordered, style, ...rest }: SurfaceProps) {
  const { colors, shadows } = useTheme();
  return (
    <View
      {...rest}
      style={[
        { backgroundColor: muted ? colors.surfaceMuted : elevated ? colors.surfaceElevated : colors.surface, borderRadius: radii[radius] },
        bordered && { borderWidth: 1, borderColor: colors.border },
        elevated && shadows.elevated,
        style,
      ]}
    />
  );
}
