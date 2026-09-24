import React from "react";
import { isSkiaUnavailable } from "../lib/skiaWeb";
import { FlooModel, type FlooModelProps } from "./model";
import { Floo as FlooLegacy, FLOO_SIZES, type FlooProps } from "./Floo";
import { toFlooMood } from "./moodMap";

export interface FlooV2Props extends FlooProps {
  /** One-shot beat from the trigger library (`mealLogged`, `goalHit`…). Change the key to replay. */
  trigger?: FlooModelProps["trigger"];
  /** Point at something, in this view's own pixels. The nearer hand reaches for it until null. */
  pointAt?: FlooModelProps["pointAt"];
}

/**
 * Drop-in adapter: the old `Floo` prop signature, the new Skia `FlooModel` body.
 *
 * Moods: callers keep the v1/API vocabulary (ten faces); `toFlooMood` puts each on the model's
 * own face of the same name, or the nearest one for the four the model does not have (`cheer` and
 * `hype` celebrate, `flex` is energetic, `curious` thinks).
 *
 * Box: the caller passes a *width* (`s`/`m`/`l` or px) exactly as before; `FlooModel` derives the
 * height from its level of detail (see `flooBox`), so a box is taller than the v1 250 × 200 one.
 * Every call site either centres the mascot in a column or hands it to `EmptyState`, both of which
 * flow vertically, so the extra height pushes content down rather than clipping anything.
 */
export function FlooV2({ trigger, pointAt, ...props }: FlooV2Props) {
  const { mood = "happy", size = "m", animate = true, style, testID } = props;
  const px = typeof size === "number" ? size : FLOO_SIZES[size];
  // Web only, and only if CanvasKit never arrived (see `src/lib/skiaWeb.tsx`): the v1 SVG mascot is
  // still a mascot, which beats an empty hole where the illustration should be. It has no triggers.
  if (isSkiaUnavailable()) return <FlooLegacy {...props} />;
  return <FlooModel mood={toFlooMood(mood)} size={px} animate={animate} trigger={trigger} pointAt={pointAt} style={style} testID={testID} />;
}

export { FLOO_SIZES, type FlooProps, type FlooSize } from "./Floo";
