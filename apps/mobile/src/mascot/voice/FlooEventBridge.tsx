import { describeFlooEvent, useFlooEvents, type FlooEvent } from "../events";
import { useFloo } from "./FlooVoiceProvider";
import { onceMessage } from "./useFlooOnce";
import type { FlooMessage } from "./queue";

/**
 * Events already turned into a line. Module-wide on purpose: however many bridges end up mounted
 * (a second one by mistake, a dev double-mount), one event is one line.
 */
const delivered = new WeakSet<FlooEvent>();

/**
 * Floo's ears. The data layer announces what happened on `flooBus` (a meal logged, a workout done,
 * a measurement saved, a goal hit) and this turns each event into one line in Floo's queue: the
 * words, the face and the gesture that belong together (`describeFlooEvent`). The corner Floo then
 * plays the gesture as the bubble drops.
 *
 * Mounted once, inside `FlooVoiceProvider` at the root (`app/_layout.tsx`), so every tab and modal
 * hears the same events without subscribing. Renders nothing.
 *
 * - Only events that happen while it is mounted, and while a Floo can be seen, are spoken; nothing
 *   is replayed from the bus's history, so a remount can never say an old line again.
 * - With the mascot switched off, events stay silent: Floo's asides are not worth a toast, and the
 *   mutations behind them already confirm themselves.
 * - "Once" lines (today went over its target) share their memory with `useFlooOnce`, so the home
 *   screen does not repeat what the meal that crossed the line already said, and vice versa.
 */
export function FlooEventBridge(): null {
  const { say, presence } = useFloo();
  useFlooEvents((event) => {
    // No Floo on screen (mascot switched off, or onboarding, which draws its own): a reaction is
    // about the moment, so it is neither saved up to pop out of context later nor made a toast.
    if (presence === "hidden" || delivered.has(event)) return;
    delivered.add(event);
    const line = describeFlooEvent(event);
    const msg: FlooMessage = {
      text: line.text,
      mood: line.mood,
      trigger: line.trigger,
      priority: line.priority,
      tone: line.tone,
      dedupeKey: line.key,
      ttlMs: line.ttlMs,
    };
    // A fact about the day that was already told is not news (see `onceMessage`).
    const out = line.once ? onceMessage(line.key, msg) : msg;
    if (out) say(out);
  });
  return null;
}
