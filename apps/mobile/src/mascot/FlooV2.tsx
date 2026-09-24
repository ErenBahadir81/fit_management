import React, { useMemo } from "react";
import { isSkiaUnavailable } from "../lib/skiaWeb";
import { FlooModel, type Mood as ModelMood } from "./model";
import { Floo as FlooLegacy, FLOO_SIZES, type FlooProps } from "./Floo";
import type { FlooMood } from "./moods";

/**
 * Drop-in adapter: the old `Floo` prop signature, the new Skia `FlooModel` body.
 *
 * The v1 mascot had ten faces; the v2 model is parametric and ships six. The map below is the
 * lossy part of the swap — `proud` / `flex` both land on `happy`, `think` / `curious` on the
 * neutral `idle` — and it lives here so the twenty-odd call sites keep their expressive vocabulary.
 *
 * Box: the caller passes a *width* (`s`/`m`/`l` or px) exactly as before; `FlooModel` derives the
 * height from its own 200 × 290 body space, so a box is ~16% taller than the v1 250 × 200 one.
 * Every call site either centres the mascot in a column or hands it to `EmptyState`, both of which
 * flow vertically, so the extra height pushes content down rather than clipping anything.
 */
const MOOD_MAP: Record<FlooMood, ModelMood> = {
  happy: "happy",
  cheer: "celebrate",
  hype: "celebrate",
  proud: "happy",
  flex: "happy",
  think: "idle",
  curious: "idle",
  sleepy: "sleepy",
  worried: "worried",
  sad: "sad",
};

export function FlooV2(props: FlooProps) {
  const { mood = "happy", size = "m", animate = true, style, testID } = props;
  const px = typeof size === "number" ? size : FLOO_SIZES[size];
  const modelMood = useMemo(() => MOOD_MAP[mood] ?? "idle", [mood]);
  // Web only, and only if CanvasKit never arrived (see `src/lib/skiaWeb.tsx`): the v1 SVG mascot is
  // still a mascot, which beats an empty hole where the illustration should be.
  if (isSkiaUnavailable()) return <FlooLegacy {...props} />;
  return <FlooModel mood={modelMood} size={px} animate={animate} style={style} testID={testID} />;
}

export { FLOO_SIZES, type FlooProps, type FlooSize } from "./Floo";
