import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { WATER_DEFAULT_GOAL_ML, WATER_GLASS_ML, waterProgress } from "@fitfloow/core";
import { fmtInt } from "../../../lib/format";
import { useTheme } from "../../../theme/ThemeProvider";
import { springs } from "../../../theme/motion";
import { radii, spacing } from "../../../theme/tokens";
import { Card } from "../../../ui/Card";
import { CountUp } from "../../../ui/CountUp";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { useAddWater, useUndoWater, useWaterDay } from "../useWater";

const GLASS_W = 44;
const GLASS_H = 60;

export interface WaterCardProps {
  dateKey: string;
  testID?: string;
}

/**
 * "Su" — one tap, one glass. The glass on the left fills with a spring that overshoots a little,
 * a drop leaps out of the button, and Floo in the corner drinks along (`waterLogged`).
 */
export function WaterCard({ dateKey, testID = "water-card" }: WaterCardProps) {
  const { colors } = useTheme();
  const q = useWaterDay(dateKey);
  const add = useAddWater(dateKey);
  const undo = useUndoWater(dateKey);
  const reduce = useReducedMotion();

  const totalMl = q.data?.totalMl ?? 0;
  const goalMl = q.data?.goalMl ?? WATER_DEFAULT_GOAL_ML;
  const count = q.data?.count ?? 0;
  const progress = waterProgress(totalMl, goalMl);
  const done = totalMl >= goalMl;

  // The glass: fill level springs to the new share, and the glass itself squashes on each tap.
  const level = useSharedValue(progress);
  const squash = useSharedValue(1);
  const drop = useSharedValue(0);
  const [dropKey, setDropKey] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      level.set(progress);
      return;
    }
    level.set(reduce ? withTiming(progress, { duration: 150 }) : withSpring(progress, springs.bouncy));
  }, [progress, reduce, level]);

  const fillStyle = useAnimatedStyle(() => ({ height: `${Math.max(0, Math.min(1.08, level.get())) * 100}%` }));
  const glassStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: 2 - squash.get() }, { scaleY: squash.get() }] }));
  const dropStyle = useAnimatedStyle(() => ({
    opacity: drop.get() === 0 ? 0 : 1 - Math.max(0, drop.get() - 0.6) / 0.4,
    transform: [{ translateY: -drop.get() * 46 }, { scale: 0.6 + drop.get() * 0.8 }, { rotate: `${drop.get() * -18}deg` }],
  }));

  const onAdd = useCallback(() => {
    add.mutate(WATER_GLASS_ML);
    if (reduce) return;
    squash.set(withSequence(withTiming(0.82, { duration: 90, easing: Easing.out(Easing.quad) }), withSpring(1, springs.bouncy)));
    drop.set(0);
    drop.set(withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }));
    setDropKey((k) => k + 1);
  }, [add, reduce, squash, drop]);

  const onUndo = useCallback(() => undo.mutate(), [undo]);

  const glasses = Math.round(goalMl / WATER_GLASS_ML);

  return (
    <Card style={styles.card} testID={testID} accessibilityLabel={`Su: ${fmtInt(totalMl)} / ${fmtInt(goalMl)} ml`}>
      <View style={styles.row}>
        <Animated.View style={[styles.glass, { borderColor: colors.primary, backgroundColor: colors.surfaceMuted }, glassStyle]}>
          <Animated.View style={[styles.fill, { backgroundColor: colors.primary }, fillStyle]} testID={`${testID}-fill`} />
          <View style={[styles.shine, { backgroundColor: colors.surface }]} />
        </Animated.View>

        <View style={styles.body}>
          <Text variant="label" color="inkMuted">
            Su
          </Text>
          <View style={styles.amount}>
            <CountUp variant="number" value={totalMl} format={fmtInt} testID={`${testID}-total`} />
            <Text variant="body" color="inkMuted" tabular>
              {` / ${fmtInt(goalMl)} ml`}
            </Text>
          </View>
          <Text variant="caption" color={done ? "success" : "inkMuted"} testID={`${testID}-caption`}>
            {done ? "Günlük hedef tamam!" : `${count} / ${glasses} bardak`}
          </Text>
        </View>

        <View style={styles.actions}>
          {count > 0 ? (
            <Pressable
              onPress={onUndo}
              haptic="select"
              accessibilityRole="button"
              accessibilityLabel="Son bardağı geri al"
              testID={`${testID}-undo`}
              style={[styles.undo, { backgroundColor: colors.surfaceMuted }]}
            >
              <Icon name="remove" size={18} color="inkMuted" />
            </Pressable>
          ) : null}
          <View>
            {dropKey > 0 ? (
              <Animated.View key={dropKey} pointerEvents="none" style={[styles.drop, dropStyle]}>
                <Icon name="water" size={22} color="primary" />
              </Animated.View>
            ) : null}
            <Pressable
              onPress={onAdd}
              haptic="medium"
              scaleTo={0.88}
              accessibilityRole="button"
              accessibilityLabel={`${WATER_GLASS_ML} ml su ekle`}
              testID={`${testID}-add`}
              style={[styles.add, { backgroundColor: colors.primary }]}
            >
              <Icon name="water" size={20} color="onPrimary" />
              <Text variant="bodyStrong" style={{ color: colors.onPrimary }}>
                {`+${WATER_GLASS_ML}`}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  glass: {
    width: GLASS_W,
    height: GLASS_H,
    borderWidth: 2,
    borderTopWidth: 0,
    borderBottomLeftRadius: radii.md,
    borderBottomRightRadius: radii.md,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  fill: { width: "100%", opacity: 0.85 },
  shine: { position: "absolute", left: 6, top: 8, width: 4, height: GLASS_H * 0.5, borderRadius: 2, opacity: 0.5 },
  body: { flex: 1, gap: 2 },
  amount: { flexDirection: "row", alignItems: "baseline" },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  undo: { width: 36, height: 36, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radii.pill,
  },
  drop: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" },
});
