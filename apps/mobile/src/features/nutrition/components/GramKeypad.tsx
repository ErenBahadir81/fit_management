import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { fmtInt } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";

export const KEYPAD_MAX_G = 2000;
const MAX_DIGITS = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "done"] as const;
type Key = (typeof KEYS)[number];

/**
 * Typing into the keypad: the first digit replaces the shown amount (you are entering a new one,
 * not editing the old), later digits append; backspace removes one. Never above the cap.
 */
export function keypadNext(draft: string, key: Exclude<Key, "done">, fresh: boolean): string {
  if (key === "back") return fresh ? "" : draft.slice(0, -1);
  const base = fresh ? "" : draft;
  if (base.length >= MAX_DIGITS) return base;
  const next = (base + key).replace(/^0+/, "");
  return Number(next) > KEYPAD_MAX_G ? String(KEYPAD_MAX_G) : next;
}

export interface GramKeypadProps {
  value: number;
  /** Live: every keystroke that forms an amount ≥ 1 g. */
  onChange: (grams: number) => void;
  onDone: () => void;
  testID?: string;
}

/** A phone-dialler grid for grams: faster than a stepper for "237 g", no keyboard to summon. */
export function GramKeypad({ value, onChange, onDone, testID = "gram-keypad" }: GramKeypadProps) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(String(Math.round(value)));
  const [fresh, setFresh] = useState(true);

  const press = useCallback(
    (key: Key) => {
      if (key === "done") {
        onDone();
        return;
      }
      const next = keypadNext(draft, key, fresh);
      setDraft(next);
      setFresh(false);
      const grams = Number(next);
      if (grams >= 1) onChange(grams);
    },
    [draft, fresh, onChange, onDone]
  );

  return (
    <View style={styles.grid} testID={testID}>
      <Text variant="caption" color="inkMuted" style={styles.readout} tabular accessibilityLiveRegion="polite" testID={`${testID}-draft`}>
        {draft ? `${fmtInt(Number(draft))} g` : "— g"}
      </Text>
      {KEYS.map((key) => {
        const done = key === "done";
        return (
          <Pressable
            key={key}
            testID={`${testID}-${key}`}
            onPress={() => press(key)}
            haptic="select"
            minTarget={false}
            disabled={done && !(Number(draft) >= 1)}
            accessibilityLabel={key === "back" ? "Sil" : done ? "Tamam" : key}
            style={[styles.key, { backgroundColor: done ? colors.primary : colors.surface, borderColor: colors.border }]}
          >
            {key === "back" ? (
              <Icon name="backspace-outline" size={20} color="ink" />
            ) : (
              <Text variant={done ? "bodyStrong" : "title"} tabular style={done ? { color: colors.onPrimary } : undefined}>
                {done ? "Tamam" : key}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  readout: { width: "100%" },
  key: { width: "31.5%", flexGrow: 1, height: 48, borderRadius: radii.control, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
});
