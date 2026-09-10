import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const enabled = Platform.OS !== "web";

async function safe(run: () => Promise<void>): Promise<void> {
  if (!enabled) return;
  try {
    await run();
  } catch {
    /* haptics are best-effort */
  }
}

/** Semantic haptics — call these, never expo-haptics directly. */
export const haptic = {
  /** Every pressable: press-in feedback. */
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Heavier confirmations (complete a set, finish workout). */
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Selection changes: tab switch, segmented, chart scrub ticks. */
  select: () => safe(() => Haptics.selectionAsync()),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
export type HapticKind = keyof typeof haptic;
