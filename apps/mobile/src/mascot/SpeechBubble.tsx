import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";
import { radii, spacing } from "../theme/tokens";
import { Text } from "../ui/Text";

export interface SpeechBubbleProps {
  text: string;
  /** Which side Floo is on (tail points there). */
  tail?: "left" | "right" | "none";
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Floo's line. New text crossfades in (no typewriter); height changes are spring-smoothed. */
export function SpeechBubble({ text, tail = "left", style, testID }: SpeechBubbleProps) {
  const { colors, shadows } = useTheme();
  return (
    <Animated.View
      layout={LinearTransition.springify().damping(20).stiffness(160)}
      testID={testID}
      accessibilityLabel={`Floo: ${text}`}
      accessibilityLiveRegion="polite"
      style={[styles.wrap, style]}
    >
      <View style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.border }, shadows.card]}>
        <Animated.View key={text} entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)}>
          <Text variant="body">{text}</Text>
        </Animated.View>
      </View>
      {tail !== "none" && (
        <View
          style={[
            styles.tail,
            { backgroundColor: colors.surface, borderColor: colors.border },
            tail === "left" ? styles.tailLeft : styles.tailRight,
          ]}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch" },
  bubble: { borderRadius: radii.md, borderWidth: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  tail: { position: "absolute", width: 14, height: 14, transform: [{ rotate: "45deg" }], borderWidth: 1, borderTopWidth: 0, borderRightWidth: 0, top: "50%", marginTop: -7 },
  tailLeft: { left: -7 },
  tailRight: { right: -7, transform: [{ rotate: "225deg" }] },
});
