/** Floo 3 — the parametric droplet with a skeleton. Public surface. */
export * from "./params";
export * from "./geometry";
export { FlooModel, FLOO_MODEL_ASPECT, type FlooModelProps } from "./FlooModel";
export { FlooEffects, type EffectKind, type FlooEffectsProps } from "./Effects";
export { useFlooModel, type FlooController, type FlooEffectState } from "./useFlooModel";
// `Playground` is deliberately NOT re-exported: on web it must only ever be reached through a
// dynamic import inside `WithSkiaWeb`, after CanvasKit has loaded.
export { GESTURES, IDLE_GESTURES, MOOD_RIG, gestureDuration, reducedGestureDuration, type Gesture } from "./poses";
export {
  LOD_VIEW,
  TRIGGER_PLAN,
  ambientMood,
  flooBox,
  flooTriggerPlan,
  resolveLod,
  type AmbientContext,
  type FlooLod,
  type TriggerPlan,
} from "./behaviour";
