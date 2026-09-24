// `Floo` is the v2 Skia mascot behind the v1 prop signature (see `FlooV2.tsx`). The original
// SVG + sprite component stays reachable as `FlooLegacy` — it is still the web fallback when
// CanvasKit does not load, and its own tests import it directly.
export { FlooV2 as Floo, type FlooV2Props } from "./FlooV2";
export { toFlooMood, toLegacyMood } from "./moodMap";
export { Floo as FlooLegacy, FLOO_SIZES, type FlooProps, type FlooSize } from "./Floo";
export { SpeechBubble, type SpeechBubbleProps } from "./SpeechBubble";
export { useMascot, MASCOT_FALLBACK, type MascotContext, type MascotLine } from "./useMascot";
export { MOOD_POSE, MOOD_LABEL_TR, FLOO_COLORS, type Mood, type Pose } from "./moods";
export { flooBus, useFlooEvents, describeFlooEvent, overTargetKey, FLOO_EVENTS, type FlooEvent, type FlooEventName, type FlooLine } from "./events";
export {
  FlooModel,
  flooBox,
  flooTriggerPlan,
  ambientMood,
  GESTURES,
  TRIGGERS as FLOO_TRIGGERS,
  type Gesture as FlooGesture,
  type FlooLod,
  type Trigger as FlooTrigger,
  type Mood as FlooModelMood,
} from "./model";
export * from "./voice";
