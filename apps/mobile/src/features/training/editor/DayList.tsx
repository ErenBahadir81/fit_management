import React from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import type { ProgramMode } from "@fitfloow/core";
import { fmtNumber } from "../../../lib/format";
import { haptic } from "../../../lib/haptics";
import { useTheme } from "../../../theme/ThemeProvider";
import { springs, timing } from "../../../theme/motion";
import { radii, spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { dayLabel, KIND_TR, type DraftDay } from "../lib/editorDraft";
import { KIND_ICON } from "../program/TodayHero";

export const DAY_ROW_H = 68;

export interface DayListProps {
  days: readonly DraftDay[];
  mode: ProgramMode;
  canRemove: boolean;
  onOpen: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

/**
 * The program's days. Long-press the handle and drag to reorder (rows the dragged one passes
 * slide aside on the UI thread); every row also has move up/down accessibility actions, so the
 * order can be changed without a drag at all.
 */
export function DayList({ days, mode, canRemove, onOpen, onMove, onRemove }: DayListProps) {
  const dragIndex = useSharedValue(-1);
  const offsetY = useSharedValue(0);
  return (
    <View style={styles.list} testID="editor-days">
      {days.map((day, index) => (
        <DayRow
          key={day.key}
          day={day}
          index={index}
          count={days.length}
          mode={mode}
          canRemove={canRemove}
          dragIndex={dragIndex}
          offsetY={offsetY}
          onMove={onMove}
          onOpen={onOpen}
          onRemove={onRemove}
        />
      ))}
    </View>
  );
}

function summary(day: DraftDay): string {
  if (day.kind === "rest") return "Dinlenme";
  if (day.kind === "run" || day.kind === "swim") {
    const t = day[day.kind];
    return t ? `${KIND_TR[day.kind]} · ${fmtNumber(t.targetKm, 1)} km · ${t.targetMin} dk` : KIND_TR[day.kind];
  }
  const sets = day.exercises.reduce((a, e) => a + e.targetSets, 0);
  return day.exercises.length === 0 ? `${KIND_TR[day.kind]} · hareket yok` : `${day.exercises.length} hareket · ${sets} set`;
}

function DayRow({
  day,
  index,
  count,
  mode,
  canRemove,
  dragIndex,
  offsetY,
  onMove,
  onOpen,
  onRemove,
}: {
  day: DraftDay;
  index: number;
  count: number;
  mode: ProgramMode;
  canRemove: boolean;
  dragIndex: SharedValue<number>;
  offsetY: SharedValue<number>;
  onMove: (from: number, to: number) => void;
  onOpen: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();

  // Rows the dragged one passes over slide out of the way, on the UI thread.
  const shift = useDerivedValue(() => {
    const drag = dragIndex.get();
    if (drag === -1 || drag === index) return 0;
    const target = drag + Math.round(offsetY.get() / DAY_ROW_H);
    if (drag < index && target >= index) return -DAY_ROW_H;
    if (drag > index && target <= index) return DAY_ROW_H;
    return 0;
  });

  const style = useAnimatedStyle(() => {
    const dragging = dragIndex.get() === index;
    const settle = (v: number) => (reduce ? withTiming(v, timing.reduced) : withSpring(v, springs.snappy));
    return {
      transform: [{ translateY: dragging ? offsetY.get() : settle(shift.get()) }, { scale: dragging && !reduce ? 1.02 : 1 }],
      zIndex: dragging ? 10 : 0,
      opacity: dragging ? 0.96 : 1,
    };
  });

  const move = (to: number) => {
    onMove(index, to);
    void haptic.select();
  };

  const pan = Gesture.Pan()
    .activateAfterLongPress(120)
    .onStart(() => {
      dragIndex.set(index);
      offsetY.set(0);
    })
    .onUpdate((e) => {
      offsetY.set(e.translationY);
    })
    .onEnd(() => {
      const to = index + Math.round(offsetY.get() / DAY_ROW_H);
      dragIndex.set(-1);
      offsetY.set(0);
      if (to !== index) runOnJS(move)(to);
    })
    .onFinalize(() => {
      dragIndex.set(-1);
      offsetY.set(0);
    });

  const label = dayLabel(mode, index);
  return (
    <Animated.View style={style}>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <GestureDetector gesture={pan}>
          <Animated.View style={styles.handle} testID={`editor-handle-${index}`} accessibilityLabel="Sıralama tutamacı">
            <Icon icon="reorder" size={20} color="inkSubtle" />
          </Animated.View>
        </GestureDetector>
        <Pressable
          onPress={() => onOpen(index)}
          scaleTo={0.99}
          testID={`editor-day-${index}`}
          accessibilityLabel={`${label}, ${day.title || "adsız gün"}, ${summary(day)}`}
          accessibilityHint="Düzenlemek için dokun"
          accessibilityActions={[
            { name: "moveUp", label: "Yukarı taşı" },
            { name: "moveDown", label: "Aşağı taşı" },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "moveUp" && index > 0) move(index - 1);
            if (e.nativeEvent.actionName === "moveDown" && index < count - 1) move(index + 1);
          }}
          style={styles.body}
        >
          <Icon icon={KIND_ICON[day.kind]} size={18} color={day.kind === "rest" ? "inkSubtle" : "primary"} />
          <View style={styles.texts}>
            <Text variant="caption" color="inkMuted" numberOfLines={1}>
              {label}
            </Text>
            <Text variant="bodyStrong" numberOfLines={1} color={day.title.trim() ? "ink" : "danger"}>
              {day.title.trim() || "Adsız gün"}
            </Text>
            <Text variant="caption" color="inkMuted" tabular numberOfLines={1}>
              {summary(day)}
            </Text>
          </View>
          <Icon icon="forward" size={18} color="inkSubtle" />
        </Pressable>
        {canRemove ? (
          <Pressable onPress={() => onRemove(index)} haptic="medium" testID={`editor-remove-day-${index}`} accessibilityLabel={`${label} gününü sil`} style={styles.remove}>
            <Icon icon="delete" size={18} color="danger" />
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", height: DAY_ROW_H - spacing.sm, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth },
  handle: { width: 40, height: "100%", alignItems: "center", justifyContent: "center" },
  body: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md, height: "100%", paddingRight: spacing.sm },
  texts: { flex: 1, gap: 1 },
  remove: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
