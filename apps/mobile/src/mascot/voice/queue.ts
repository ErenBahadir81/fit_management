/**
 * Floo's message queue: pure data, no React. One bubble shows at a time; the rest wait in priority
 * order. Everything here is deterministic given `now`, so the rules can be tested without timers.
 */
import type { Mood as FlooMood, Trigger as FlooTrigger } from "../model";

export type FlooPriority = "low" | "normal" | "high" | "urgent";

export const PRIORITY_RANK: Record<FlooPriority, number> = { low: 0, normal: 1, high: 2, urgent: 3 };

export interface FlooAction {
  label: string;
  onPress: () => void;
}

/**
 * What a caller hands to `say()`. Only `text` is required.
 *
 * Moods and triggers are the Floo 3 model's own (`model/params.ts`), because that is what the
 * corner draws. A mood from the API (`@fitfloow/core`'s ten, e.g. `cheer`, `flex`) goes through
 * `toFlooMood` first.
 */
export interface FlooMessage {
  text: string;
  /** Face while the bubble is up. Defaults by priority (warnings look worried, the rest happy). */
  mood?: FlooMood;
  /** One-shot animation fired when the bubble appears. Any name the model knows. */
  trigger?: FlooTrigger;
  priority?: FlooPriority;
  /** One button in the bubble. Pressing it runs `onPress` and dismisses the bubble. */
  action?: FlooAction;
  /**
   * Messages with the same key replace each other instead of piling up: a second "over target"
   * while the first is still waiting updates it in place, and one already on screen is not repeated.
   */
  dedupeKey?: string;
  /** How long the bubble stays up. Default scales with the text; `null` = until dismissed. */
  ttlMs?: number | null;
  /** Tone of the bubble's accent: `warning` for anything the user should act on. */
  tone?: "neutral" | "warning" | "success";
  /**
   * Called each time the line actually comes on screen (not when it is queued: a waiting line can
   * still be dropped unseen). Must be idempotent.
   */
  onShow?: () => void;
}

export interface QueuedMessage extends Required<Pick<FlooMessage, "text" | "priority">> {
  id: string;
  mood: FlooMood;
  trigger?: FlooTrigger;
  action?: FlooAction;
  dedupeKey?: string;
  ttlMs: number | null;
  tone: "neutral" | "warning" | "success";
  onShow?: () => void;
  /** Insertion order, the tie-break inside one priority (FIFO). */
  seq: number;
  createdAt: number;
}

export interface QueueState {
  current: QueuedMessage | null;
  pending: QueuedMessage[];
  /** Last few messages shown, newest first. Tapping an idle Floo replays the head of this. */
  history: QueuedMessage[];
  seq: number;
}

export const EMPTY_QUEUE: QueueState = { current: null, pending: [], history: [], seq: 0 };

/** Waiting messages older than this are dropped: a stale "you're over target" helps nobody. */
export const STALE_MS = 2 * 60_000;
export const HISTORY_SIZE = 5;
/** Cap on waiting messages. Beyond it the lowest-priority, oldest one is dropped. */
export const MAX_PENDING = 6;

/**
 * Reading time: a 250 wpm reader gets ~4 words a second; we give a floor for glancing up from the
 * bar and a ceiling so a long line does not squat on the header. Actions add time to decide.
 */
export function readingTime(text: string, hasAction: boolean): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const base = Math.min(9000, Math.max(3500, 1800 + words * 320));
  return hasAction ? base + 2500 : base;
}

function defaultMood(m: FlooMessage): FlooMood {
  if (m.mood) return m.mood;
  if (m.tone === "warning" || m.priority === "high" || m.priority === "urgent") return "worried";
  if (m.tone === "success") return "celebrate";
  return "happy";
}

function defaultTone(m: FlooMessage): QueuedMessage["tone"] {
  if (m.tone) return m.tone;
  return m.priority === "high" || m.priority === "urgent" ? "warning" : "neutral";
}

