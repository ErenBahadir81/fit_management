import React from "react";
import { View, type ViewProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export function Divider({ style, inset = 0, ...rest }: ViewProps & { inset?: number }) {
  const { colors } = useTheme();
  return <View {...rest} style={[{ height: 1, backgroundColor: colors.border, marginLeft: inset }, style]} />;
}
