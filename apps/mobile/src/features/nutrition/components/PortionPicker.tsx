import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { fmtInt } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Chip } from "../../../ui/Chip";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { portionPresets, type PortionInfo } from "../model/scanMachine";
import { GramKeypad } from "./GramKeypad";

export interface PortionPickerProps {
  food: PortionInfo;
  grams: number;
  onChange: (grams: number) => void;
  /** Spoken name of what is being portioned, e.g. "Pilav". */
  label: string;
  testID: string;
}

/**
 * How much: one tap on a portion people think in ("1 porsiyon", "100 g", "avuç"), or the exact
 * grams on a keypad. The amount itself is the button that opens the keypad.
 */
export function PortionPicker({ food, grams, onChange, label, testID }: PortionPickerProps) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const [keypad, setKeypad] = useState(false);
  const presets = useMemo(() => portionPresets(food), [food]);

  return (
    <View style={styles.stack}>
      <View style={styles.chips}>
        {presets.map((p) => (
          <Chip
            key={p.key}
            testID={`${testID}-preset-${p.key}`}
            label={p.key === "100g" ? p.label : `${p.label} · ${fmtInt(p.grams)} g`}
            size="sm"
            selected={grams === p.grams}
            onPress={() => {
              setKeypad(false);
              onChange(p.grams);
            }}
          />
        ))}
        <Pressable
          testID={`${testID}-grams`}
          onPress={() => setKeypad((k) => !k)}
          haptic="select"
          minTarget={false}
          accessibilityLabel={`${label} miktarı ${fmtInt(grams)} gram. Gram girmek için dokun.`}
          accessibilityState={{ expanded: keypad }}
          style={[styles.amount, { borderColor: keypad ? colors.focus : colors.controlBorder, backgroundColor: colors.surface }]}
        >
          <Text variant="label" tabular testID={`${testID}-grams-value`}>
            {fmtInt(grams)} g
          </Text>
          <Icon icon="edit" size={14} color="inkMuted" />
        </Pressable>
      </View>
      {keypad ? (
        <Animated.View entering={reduce ? undefined : FadeIn.duration(150)}>
          <GramKeypad value={grams} onChange={onChange} onDone={() => setKeypad(false)} testID={`${testID}-keypad`} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  amount: { flexDirection: "row", alignItems: "center", gap: spacing.xs, height: 30, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1 },
});
