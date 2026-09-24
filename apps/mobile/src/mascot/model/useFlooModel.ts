import { useCallback, useMemo, useRef, useState } from "react";
import type { EffectKind } from "./Effects";
import type { FlooModelProps } from "./FlooModel";
import { MOOD_PARAMS, type Mood, type Trigger } from "./params";

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
  setMood: (mood: Mood) => void;
  setHydration: (hydration: number) => void;
  setLook: (look: { x: number; y: number }) => void;
  /** Spread straight onto `<FlooModel />`. */
  flooProps: Pick<FlooModelProps, "mood" | "hydration" | "look" | "trigger" | "onTriggerEnd">;
}

/** What each trigger does to the mood, what it throws in the air, and how long it owns the face. */
const PLAN: Record<Trigger, { mood: Mood | null; effect: EffectKind | null; hold: number; hydration?: number }> = {
  mealLogged: { mood: "happy", effect: "hearts", hold: 1400 },
  goalHit: { mood: "celebrate", effect: "confetti", hold: 1800 },
  streakUp: { mood: "celebrate", effect: "star", hold: 1600 },
  // Sinks for a moment, then picks itself up through `worried` — it never stays punished.
  missedDay: { mood: "sad", effect: null, hold: 1500 },
  overTarget: { mood: "worried", effect: null, hold: 1400 },
  waterLogged: { mood: "happy", effect: "droplets", hold: 1300, hydration: 0.15 },
  tap: { mood: null, effect: null, hold: 0 },
};

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
    const plan = PLAN[name];

    setTrigger(name);
    setTriggerKey((k) => k + 1);
    if (plan.effect) setEffect((e) => ({ kind: plan.effect, nonce: e.nonce + 1 }));
    if (plan.hydration) setHydrationState((h) => Math.max(0, Math.min(1, h + plan.hydration!)));
    if (plan.mood) setMoodState(plan.mood);

    const back = restingMood.current;
    if (name === "missedDay") {
      // sad → worried → back. The recovery is the whole point of the beat.
      timers.current.push(setTimeout(() => setMoodState("worried"), plan.hold));
      timers.current.push(setTimeout(() => setMoodState(back), plan.hold + 900));
    } else if (plan.mood) {
      timers.current.push(setTimeout(() => setMoodState(back), plan.hold));
    }
    if (plan.effect) {
      timers.current.push(setTimeout(() => setEffect((e) => ({ kind: null, nonce: e.nonce })), 1600));
    }
  }, []);

  const flooProps = useMemo(
    () => ({
      mood,
      hydration,
      look,
      trigger: trigger ? { name: trigger, key: triggerKey } : null,
      onTriggerEnd: undefined,
    }),
    [mood, hydration, look, trigger, triggerKey]
  );

  return { mood, hydration, look, triggerKey, trigger, effect, fire, setMood, setHydration, setLook, flooProps };
}

export { MOOD_PARAMS };
