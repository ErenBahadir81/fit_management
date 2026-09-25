import React, { useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { FLOO_MODEL_COLORS as C } from "./params";

export type EffectKind = "hearts" | "confetti" | "droplets" | "star";

export interface FlooEffectsProps {
  kind: EffectKind | null;
  /** Bump to replay. The whole overlay remounts on a new nonce, which is what restarts the piece. */
  nonce: number;
  /**
   * Confetti is thrown from above the head, so most of it belongs *behind* the character with only
   * a few pieces passing in front — that parallax is what stops it reading as a flat sticker sheet.
   * Render one `back` layer under the mascot and one `front` layer over it, with the same nonce.
   */
  layer?: "back" | "front";
  style?: StyleProp<ViewStyle>;
}

/** How far above the stage centre the confetti is thrown from — roughly the tip of the crown. */
const CONFETTI_ORIGIN_Y = -80;

const HEART = "#FF6B8A";
const HEART_CORE = "#FFB3C4";
const CONFETTI_COLORS = ["#FFD166", "#06D6A0", "#EF476F", "#118AB2", "#A79AFF", "#FF9DB4"];

/**
 * Juice that lives *outside* the character: confetti, hearts, droplets, a "+★". Plain Reanimated
 * views rather than Skia, so the overlay costs nothing when idle and never blocks the canvas.
 *
 * Everything here is transient by construction — each piece animates once from a fresh mount and
 * is thrown away; there is no loop to leak.
 */
export function FlooEffects({ kind, nonce, layer = "front", style }: FlooEffectsProps) {
  if (!kind) return null;
  // Everything except confetti is a front-only effect; a back layer would just render it twice.
  if (layer === "back" && kind !== "confetti") return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Burst key={`${kind}-${nonce}-${layer}`} kind={kind} layer={layer} />
    </View>
  );
}

function Burst({ kind, layer }: { kind: EffectKind; layer: "back" | "front" }) {
  if (kind === "confetti") return <Confetti layer={layer} />;
  if (kind === "hearts") return <Hearts />;
  if (kind === "droplets") return <Droplets />;
  return <StarPop />;
}

interface Piece {
  angle: number;
  speed: number;
  spin: number;
  color: string;
  size: number;
  delay: number;
}

/**
 * A fixed pseudo-random number in [0, 1) for piece `i`, draw `k`. Render must stay pure, and a
 * burst that looks the same every time is fine: nobody sees two side by side.
 */
function jitter(i: number, k: number): number {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function Confetti({ layer }: { layer: "back" | "front" }) {
  const reduce = useReducedMotion();
  // 12 behind, 4 in front — the split is what gives the burst depth.
  const count = layer === "back" ? 12 : 4;
  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        // Thrown up and *outward* from over the crown, then pulled down by the gravity term.
        angle: -Math.PI / 2 + (jitter(i + count, 1) - 0.5) * 3.2,
        speed: 80 + jitter(i + count, 2) * 120,
        spin: (jitter(i + count, 3) - 0.5) * 900,
        color: CONFETTI_COLORS[(i * 2 + (layer === "front" ? 1 : 0)) % CONFETTI_COLORS.length],
        size: (layer === "front" ? 8 : 6) + jitter(i + count, 4) * 6,
        delay: jitter(i + count, 5) * 90,
      })),
    [count, layer]
  );
  return (
    <View style={[styles.centre, { transform: [{ translateY: CONFETTI_ORIGIN_Y }] }]}>
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} piece={p} reduce={reduce} />
      ))}
    </View>
  );
}

