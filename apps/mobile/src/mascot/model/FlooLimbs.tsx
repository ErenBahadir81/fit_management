import React from "react";
import { Group, Oval, Path } from "@shopify/react-native-skia";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import type { FlooLod } from "./behaviour";
import { FLOO_MODEL_COLORS as C } from "./params";
import {
  A,
  ANKLE,
  ARM_BASE,
  FINGER_W,
  HIP,
  LEG_BASE,
  LIMB_W,
  LINE_W,
  SHOULDER,
  THUMB_W,
  armGeometry,
  bodyToWorld,
  legGeometry,
  type ArmGeo,
  type BodyXform,
  type LegGeo,
} from "./rig";

/** How far outside the shoulder the front copy of an arm starts, so its root never paints over the body. */
const SHOULDER_DISC_R = 10.5;

/** Stand-ins for limbs a level of detail does not draw, so their geometry is never computed. */
const NO_PATH = "M0 0";
const HIDDEN_ARM: ArmGeo = {
  tube: NO_PATH,
  rim: NO_PATH,
  hand: { palm: NO_PATH, fingers: NO_PATH, creases: NO_PATH, thumb: NO_PATH, tip: { x: 0, y: 0 } },
  wrist: { x: 0, y: 0 },
  elbow: { x: 0, y: 0 },
  front: 0,
};
const HIDDEN_LEG: LegGeo = { tube: NO_PATH, rim: NO_PATH, boot: NO_PATH, gloss: { x: 0, y: 0 } };

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  "worklet";
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
}

export interface FlooLimbsProps {
  /** The posed channels, published by the frame loop in `FlooModel`. */
  rig: SharedValue<number[]>;
  body: SharedValue<BodyXform>;
  hydroScale: SharedValue<number>;
  lod: FlooLod;
  /** The body and face: drawn between the limbs behind it and the arms that cross in front. */
  children: React.ReactNode;
}

/**
 * Floo's arms and legs, around the body passed in as children. Legs and arms are drawn behind the
 * body (their roots sit inside the silhouette, so they tuck in with no seam); an arm that crosses
 * the body — a clap, a fist on the chin — is drawn a second time in front of it.
 */
