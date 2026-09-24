/**
 * Plays one Floo cue on the model: walk, gesture, reach, let go — in that order, never overlapping.
 *
 * The order comes from `cueTimeline` (pure, tested); this hook only turns it into state the model
 * reads (`walking`, `gesture`, `pointAt`) and a translateX it owns (the model walks on the spot;
 * the caller moves it). A new cue cancels whatever is left of the previous one.
 *
 * Sequencing uses `gestureDuration(name)` through `cueTimeline`. When FlooModel grows an
 * `onGestureEnd` callback, the reach can start from it instead of from the timer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { View } from "react-native";
import { useSharedValue, withSequence, withTiming, type SharedValue } from "react-native-reanimated";
import { easeInOutStrong } from "../../theme/motion";
import type { Gesture } from "../../mascot/model";
import { ENTER_MS, ENTER_PX, WALK_MS, WALK_PX, cueTimeline, type FlooCue, type PointTarget, type Walk } from "./floo";

export interface DirectedCue extends FlooCue {
  /** Bump to replay; the same key twice is the same cue. */
  key: number;
  walk: Walk;
}

export interface FlooDirector {
  x: SharedValue<number>;
  walking: boolean;
  gesture: { name: Gesture; key: number } | null;
  pointAt: { x: number; y: number } | null;
}

type Measurable = Pick<View, "measureInWindow"> | null;

function measure(v: Measurable): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!v?.measureInWindow) return resolve(null);
    try {
      v.measureInWindow((x, y, width, height) => resolve(Number.isFinite(x) && width > 0 ? { x, y, width, height } : null));
    } catch {
      resolve(null);
    }
  });
}

export function useFlooDirector(
  cue: DirectedCue,
  reduce: boolean,
  flooRef: React.RefObject<Measurable>,
  targets: React.RefObject<Partial<Record<PointTarget, Measurable>>>
): FlooDirector {
  const x = useSharedValue(cue.walk === "enter" && !reduce ? -ENTER_PX : 0);
  const [walking, setWalking] = useState(false);
  const [gesture, setGesture] = useState<FlooDirector["gesture"]>(null);
  const [pointAt, setPointAt] = useState<FlooDirector["pointAt"]>(null);
  const gestureKey = useRef(0);

  const reach = useCallback(
    async (target: PointTarget) => {
      const [floo, t] = await Promise.all([measure(flooRef.current), measure(targets.current?.[target] ?? null)]);
      if (!floo || !t) return;
      // FlooModel wants its own pixels: (0,0) is the top-left of its box.
      setPointAt({ x: t.x + t.width / 2 - floo.x, y: t.y + t.height / 2 - floo.y });
    },
    [flooRef, targets]
  );

  useEffect(() => {
    const events = cueTimeline({ walk: cue.walk, gesture: cue.gesture, point: cue.point }, reduce);
    if (reduce) x.set(0);
    const timers = events.map((e) =>
      setTimeout(() => {
        switch (e.kind) {
          case "walkStart": {
            setWalking(true);
            if (cue.walk === "enter") {
              x.set(-ENTER_PX);
              x.set(withTiming(0, { duration: ENTER_MS, easing: easeInOutStrong }));
            } else {
              const lean = (cue.walk === -1 ? -1 : 1) * WALK_PX;
              x.set(withSequence(withTiming(lean, { duration: WALK_MS / 2, easing: easeInOutStrong }), withTiming(0, { duration: WALK_MS / 2, easing: easeInOutStrong })));
            }
            break;
          }
          case "walkEnd":
            setWalking(false);
            break;
          case "gesture":
            if (cue.gesture) setGesture({ name: cue.gesture, key: ++gestureKey.current });
            break;
          case "point":
            if (cue.point) void reach(cue.point);
            break;
          case "unpoint":
            setPointAt(null);
            break;
        }
      }, e.at)
    );
    return () => {
      timers.forEach(clearTimeout);
      setWalking(false);
      setPointAt(null);
    };
    // One run per cue: the key is the cue's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue.key, reduce]);

  return { x, walking, gesture, pointAt };
}