function ConfettiPiece({ piece, reduce }: { piece: Piece; reduce: boolean }) {
  const t = useSharedValue(0);
  const fade = useSharedValue(0);
  React.useEffect(() => {
    // Ease-out on the throw; gravity is applied in the style, so the arc is a real parabola.
    t.set(withDelay(piece.delay, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) })));
    fade.set(withSequence(withTiming(1, { duration: 120, easing: Easing.out(Easing.cubic) }), withDelay(500, withTiming(0, { duration: 280, easing: Easing.in(Easing.cubic) }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => {
    const p = t.get();
    const vx = Math.cos(piece.angle) * piece.speed;
    const vy = Math.sin(piece.angle) * piece.speed;
    const x = vx * p;
    const y = vy * p + 260 * p * p;
    return {
      opacity: fade.get(),
      transform: reduce ? [{ scale: 1 }] : [{ translateX: x }, { translateY: y }, { rotate: `${piece.spin * p}deg` }],
    };
  });
  return <Animated.View style={[styles.piece, { width: piece.size, height: piece.size * 1.6, backgroundColor: piece.color }, style]} />;
}

function Hearts() {
  const reduce = useReducedMotion();
  return (
    <View style={styles.centre}>
      {[0, 1, 2].map((i) => (
        <Heart key={i} index={i} reduce={reduce} />
      ))}
    </View>
  );
}

/** Hearts and stars spawn beside the head, never over the face. */
const FACE_CLEARANCE = 78;

function Heart({ index, reduce }: { index: number; reduce: boolean }) {
  const t = useSharedValue(0);
  const fade = useSharedValue(0);
  // Left, right, left — always outside the silhouette, above the eye line.
  const side = useMemo(() => (index === 1 ? 1 : -1), [index]);
  const drift = useMemo(() => side * (FACE_CLEARANCE + jitter(index, 6) * 22), [side, index]);
  React.useEffect(() => {
    const delay = index * 130;
    t.set(withDelay(delay, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) })));
    fade.set(withDelay(delay, withSequence(withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) }), withDelay(450, withTiming(0, { duration: 420, easing: Easing.in(Easing.cubic) })))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => {
    const p = t.get();
    return {
      opacity: fade.get(),
      transform: reduce
        ? [{ scale: 1 }]
        : [
            // Floats up AND outward, so it clears the head instead of drifting back over it.
            { translateX: drift + side * 24 * p + Math.sin(p * Math.PI * 2) * 5 },
            { translateY: -60 - 90 * p },
            { scale: 0.7 + 0.5 * Math.min(1, p * 3) },
          ],
    };
  });
  return (
    <Animated.View style={[styles.floater, style]}>
      <Text style={[styles.heart, { color: HEART }]}>♥</Text>
      <Text style={[styles.heart, styles.heartCore, { color: HEART_CORE }]}>♥</Text>
    </Animated.View>
  );
}

function Droplets() {
  const reduce = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        angle: -Math.PI / 2 + ((i - 2.5) / 2.5) * 1.15,
        speed: 60 + jitter(i, 7) * 60,
        size: 7 + jitter(i, 8) * 5,
        delay: i * 26,
      })),
    []
  );
  return (
    <View style={styles.centre}>
      {pieces.map((p, i) => (
        <Droplet key={i} piece={p} reduce={reduce} />
      ))}
    </View>
  );
}

function Droplet({ piece, reduce }: { piece: { angle: number; speed: number; size: number; delay: number }; reduce: boolean }) {
  const t = useSharedValue(0);
  const fade = useSharedValue(0);
  React.useEffect(() => {
    t.set(withDelay(piece.delay, withTiming(1, { duration: 720, easing: Easing.out(Easing.quad) })));
    fade.set(withDelay(piece.delay, withSequence(withTiming(1, { duration: 90, easing: Easing.out(Easing.cubic) }), withDelay(240, withTiming(0, { duration: 300, easing: Easing.in(Easing.cubic) })))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => {
    const p = t.get();
    const x = Math.cos(piece.angle) * piece.speed * p;
    const y = Math.sin(piece.angle) * piece.speed * p + 220 * p * p;
    return {
      opacity: fade.get(),
      transform: reduce ? [{ scale: 1 }] : [{ translateX: x }, { translateY: y }, { scale: 1 - 0.35 * p }],
    };
  });
  return <Animated.View style={[styles.piece, { width: piece.size, height: piece.size, borderRadius: piece.size, backgroundColor: "#7EC0F2" }, style]} />;
}

function StarPop() {
  const reduce = useReducedMotion();
  const scale = useSharedValue(0.3);
  const rise = useSharedValue(0);
  const fade = useSharedValue(0);
  React.useEffect(() => {
    // Overshoot then settle — a pop that lands on its target size reads as a fade-in, not a pop.
    scale.set(reduce ? withTiming(1, { duration: 150 }) : withSpring(1, { damping: 8, stiffness: 220 }));
    rise.set(withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }));
    fade.set(withSequence(withTiming(1, { duration: 140, easing: Easing.out(Easing.cubic) }), withDelay(480, withTiming(0, { duration: 340, easing: Easing.in(Easing.cubic) }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: fade.get(),
    transform: reduce
      ? [{ scale: 1 }]
      : [{ translateX: FACE_CLEARANCE }, { translateY: -80 - 70 * rise.get() }, { scale: scale.get() }],
  }));
  return (
    <View style={styles.centre}>
      <Animated.View style={[styles.floater, style]}>
        <Text style={{ fontSize: 30, fontWeight: "800", color: C.outline }}>+★</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  piece: { position: "absolute", borderRadius: 2 },
  floater: { position: "absolute", alignItems: "center", justifyContent: "center" },
  heart: { fontSize: 30 },
  heartCore: { position: "absolute", fontSize: 17 },
});
