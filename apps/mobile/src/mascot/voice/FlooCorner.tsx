import React, { useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeProvider";
import { easeOutStrong, springs } from "../../theme/motion";
import { radii, spacing } from "../../theme/tokens";
import { Icon } from "../../ui/Icon";
import { Pressable } from "../../ui/Pressable";
import { Text } from "../../ui/Text";
import { FlooV2 as Floo } from "../FlooV2";
import type { QueuedMessage } from "./queue";
import { useFloo, useFlooPresence, type FlooPresence } from "./FlooVoiceProvider";

/** Floo's width in the corner. The model is 1.45× taller than wide. */
export const FLOO_CORNER_SIZE = 40;
/** Horizontal room a header must leave free on its right so its title never runs under Floo. */
export const FLOO_CORNER_INSET = FLOO_CORNER_SIZE + spacing.md;
/** Top of Floo's box below the safe area. Headers line their first row up with this. */
export const FLOO_CORNER_TOP = spacing.xs;

const BUBBLE_MAX = 320;

/**
 * The top-right Floo and the bubble that drops out of it. One host per navigator layer: the tabs
 * layout mounts one with `presence="idle"` (it survives tab switches, so the character never
 * remounts mid-sentence) and the modal stack mounts one with `"auto"`. A root-level overlay would
 * not work: iOS presents `fullScreenModal` routes in their own view controller, above anything the
 * root renders. Only the most recently mounted host draws; the queue itself is global.
 */
export function FlooCornerHost({ presence: requested = "idle" }: { presence?: Exclude<FlooPresence, "hidden"> }) {
  const active = useFlooPresence(requested);
  const voice = useFloo();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { presence, enabled } = voice;
  const current = active ? voice.current : null;
  const visible = active && enabled && presence !== "hidden" && (presence === "idle" || current != null);

  // Slide in from the edge when a modal's Floo has something to say; out again when it is done.
  const shown = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    shown.set(reduce ? withTiming(visible ? 1 : 0, { duration: 150 }) : withSpring(visible ? 1 : 0, springs.snappy));
  }, [visible, reduce, shown]);
  const floo = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateX: (1 - shown.get()) * 28 }, { scale: 0.9 + shown.get() * 0.1 }],
  }));

  if (!enabled) return null;
  const mood = current?.mood ?? voice.restingMood;

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + FLOO_CORNER_TOP, right: spacing.gutter - spacing.xs }]}>
      <Animated.View style={floo} pointerEvents={visible ? "box-none" : "none"}>
        <Pressable
          onPress={current ? () => voice.dismiss() : voice.poke}
          haptic="tap"
          scaleTo={0.92}
          minTarget={false}
          accessibilityLabel={current ? "Floo'nun mesajını kapat" : "Floo"}
          accessibilityHint={current ? undefined : "Son mesajı tekrar gösterir"}
          testID="floo-corner"
          style={styles.flooBtn}
        >
          <Floo mood={mood} size={FLOO_CORNER_SIZE} testID="floo-corner-model" />
          {voice.pendingCount > 0 && current ? <PendingBadge count={voice.pendingCount} /> : null}
        </Pressable>
      </Animated.View>
      {current && visible ? <Bubble key={current.id} message={current} /> : null}
    </View>
  );
}

function PendingBadge({ count }: { count: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: colors.primary, borderColor: colors.bg }]} accessibilityLabel={`${count} mesaj daha`}>
      <Text variant="caption" style={{ color: colors.onPrimary }} tabular>
        {`+${count}`}
      </Text>
    </View>
  );
}

/**
 * The speech bubble. Grows out of Floo (origin top-right, 0.94 → 1 with opacity, never from zero),
 * leaves faster than it came, and can be flicked up or tapped away. A finger resting on it holds
 * the timer, so a line is never pulled away mid-read.
 */
