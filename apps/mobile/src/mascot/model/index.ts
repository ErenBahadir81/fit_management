/** Floo v2 — the parametric, limbless droplet. Public surface. */
export * from "./params";
export * from "./geometry";
export { FlooModel, FLOO_MODEL_ASPECT, type FlooModelProps } from "./FlooModel";
export { FlooEffects, type EffectKind, type FlooEffectsProps } from "./Effects";
export { useFlooModel, type FlooController, type FlooEffectState } from "./useFlooModel";
// `Playground` is deliberately NOT re-exported: on web it must only ever be reached through a
// dynamic import inside `WithSkiaWeb`, after CanvasKit has loaded.
