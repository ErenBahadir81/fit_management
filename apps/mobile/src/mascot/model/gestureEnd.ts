/**
 * Floo 3 — bookkeeping for `FlooModel`'s `onGestureEnd`. Plain JS on the React thread; no worklets.
 *
 * A gesture requested through the `gesture` prop ends exactly once, whichever way it ends:
 *  - its timeline completes (the frame loop reports the rig's request id back from the UI thread);
 *  - it is replaced by another gesture or by a trigger's gesture before it completes;
 *  - it could not be played at all (unknown name).
 * Only one prop gesture is ever pending, because a new one always replaces the old one. The frame
 * loop's report names the request id it finished, so a report that arrives after the gesture was
 * already replaced (the two threads race) is recognised as stale and dropped.
 */
import type { Gesture } from "./poses";

export interface GestureEndEvent {
  name: Gesture;
  /** The `key` the caller passed with the gesture. */
  key: number;
  /** false when the gesture was replaced (or could not play) before its timeline completed. */
  completed: boolean;
}

export class GestureEndTracker {
  private pending: { req: number; name: Gesture; key: number } | null = null;

  /** A prop gesture was handed to the rig as request `req`. Returns the one it replaced, if any. */
  start(req: number, name: Gesture, key: number): GestureEndEvent | null {
    const prev = this.interrupt();
    this.pending = { req, name, key };
    return prev;
  }

  /** The rig finished request `req`. Returns the event to report, or null if it is stale. */
  complete(req: number): GestureEndEvent | null {
    const p = this.pending;
    if (!p || p.req !== req) return null;
    this.pending = null;
    return { name: p.name, key: p.key, completed: true };
  }

  /** Something else took the limbs (a trigger's gesture). Returns the replaced gesture, if any. */
  interrupt(): GestureEndEvent | null {
    const p = this.pending;
    if (!p) return null;
    this.pending = null;
    return { name: p.name, key: p.key, completed: false };
  }
}
