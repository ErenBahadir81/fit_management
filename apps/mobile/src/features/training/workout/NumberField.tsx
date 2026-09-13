import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { clamp, round } from "@fitfloow/core";
import { fmtNumber } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing, tabularNums } from "../../../theme/tokens";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";

export interface NumberFieldProps {
  value: number | null;
  onChange: (next: number | null) => void;
  /** Printed under the digits: "kg", "tekrar", "sn". */
  unit: string;
  /** Spoken label. Also the caption above the digits. */
  label: string;
  min?: number;
  max?: number;
  /** When set, a −/+ row appears under the digits with this increment. */
  step?: number;
  decimals?: number;
  size?: "lg" | "sm";
  /** The field the eye should land on first. */
  emphasis?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** tr-TR types a comma; the parser takes either. */
function parse(text: string): number | null {
  const cleaned = text.replace(/\s/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "." || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function display(value: number | null, decimals: number): string {
  if (value === null) return "";
  return fmtNumber(value, value % 1 === 0 ? 0 : decimals);
}

/**
 * A number you type, not a number you tap towards. The digits *are* the target: one tap opens the
 * numeric pad with the value selected, so 8 → 12 is one gesture instead of four. The −/+ row stays
 * for the common nudge (one plate, one rep) but it is never the only way in.
 */
export function NumberField({ value, onChange, unit, label, min = 0, max = 9999, step, decimals = 1, size = "lg", emphasis, style, testID }: NumberFieldProps) {
  const { colors, type } = useTheme();
  const input = useRef<TextInput>(null);
  // While the field has focus the raw keystrokes win, so "6" on the way to "62,5" is not reformatted
  // out from under the user. On blur the committed value takes over again.
  const [draft, setDraft] = useState<string | null>(null);
  const big = size === "lg";

  const commit = useCallback(
    (next: number | null) => onChange(next === null ? null : round(clamp(next, min, max), decimals)),
    [decimals, max, min, onChange]
  );

  const onChangeText = useCallback(
    (text: string) => {
      setDraft(text);
      commit(parse(text));
    },
    [commit]
  );

  const nudge = useCallback(
    (direction: 1 | -1) => {
      if (step === undefined) return;
      setDraft(null);
      commit(round((value ?? 0) + direction * step, decimals));
    },
    [commit, decimals, step, value]
  );

  const shown = draft ?? display(value, decimals);
  const spoken = value === null ? `${label}, boş` : `${label}, ${display(value, decimals)} ${unit}`;

  return (
    <View style={[styles.wrap, style]} testID={testID}>
      <Text variant="caption" color="inkMuted">
        {label}
      </Text>
      <Pressable
        onPress={() => input.current?.focus()}
        haptic="none"
        minTarget={false}
        // The box only widens the tap area; VoiceOver should land on the input itself.
        accessible={false}
        importantForAccessibility="no"
        style={[
          styles.box,
          big ? styles.boxLg : styles.boxSm,
          { backgroundColor: colors.surfaceMuted, borderColor: emphasis ? colors.primary : colors.border },
        ]}
      >
        <TextInput
          ref={input}
          value={shown}
          onChangeText={onChangeText}
          onFocus={() => setDraft(display(value, decimals))}
          onBlur={() => setDraft(null)}
          keyboardType={decimals > 0 ? "decimal-pad" : "number-pad"}
          inputMode={decimals > 0 ? "decimal" : "numeric"}
          selectTextOnFocus
          returnKeyType="done"
          placeholder="—"
          placeholderTextColor={colors.inkSubtle}
          maxFontSizeMultiplier={1.2}
          accessibilityLabel={spoken}
          testID={testID ? `${testID}-input` : undefined}
          style={[big ? type.hero : type.heading, tabularNums, styles.input, { color: colors.ink }]}
        />
        <Text variant={big ? "label" : "caption"} color="inkMuted">
          {unit}
        </Text>
      </Pressable>

      {step !== undefined ? (
        <View style={styles.nudges}>
          <Nudge label={`−${fmtNumber(step, step % 1 === 0 ? 0 : 1)}`} spoken={`${label} azalt`} onPress={() => nudge(-1)} testID={testID ? `${testID}-dec` : undefined} />
          <Nudge label={`+${fmtNumber(step, step % 1 === 0 ? 0 : 1)}`} spoken={`${label} artır`} onPress={() => nudge(1)} testID={testID ? `${testID}-inc` : undefined} />
        </View>
      ) : null}
    </View>
  );
}

function Nudge({ label, spoken, onPress, testID }: { label: string; spoken: string; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} haptic="select" accessibilityLabel={spoken} testID={testID} style={[styles.nudge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text variant="label" color="inkMuted" tabular>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  box: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: spacing.xs, borderRadius: radii.control, borderWidth: 1.5, paddingHorizontal: spacing.sm },
  boxLg: { minHeight: 72 },
  boxSm: { minHeight: 52 },
  // `flex: 0` keeps the digits and the unit together in the middle instead of the input eating the row.
  input: { flexGrow: 0, flexShrink: 1, minWidth: 44, paddingVertical: spacing.sm, textAlign: "center" },
  nudges: { flexDirection: "row", gap: spacing.xs },
  nudge: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radii.sm, borderWidth: StyleSheet.hairlineWidth },
});
