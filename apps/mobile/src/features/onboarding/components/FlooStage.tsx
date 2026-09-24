import React, { forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useReducedMotion } from "react-native-reanimated";
import { FlooModel, flooBox, type Gesture, type Mood } from "../../../mascot/model";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Text } from "../../../ui/Text";
import type { FlooDirector } from "../useFlooDirector";

/** Full body, full detail: the session is the one place Floo is big (LOD full needs ≥ 96 px). */
export const STAGE_FLOO_WIDTH = 120;

export interface FlooStageProps {
  mood: Mood;
  say: string;
  director: FlooDirector;
  /** Next to Floo, under the bubble — the measurement step's ring. */
  side?: React.ReactNode;
  testID?: string;
}

/**
 * Floo asking the step's question. He stands on the left and walks on the spot between steps
 * while the content slides past (the director owns his translateX); the bubble to his right is his
 * voice, in the same blue as the corner Floo's, and cross-fades between lines.
 */
export const FlooStage = forwardRef<View, FlooStageProps>(function FlooStage({ mood, say, director, side, testID = "onboarding-stage" }, flooRef) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const box = flooBox(STAGE_FLOO_WIDTH, "full");
  const walk = useAnimatedStyle(() => ({ transform: [{ translateX: director.x.get() }] }));

  return (
    <View style={styles.row} testID={testID}>
      <Animated.View style={[{ width: box.width, height: box.height }, walk]}>
        <View ref={flooRef} collapsable={false} style={StyleSheet.absoluteFill} pointerEvents="none">
          <FlooModel
            size={STAGE_FLOO_WIDTH}
            lod="full"
            mood={mood}
            gesture={director.gesture as { name: Gesture; key: number } | null}
            pointAt={director.pointAt}
            walking={director.walking}
            testID="onboarding-floo"
          />
        </View>
      </Animated.View>
      <Animated.View style={styles.right} layout={reduce ? undefined : LinearTransition.springify().damping(22).stiffness(180)}>
        <View
          style={[styles.bubble, { backgroundColor: colors.flooBubble, borderColor: colors.flooBubbleBorder }]}
          accessibilityLabel={`Floo: ${say}`}
          accessibilityLiveRegion="polite"
          testID="onboarding-floo-bubble"
        >
          <View style={[styles.tail, { backgroundColor: colors.flooBubble, borderColor: colors.flooBubbleBorder }]} />
          <Animated.View key={say} entering={FadeIn.duration(reduce ? 150 : 200)} exiting={FadeOut.duration(100)}>
            <Text variant="body" testID="onboarding-floo-say">
              {say}
            </Text>
          </Animated.View>
        </View>
        {side}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  right: { flex: 1, gap: spacing.md, paddingTop: spacing.lg },
  bubble: { borderRadius: radii.md, borderWidth: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  tail: {
    position: "absolute",
    left: -7,
    top: 22,
    width: 14,
    height: 14,
    borderWidth: 1,
    borderTopWidth: 0,
    borderRightWidth: 0,
    transform: [{ rotate: "45deg" }],
  },
});