export function normalize(m: FlooMessage, id: string, seq: number, now: number): QueuedMessage {
  const priority = m.priority ?? "normal";
  const withPriority = { ...m, priority };
  return {
    id,
    text: m.text.trim(),
    priority,
    mood: defaultMood(withPriority),
    trigger: m.trigger,
    action: m.action,
    dedupeKey: m.dedupeKey,
    ttlMs: m.ttlMs === undefined ? readingTime(m.text, Boolean(m.action)) : m.ttlMs,
    tone: defaultTone(withPriority),
    onShow: m.onShow,
    seq,
    createdAt: now,
  };
}

/** Highest priority first; FIFO within a priority. */
function byPriority(a: QueuedMessage, b: QueuedMessage): number {
  return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || a.seq - b.seq;
}

function pushHistory(history: QueuedMessage[], m: QueuedMessage | null): QueuedMessage[] {
  if (!m) return history;
  return [m, ...history.filter((h) => h.id !== m.id)].slice(0, HISTORY_SIZE);
}

/**
 * Add a message. Returns the new state; `enqueue` never shows anything by itself unless nothing
 * is on screen or the newcomer is `urgent` and outranks what is showing (then it preempts and the
 * interrupted message goes back to the front of its priority band).
 */
export function enqueue(state: QueueState, msg: FlooMessage, id: string, now: number): QueueState {
  if (!msg.text.trim()) return state;
  const seq = state.seq + 1;
  const q = normalize(msg, id, seq, now);

  // Same key already on screen: refresh its words in place rather than repeating the beat.
  if (q.dedupeKey && state.current?.dedupeKey === q.dedupeKey) {
    return { ...state, seq, current: { ...state.current, text: q.text, mood: q.mood, tone: q.tone, action: q.action } };
  }
  const pending = q.dedupeKey ? state.pending.filter((p) => p.dedupeKey !== q.dedupeKey) : [...state.pending];

  if (!state.current) {
    return { ...state, seq, current: q, pending: prune(pending, now) };
  }
  if (q.priority === "urgent" && PRIORITY_RANK[q.priority] > PRIORITY_RANK[state.current.priority]) {
    // The interrupted one keeps its seq, so it resumes ahead of later arrivals of its priority.
    return { ...state, seq, current: q, pending: prune([...pending, state.current].sort(byPriority), now) };
  }
  return { ...state, seq, pending: prune([...pending, q].sort(byPriority), now) };
}

function prune(pending: QueuedMessage[], now: number): QueuedMessage[] {
  const fresh = pending.filter((p) => p.priority === "urgent" || now - p.createdAt <= STALE_MS);
  if (fresh.length <= MAX_PENDING) return fresh;
  // Drop from the tail (lowest priority, newest within it) until we fit.
  return fresh.sort(byPriority).slice(0, MAX_PENDING);
}

/** The bubble went away (timer, tap, action). The next waiting message, if any, takes its place. */
export function advance(state: QueueState, now: number): QueueState {
  const pending = prune(state.pending, now);
  const [next, ...rest] = pending;
  return { ...state, current: next ?? null, pending: rest, history: pushHistory(state.history, state.current) };
}

/** Remove one message wherever it is. Dismissing the one on screen advances the queue. */
export function remove(state: QueueState, id: string, now: number): QueueState {
  if (state.current?.id === id) return advance(state, now);
  return { ...state, pending: state.pending.filter((p) => p.id !== id) };
}

/** Everything goes: used when the mascot is switched off or the user signs out. */
export function clear(state: QueueState): QueueState {
  return { ...state, current: null, pending: [], history: pushHistory(state.history, state.current) };
}

/** Put the most recent message back on screen (tap on an idle Floo). */
export function replay(state: QueueState, now: number, maxAgeMs = 10 * 60_000): QueueState {
  if (state.current) return state;
  const last = state.history[0];
  if (!last || now - last.createdAt > maxAgeMs) return state;
  return { ...state, current: { ...last, trigger: undefined }, history: state.history.slice(1) };
}
