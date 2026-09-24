// `Floo` is the v2 Skia mascot behind the v1 prop signature (see `FlooV2.tsx`). The original
// SVG + sprite component stays reachable as `FlooLegacy` — it is still the web fallback when
// CanvasKit does not load, and its own tests import it directly.
export { FlooV2 as Floo } from "./FlooV2";
export { Floo as FlooLegacy, FLOO_SIZES, type FlooProps, type FlooSize } from "./Floo";
export { SpeechBubble, type SpeechBubbleProps } from "./SpeechBubble";
export { useMascot, MASCOT_FALLBACK, type MascotContext, type MascotLine } from "./useMascot";
export { MOOD_POSE, MOOD_LABEL_TR, FLOO_COLORS, type Mood, type Pose } from "./moods";
export * from "./voice";
