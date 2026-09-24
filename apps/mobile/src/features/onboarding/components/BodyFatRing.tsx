import React, { forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import { BODY_FAT_CATEGORY_TR, bodyFatCategory, type Gender } from "@fitfloow/core";
import { fmtPct } from "../../../lib/format";
import { spacing } from "../../../theme/tokens";
import { Ring } from "../../../ui/Ring";
import { Text } from "../../../ui/Text";

export interface BodyFatRingProps {
  /** Measurements in and plausible so far. */
  filled: number;
  /** How many this person needs (3, or 4 with the hip). */
  total: number;
  bodyFatPct: number | null;
  gender: Gender | null;
  size?: number;
}

/**
 * The ring beside Floo on the measurement step. Each plausible measurement fills its share, so the
 * tape measure visibly pays off; the last one completes it and the estimate appears in the middle.
 * The centre cross-fades between "2/3" and the percentage; nothing jumps.
 */
export const BodyFatRing = forwardRef<View, BodyFatRingProps>(function BodyFatRing({ filled, total, bodyFatPct, gender, size = 104 }, ref) {
  const reduce = useReducedMotion();
  const done = bodyFatPct !== null && filled >= total;
  const category = done && gender ? BODY_FAT_CATEGORY_TR[bodyFatCategory(gender, bodyFatPct)] : null;
  const fade = reduce ? FadeIn.duration(150) : FadeIn.duration(220);
  const label = done ? `Tahmini yağ oranın ${fmtPct(bodyFatPct)}, ${category}` : `${filled} / ${total} ölçü girildi`;

  return (
    <View ref={ref} collapsable={false} style={styles.wrap} accessible accessibilityLabel={label} testID="ob-ring">
      <Ring value={total > 0 ? filled / total : 0} size={size} accessibilityLabel={label}>
        {done ? (
          <Animated.View key="pct" entering={fade} exiting={FadeOut.duration(120)} style={styles.center}>
            <Text variant="number" tone="primary" tabular testID="ob-ring-pct">
              {fmtPct(bodyFatPct)}
            </Text>
            <Text variant="caption" color="inkMuted">
              yağ
            </Text>
          </Animated.View>
        ) : (
          <Animated.View key="count" entering={fade} exiting={FadeOut.duration(120)} style={styles.center}>
            <Text variant="number" tabular testID="ob-ring-count">
              {filled}/{total}
            </Text>
            <Text variant="caption" color="inkMuted">
              ölçü
            </Text>
          </Animated.View>
        )}
      </Ring>
      <Text variant="label" color={category ? "ink" : "inkSubtle"} align="center" testID="ob-ring-category" style={styles.caption}>
        {category ?? "Yağ oranı"}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: spacing.xs },
  center: { alignItems: "center" },
  caption: { minHeight: 18 },
});
