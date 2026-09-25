import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { Pop, SlamIn } from "./Juice";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  /** A short tag next to the label, e.g. "Floo önerisi". */
  badge?: string;
}

export interface ChoiceListProps<T extends string> {
  options: readonly ChoiceOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  /** The question, read out as the group's name. */
  label: string;
  /**
   * Two columns for short labels: the grid shows labels only and the chosen answer's hint is
   * written underneath, so four answers take two rows instead of four tall cards.
   */
  columns?: 1 | 2;
  testID: string;
}

/**
 * One question, a few big answers. Each answer is a card (a 44 pt target and then some) that reads
 * as a radio button; the selected one gets the primary edge and a check, so the state never rests
 * on colour alone. Picking one squashes and boings the card and spins the check in.
 */
export function ChoiceList<T extends string>({ options, value, onChange, label, columns = 1, testID }: ChoiceListProps<T>) {
  const { colors } = useTheme();
  const grid = columns === 2;
  const chosenHint = grid ? options.find((o) => o.value === value)?.hint : undefined;
  const hasHints = grid && options.some((o) => o.hint);

  return (
    <View style={styles.list}>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} testID={testID} style={[styles.list, grid && styles.grid]}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pop key={o.value} trigger={selected} when={selected} amount={0.08} style={grid && styles.half}>
              <Pressable
                onPress={() => onChange(o.value)}
                haptic="select"
                scaleTo={0.93}
                accessibilityRole="radio"
                accessibilityState={{ selected, checked: selected }}
                accessibilityLabel={o.hint ? `${o.label}. ${o.hint}` : o.label}
                testID={`${testID}-${o.value}`}
                style={[
                  styles.card,
                  grid && styles.halfCard,
                  { backgroundColor: selected ? colors.primarySoft : colors.surface, borderColor: selected ? colors.primary : colors.border },
                ]}
              >
                <View style={styles.texts}>
                  <View style={styles.titleRow}>
                    <Text variant="title" style={styles.title}>
                      {o.label}
                    </Text>
                    {o.badge ? (
                      <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                        <Text variant="caption" style={{ color: colors.onPrimary }}>
                          {o.badge}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {o.hint && !grid ? (
                    <Text variant="caption" color="inkMuted">
                      {o.hint}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.check, { borderColor: selected ? colors.primary : colors.controlBorder, backgroundColor: selected ? colors.primary : "transparent" }]}>
                  {selected ? (
                    <SlamIn>
                      <Icon icon="check" size={14} color="onPrimary" />
                    </SlamIn>
                  ) : null}
                </View>
              </Pressable>
            </Pop>
          );
        })}
      </View>
      {hasHints ? (
        <Text variant="caption" color="inkMuted" accessibilityLiveRegion="polite" style={styles.chosenHint} testID={`${testID}-hint`}>
          {chosenHint ?? "Birini seç; ne anlama geldiği burada yazacak."}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1.5,
  },
  half: { flexGrow: 1, flexBasis: "40%" },
  halfCard: { flexGrow: 1, minHeight: 52, paddingVertical: spacing.sm },
  chosenHint: { minHeight: 32 },
  texts: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  title: { flexShrink: 1 },
  badge: { borderRadius: radii.xs, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