export function FlooLimbs({ rig, body: bodyX, hydroScale, lod, children }: FlooLimbsProps) {
  /*
   * Limbs. Roots ride the body (hydration scale included, so a thirsty drop's shoulders come in
   * with its sides); hands with an IK target reach for a body-space point carried by the body too.
   * Legs are planted on the ground: only their hips move with the body.
   */
  const armGeo = (side: "L" | "R", v: number[], b: BodyXform, hk: number): ArmGeo => {
    "worklet";
    const base = ARM_BASE[side];
    const s = side === "L" ? -1 : 1;
    const root = bodyToWorld(SHOULDER[side], b, hk);
    const target = v[base + A.ik] > 0.001 ? bodyToWorld({ x: v[base + A.ikX], y: v[base + A.ikY] }, b) : null;
    return armGeometry(v, base, s, root, b.lean, target);
  };
  // The badge draws one hand and the mid LOD no legs: what is not drawn is not computed either.
  const armL = useDerivedValue(() => {
    "worklet";
    return lod === "badge" ? HIDDEN_ARM : armGeo("L", rig.get(), bodyX.get(), hydroScale.get());
  }, [lod]);
  const armR = useDerivedValue(() => {
    "worklet";
    return armGeo("R", rig.get(), bodyX.get(), hydroScale.get());
  });
  const legGeo = (side: "L" | "R", v: number[], b: BodyXform, hk: number): LegGeo => {
    "worklet";
    const s = side === "L" ? -1 : 1;
    const hip = bodyToWorld(HIP[side], b, hk);
    // The ankles stay where they are planted: a sideways body shift bends the legs, it never
    // drags the feet along the ground.
    return legGeometry(v, LEG_BASE[side], s, hip, ANKLE[side], 0);
  };
  const legL = useDerivedValue(() => {
    "worklet";
    return lod === "full" ? legGeo("L", rig.get(), bodyX.get(), hydroScale.get()) : HIDDEN_LEG;
  }, [lod]);
  const legR = useDerivedValue(() => {
    "worklet";
    return lod === "full" ? legGeo("R", rig.get(), bodyX.get(), hydroScale.get()) : HIDDEN_LEG;
  }, [lod]);
  const armLTube = useDerivedValue(() => armL.get().tube);
  const armLRim = useDerivedValue(() => armL.get().rim);
  const armLPalm = useDerivedValue(() => armL.get().hand.palm);
  const armLFingers = useDerivedValue(() => armL.get().hand.fingers);
  const armLCreases = useDerivedValue(() => armL.get().hand.creases);
  const armLThumb = useDerivedValue(() => armL.get().hand.thumb);
  const armLFront = useDerivedValue(() => (armL.get().front > 0.5 ? 1 : 0));
  const armRTube = useDerivedValue(() => armR.get().tube);
  const armRRim = useDerivedValue(() => armR.get().rim);
  const armRPalm = useDerivedValue(() => armR.get().hand.palm);
  const armRFingers = useDerivedValue(() => armR.get().hand.fingers);
  const armRCreases = useDerivedValue(() => armR.get().hand.creases);
  const armRThumb = useDerivedValue(() => armR.get().hand.thumb);
  const armRFront = useDerivedValue(() => (armR.get().front > 0.5 ? 1 : 0));
  /** The disc around each shoulder the FRONT copy of an arm leaves out, so its root stays hidden. */
  const shoulderDiscL = useDerivedValue(() => {
    "worklet";
    if (lod === "badge") return NO_PATH;
    const p = bodyToWorld(SHOULDER.L, bodyX.get(), hydroScale.get());
    return ellipsePath(p.x, p.y, SHOULDER_DISC_R, SHOULDER_DISC_R);
  }, [lod]);
  const shoulderDiscR = useDerivedValue(() => {
    "worklet";
    const p = bodyToWorld(SHOULDER.R, bodyX.get(), hydroScale.get());
    return ellipsePath(p.x, p.y, SHOULDER_DISC_R, SHOULDER_DISC_R);
  });
  const legLTube = useDerivedValue(() => legL.get().tube);
  const legLRim = useDerivedValue(() => legL.get().rim);
  const legLBoot = useDerivedValue(() => legL.get().boot);
  const legRTube = useDerivedValue(() => legR.get().tube);
  const legRRim = useDerivedValue(() => legR.get().rim);
  const legRBoot = useDerivedValue(() => legR.get().boot);
  const legLGlossX = useDerivedValue(() => legL.get().gloss.x - 4.5);
  const legLGlossY = useDerivedValue(() => legL.get().gloss.y - 2.2);
  const legRGlossX = useDerivedValue(() => legR.get().gloss.x - 4.5);
  const legRGlossY = useDerivedValue(() => legR.get().gloss.y - 2.2);

  const armDetail = lod === "full";
  /**
   * One arm, drawn as a single silhouette: every contour first (tube, palm, fingers, thumb, each
   * stroked wider than its fill), then every fill on top. The fills cover the inner contours, so
   * the tube, the palm and the fingers read as one piece of rubber with one outline around it.
   */
  const renderArm = (
    tube: SharedValue<string>,
    rim: SharedValue<string>,
    palm: SharedValue<string>,
    fingers: SharedValue<string>,
    creases: SharedValue<string>,
    thumb: SharedValue<string>
  ) => (
    <>
      <Path path={tube} color={C.outline} style="stroke" strokeWidth={LIMB_W + 2 * LINE_W} strokeCap="round" strokeJoin="round" />
      <Path path={palm} color={C.outline} />
      <Path path={palm} color={C.outline} style="stroke" strokeWidth={2 * LINE_W} strokeJoin="round" />
      <Path path={fingers} color={C.outline} style="stroke" strokeWidth={FINGER_W + 2 * LINE_W} strokeCap="round" />
      <Path path={thumb} color={C.outline} style="stroke" strokeWidth={THUMB_W + 2 * LINE_W} strokeCap="round" />
      <Path path={tube} color={C.bodyMid} style="stroke" strokeWidth={LIMB_W} strokeCap="round" strokeJoin="round" />
      <Path path={fingers} color={C.bodyMid} style="stroke" strokeWidth={FINGER_W} strokeCap="round" />
      <Path path={palm} color={C.bodyMid} />
      <Path path={thumb} color={C.bodyMid} style="stroke" strokeWidth={THUMB_W} strokeCap="round" />
      {armDetail ? (
        <>
          <Path path={creases} color={C.limbCrease} style="stroke" strokeWidth={1.4} strokeCap="round" />
          <Path path={rim} color={C.limbRim} style="stroke" strokeWidth={2.2} strokeCap="round" opacity={0.85} />
        </>
      ) : null}
    </>
  );
  const renderLegOutline = (tube: SharedValue<string>, boot: SharedValue<string>) => (
    <>
      <Path path={tube} color={C.outline} style="stroke" strokeWidth={LIMB_W + 2 * LINE_W} strokeCap="round" strokeJoin="round" />
      <Path path={boot} color={C.outline} />
      <Path path={boot} color={C.outline} style="stroke" strokeWidth={2 * LINE_W} strokeJoin="round" />
    </>
  );
  const renderLegFill = (tube: SharedValue<string>, rim: SharedValue<string>, boot: SharedValue<string>, gx: SharedValue<number>, gy: SharedValue<number>) => (
    <>
      <Path path={tube} color={C.bodyMid} style="stroke" strokeWidth={LIMB_W} strokeCap="round" strokeJoin="round" />
      <Path path={boot} color={C.shoe} />
      <Path path={rim} color={C.limbRim} style="stroke" strokeWidth={2.2} strokeCap="round" opacity={0.8} />
      <Oval x={gx} y={gy} width={9} height={4.4} color={C.gloss} opacity={0.8} />
    </>
  );

  return (
    <>
          {/* Legs: planted in world space, behind the body, which hides the hips. */}
          {lod === "full" ? (
            <Group>
              {renderLegOutline(legLTube, legLBoot)}
              {renderLegOutline(legRTube, legRBoot)}
              {renderLegFill(legLTube, legLRim, legLBoot, legLGlossX, legLGlossY)}
              {renderLegFill(legRTube, legRRim, legRBoot, legRGlossX, legRGlossY)}
            </Group>
          ) : null}

          {/* Arms, behind the body: the shoulder sits inside the silhouette, so the root is hidden. */}
          {lod !== "badge" ? renderArm(armLTube, armLRim, armLPalm, armLFingers, armLCreases, armLThumb) : null}
          {renderArm(armRTube, armRRim, armRPalm, armRFingers, armRCreases, armRThumb)}

      {children}
          {/* Arms that cross in front of the body (a clap, a hand on the chin) are drawn again on
              top, minus a disc around the shoulder so the root still tucks in behind. */}
          {lod !== "badge" ? (
            <Group clip={shoulderDiscL} invertClip opacity={armLFront}>
              {renderArm(armLTube, armLRim, armLPalm, armLFingers, armLCreases, armLThumb)}
            </Group>
          ) : null}
          <Group clip={shoulderDiscR} invertClip opacity={armRFront}>
            {renderArm(armRTube, armRRim, armRPalm, armRFingers, armRCreases, armRThumb)}
          </Group>
    </>
  );
}
