import React, { forwardRef, useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle, type StyleProp } from "react-native";
import Animated, { FadeIn, FadeOut, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";
import { timing } from "../theme/motion";
import { radii, spacing } from "../theme/tokens";
import { Icon } from "./Icon";
import { resolveGlyph, type IconGlyph } from "./icons";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

/** Width of the focus halo drawn outside the field. */
const HALO = 3;

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  error?: string | null;
  hint?: string;
  icon?: IconGlyph;
  secure?: boolean;
  /** Trailing unit, e.g. "kg". */
  unit?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Labelled input: label above, a `controlBorder` edge (≥ 3:1) that turns `focus` on focus with a soft
 * halo around it (opacity only, so nothing shifts), error/hint line and a secure-text eye toggle.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, icon, secure, unit, containerStyle, onFocus, onBlur, testID, editable = true, ...rest },
  ref
) {
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(Boolean(secure));
  const focus = useSharedValue(0);
  const accent = error ? colors.danger : colors.focus;
  const idle = error ? colors.danger : colors.controlBorder;
  const border = useAnimatedStyle(() => ({ borderColor: interpolateColor(focus.value, [0, 1], [idle, accent]) }));
  const halo = useAnimatedStyle(() => ({ opacity: focus.value * 0.3 }));

  return (
    <View style={containerStyle}>
      <Text variant="label" color="inkMuted" style={styles.label}>
        {label}
      </Text>
      <View>
        <Animated.View pointerEvents="none" style={[styles.halo, { borderColor: accent }, halo]} />
        <Animated.View style={[styles.field, { backgroundColor: colors.surface }, border, !editable && { opacity: 0.6 }]}>
          {icon && <Icon name={resolveGlyph(icon)} size={18} color="inkSubtle" />}
          <TextInput
            ref={ref}
            {...rest}
            testID={testID}
            editable={editable}
            accessibilityLabel={rest.accessibilityLabel ?? label}
            placeholderTextColor={colors.inkSubtle}
            secureTextEntry={hidden}
            onFocus={(e) => {
              focus.value = withTiming(1, timing.fast);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              focus.value = withTiming(0, timing.fast);
              onBlur?.(e);
            }}
            style={[styles.input, { color: colors.ink }]}
          />
          {unit ? (
            <Text variant="label" color="inkMuted">
              {unit}
            </Text>
          ) : null}
          {secure && (
            <Pressable
              onPress={() => setHidden((h) => !h)}
              haptic="select"
              minTarget={false}
              accessibilityLabel={hidden ? "Şifreyi göster" : "Şifreyi gizle"}
              style={styles.eye}
            >
              <Icon name={hidden ? "eye-outline" : "eye-off-outline"} size={20} color="inkSubtle" />
            </Pressable>
          )}
        </Animated.View>
      </View>
      {error ? (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)}>
          <Text variant="caption" tone="danger" style={styles.helper} accessibilityLiveRegion="polite">
            {error}
          </Text>
        </Animated.View>
      ) : hint ? (
        <Text variant="caption" color="inkSubtle" style={styles.helper}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: { marginBottom: spacing.xs + 2, marginLeft: spacing.xs },
  field: { flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 52, borderRadius: radii.control, borderWidth: 1.5, paddingHorizontal: spacing.lg },
  halo: { position: "absolute", top: -HALO, left: -HALO, right: -HALO, bottom: -HALO, borderRadius: radii.control + HALO, borderWidth: HALO },
  // outlineWidth 0: the field draws its own focus edge + halo, so the browser's (web) must not double it.
  input: { flex: 1, fontSize: 16, height: "100%", paddingVertical: 0, outlineWidth: 0 },
  eye: { width: 36, height: 36, alignItems: "center", justifyContent: "center", marginRight: -spacing.sm },
  helper: { marginTop: spacing.xs + 2, marginLeft: spacing.xs },
});
