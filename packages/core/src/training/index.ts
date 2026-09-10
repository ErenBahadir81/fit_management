/**
 * TRAINING domain — pure, deterministic (`now` is always injected), zero I/O.
 * Fatigue/recovery, weekly volume, the schedule strip, program pointer math, cardio
 * progression and weekly training stats. Everything the API and the frontends share.
 */
export * from "./types";
export * from "./recovery";
export * from "./volume";
export * from "./schedule";
export * from "./program";
export * from "./cardio";
export * from "./stats";

/* B1 (platform/admin program templates) — planned volume per cycle. */
export * from "./templateVolume";
