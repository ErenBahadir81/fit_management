/**
 * Motion tokens. Springs for anything physical (position, scale), ease-out timing for opacity.
 * Under reduced motion every spring becomes a 150 ms fade/timing (see `resolveSpring`).
 */
import { Easing, FadeIn, FadeInDown, FadeOut, type WithSpringConfig, type WithTimingConfig } from "react-native-reanimated";

export const springs = {
  snappy: { damping: 18, stiffness: 260, mass: 1, overshootClamping: false } satisfies WithSpringConfig,
  gentle: { damping: 20, stiffness: 140, mass: 1 } satisfies WithSpringConfig,
  bouncy: { damping: 12, stiffness: 220, mass: 1 } satisfies WithSpringConfig,
} as const;
export type SpringKind = keyof typeof springs;

export const durations = { fast: 120, base: 200, slow: 320 } as const;

export const easeOut = Easing.out(Easing.cubic);
export const timing = {
  fast: { duration: durations.fast, easing: easeOut } satisfies WithTimingConfig,
  base: { duration: durations.base, easing: easeOut } satisfies WithTimingConfig,
  slow: { duration: durations.slow, easing: easeOut } satisfies WithTimingConfig,
  reduced: { duration: 150 } satisfies WithTimingConfig,
} as const;

/** Card entry stagger: 30 ms per card, capped so long lists never feel slow. */
export const STAGGER_MS = 30;
export const STAGGER_CAP = 6;
export function staggerDelay(index: number): number {
  return Math.min(Math.max(index, 0), STAGGER_CAP) * STAGGER_MS;
}

export type ResolvedMotion = { kind: "spring"; config: WithSpringConfig } | { kind: "timing"; config: WithTimingConfig };
export function resolveSpring(kind: SpringKind, reduceMotion: boolean): ResolvedMotion {
  return reduceMotion ? { kind: "timing", config: { duration: 150 } } : { kind: "spring", config: springs[kind] };
}

/** Entering animation for the i-th card of a screen. */
export function enterCard(index: number, reduceMotion: boolean) {
  if (reduceMotion) return FadeIn.duration(150);
  return FadeInDown.springify().damping(18).stiffness(200).delay(staggerDelay(index)).withInitialValues({ transform: [{ translateY: 12 }] });
}
export const fadeIn = FadeIn.duration(durations.base);
export const fadeOut = FadeOut.duration(durations.base);
export const PRESS_SCALE = 0.97;