function Bubble({ message }: { message: QueuedMessage }) {
  const { colors } = useTheme();
  const voice = useFloo();
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
  const maxWidth = Math.min(BUBBLE_MAX, width - spacing.gutter * 2);
  const warning = message.tone === "warning";
  // Floo's voice has its own colour: a drop of its body blue in the surface. Warnings go amber.
  const fill = warning ? colors.warningSoft : colors.flooBubble;
  const edge = warning ? colors.warning : colors.flooBubbleBorder;

  const drag = useSharedValue(0);
  const dismiss = () => voice.dismiss(message.id);
  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onBegin(() => runOnJS(voice.hold)(true))
    .onUpdate((e) => {
      // Up moves freely; down is damped, there is nowhere to go.
      drag.set(e.translationY < 0 ? e.translationY : e.translationY * 0.2);
    })
    .onEnd((e) => {
      if (e.translationY < -24 || e.velocityY < -450) {
        runOnJS(dismiss)();
      } else {
        drag.set(withSpring(0, springs.snappy));
        runOnJS(voice.hold)(false);
      }
    })
    .onFinalize((_e, ok) => {
      if (!ok) runOnJS(voice.hold)(false);
    });
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drag.get() }],
    opacity: 1 + Math.min(0, drag.get()) / 80,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        entering={reduce ? FadeInReduced : bubbleIn}
        exiting={reduce ? FadeOutReduced : bubbleOut}
        style={[styles.bubbleWrap, { maxWidth }, dragStyle]}
      >
        <View style={[styles.tail, { backgroundColor: fill, borderColor: edge }]} />
        <Pressable
          onPress={dismiss}
          onPressIn={() => voice.hold(true)}
          onPressOut={() => voice.hold(false)}
          haptic="none"
          scaleTo={0.985}
          minTarget={false}
          accessibilityRole="alert"
          accessibilityLabel={`Floo: ${message.text}`}
          accessibilityLiveRegion={warning ? "assertive" : "polite"}
          accessibilityActions={[{ name: "dismiss", label: "Kapat" }]}
          onAccessibilityAction={dismiss}
          testID="floo-bubble"
          style={[
            styles.bubble,
            { backgroundColor: fill, borderColor: edge },
          ]}
        >
          <View style={styles.row}>
            {warning ? <Icon icon="warning" size={18} color="warning" /> : null}
            <Text variant="body" style={styles.text}>
              {message.text}
            </Text>
          </View>
          {message.action ? (
            <Pressable
              onPress={() => {
                message.action?.onPress();
                dismiss();
              }}
              haptic="select"
              minTarget={false}
              accessibilityLabel={message.action.label}
              testID="floo-bubble-action"
              style={[styles.action, { backgroundColor: colors.surface, borderColor: edge }]}
            >
              <Text variant="label" color="primary">
                {message.action.label}
              </Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

// Enter 240 ms strong ease-out from just behind Floo; exit 140 ms, faster than it came.
const bubbleIn = () => {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -6 }, { scale: 0.94 }] },
    animations: {
      opacity: withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
      transform: [{ translateY: withTiming(0, { duration: 240, easing: easeOutStrong }) }, { scale: withTiming(1, { duration: 240, easing: easeOutStrong }) }],
    },
  };
};
const bubbleOut = () => {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: 140, easing: Easing.out(Easing.quad) }),
      transform: [{ translateY: withTiming(-4, { duration: 140 }) }, { scale: withTiming(0.97, { duration: 140 }) }],
    },
  };
};
const FadeInReduced = () => {
  "worklet";
  return { initialValues: { opacity: 0 }, animations: { opacity: withTiming(1, { duration: 150 }) } };
};
const FadeOutReduced = () => {
  "worklet";
  return { initialValues: { opacity: 1 }, animations: { opacity: withTiming(0, { duration: 120 }) } };
};

const styles = StyleSheet.create({
  host: { position: "absolute", zIndex: 900, alignItems: "flex-end" },
  flooBtn: { width: FLOO_CORNER_SIZE + spacing.sm, alignItems: "center", justifyContent: "flex-start" },
  badge: {
    position: "absolute",
    left: -6,
    bottom: 2,
    minWidth: 22,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleWrap: { marginTop: spacing.xs, alignSelf: "flex-end", transformOrigin: "top right" },
  bubble: { borderRadius: radii.md, borderWidth: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  text: { flexShrink: 1 },
  tail: {
    position: "absolute",
    top: -7,
    right: FLOO_CORNER_SIZE / 2 + spacing.xs - 7,
    width: 14,
    height: 14,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    transform: [{ rotate: "45deg" }],
    zIndex: 1,
  },
  action: { alignSelf: "flex-start", paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1 },
});
