import { useCallback, useMemo, useRef, useState } from "react";
import { TRIGGER_PLAN } from "./behaviour";
import type { EffectKind } from "./Effects";
import type { FlooModelProps } from "./FlooModel";
import { MOOD_PARAMS, type Mood, type Trigger } from "./params";
import type { Gesture } from "./poses";

export interface FlooEffectState {
  kind: EffectKind | null;
  nonce: number;
}

export interface FlooController {
  mood: Mood;
  hydration: number;
  look: { x: number; y: number };
  triggerKey: number;
  trigger: Trigger | null;
  effect: FlooEffectState;
  fire: (trigger: Trigger) => void;
  /** Play a gesture from the pose library on its own, without a mood change or an effect. */
  play: (gesture: Gesture, mirror?: boolean) => void;
  setMood: (mood: Mood) => void;
  walking: boolean;
  setWalking: (walking: boolean) => void;
  pointAt: { x: number; y: number } | null;
  setPointAt: (p: { x: number; y: number } | null) => void;
  setHydration: (hydration: number) => void;
  setLook: (look: { x: number; y: number }) => void;
  /** Spread straight onto `<FlooModel />`. */
  flooProps: Pick<FlooModelProps, "mood" | "hydration" | "look" | "trigger" | "onTriggerEnd" | "gesture" | "walking" | "pointAt">;
}

/**
 * The state around the character: which mood is showing, how hydrated it is, where it is looking,
 * and the one-shot triggers. Kept out of `FlooModel` so screens can drive the mascot from their own
 * domain events without knowing anything about springs.
 */
export function useFlooModel(initial: Mood = "idle", initialHydration = 0.75): FlooController {
  const [mood, setMoodState] = useState<Mood>(initial);
  const [hydration, setHydrationState] = useState(initialHydration);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [triggerKey, setTriggerKey] = useState(0);
  const [effect, setEffect] = useState<FlooEffectState>({ kind: null, nonce: 0 });
  const [gesture, setGesture] = useState<{ name: Gesture; key: number; mirror?: boolean } | null>(null);
  const [walking, setWalking] = useState(false);
  const [pointAt, setPointAt] = useState<{ x: number; y: number } | null>(null);

  /** The mood to fall back to once the juice is spent. */
  const restingMood = useRef<Mood>(initial);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const setMood = useCallback((m: Mood) => {
    restingMood.current = m;
    setMoodState(m);
  }, []);

  const setHydration = useCallback((h: number) => {
    setHydrationState(Math.max(0, Math.min(1, Number.isFinite(h) ? h : 0)));
  }, []);

  const fire = useCallback((name: Trigger) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const plan = TRIGGER_PLAN[name];

    setTrigger(name);
    setTriggerKey((k) => k + 1);
    if (plan.effect) setEffect((e) => ({ kind: plan.effect, nonce: e.nonce + 1 }));
    if (plan.hydration) setHydrationState((h) => Math.max(0, Math.min(1, h + plan.hydration!)));
    if (plan.mood) setMoodState(plan.mood);

    const back = restingMood.current;
    if (plan.recover) {
      // sad → worried → back. The recovery is the whole point of the beat.
      const recover = plan.recover;
      timers.current.push(setTimeout(() => setMoodState(recover), plan.hold));
      timers.current.push(setTimeout(() => setMoodState(back), plan.hold + 900));
    } else if (plan.mood) {
      timers.current.push(setTimeout(() => setMoodState(back), plan.hold));
    }
    if (plan.effect) {
      timers.current.push(setTimeout(() => setEffect((e) => ({ kind: null, nonce: e.nonce })), 1600));
    }
  }, []);

  const play = useCallback((name: Gesture, mirror = false) => {
    setGesture((g) => ({ name, key: (g?.key ?? 0) + 1, mirror }));
  }, []);

  const flooProps = useMemo(
    () => ({
      mood,
      hydration,
      look,
      trigger: trigger ? { name: trigger, key: triggerKey } : null,
      onTriggerEnd: undefined,
      gesture,
      walking,
      pointAt,
    }),
    [mood, hydration, look, trigger, triggerKey, gesture, walking, pointAt]
  );

  return {
    mood,
    hydration,
    look,
    triggerKey,
    trigger,
    effect,
    fire,
    play,
    setMood,
    setHydration,
    setLook,
    walking,
    setWalking,
    pointAt,
    setPointAt,
    flooProps,
  };
}

export { MOOD_PARAMS };
