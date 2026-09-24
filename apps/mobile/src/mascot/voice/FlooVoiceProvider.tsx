import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AppState } from "react-native";
import { haptic } from "../../lib/haptics";
import { useToast } from "../../ui/Toast";
import type { FlooMood } from "../moods";
import type { Trigger } from "../model/params";
import { EMPTY_QUEUE, advance, clear, enqueue, remove, replay, type FlooMessage, type QueueState, type QueuedMessage } from "./queue";

/**
 * Where the corner Floo is right now.
 * - `idle`: visible at rest in the top-right (tab screens).
 * - `auto`: hidden at rest, slides in only while it has something to say (modals, sheets).
 * - `hidden`: never shown; messages wait until a screen shows Floo again (onboarding owns its
 *   own big Floo, the camera is full-bleed).
 */
export type FlooPresence = "idle" | "auto" | "hidden";

export interface FlooVoice {
  /** Queue a line. Returns its id (for `dismiss`). Empty text is ignored and returns "". */
  say: (message: FlooMessage | string) => string;
  /** Dismiss one message (default: the one on screen). */
  dismiss: (id?: string) => void;
  /** A one-shot animation with no bubble: a completed set, a logged glass of water. */
  react: (trigger: Trigger) => void;
  /** Tap on an idle Floo: bring back the last line, or just wave. */
  poke: () => void;
  /** Hold the auto-dismiss timer (finger on the bubble) and let it go again. */
  hold: (held: boolean) => void;
  current: QueuedMessage | null;
  pendingCount: number;
  /** `false` when the user switched the mascot off. `say()` then falls back to a toast. */
  enabled: boolean;
  presence: FlooPresence;
  /** Last fired one-shot, keyed so the same trigger twice still fires twice. */
  reaction: { name: Trigger; key: number } | null;
  /** Face at rest (no bubble). */
  restingMood: FlooMood;
}

interface PresenceApi {
  push: (id: number, p: FlooPresence) => () => void;
  /** Id of the most recently mounted presence entry: the only host allowed to draw Floo. */
  topId: number | null;
}

const VoiceContext = createContext<FlooVoice | null>(null);
const PresenceContext = createContext<PresenceApi | null>(null);

type Action =
  | { type: "say"; msg: FlooMessage; id: string; now: number }
  | { type: "advance"; now: number }
  | { type: "remove"; id: string; now: number }
  | { type: "replay"; now: number }
  | { type: "clear" };

function reducer(state: QueueState, a: Action): QueueState {
  switch (a.type) {
    case "say":
      return enqueue(state, a.msg, a.id, a.now);
    case "advance":
      return advance(state, a.now);
    case "remove":
      return remove(state, a.id, a.now);
    case "replay":
      return replay(state, a.now);
    case "clear":
      return clear(state);
  }
}

export interface FlooVoiceProviderProps {
  children: React.ReactNode;
  /** The user's "show Floo" preference. Off → lines become plain toasts, the corner disappears. */
  enabled?: boolean;
  /** Presence when no screen has asked for anything. `hidden`: no host is mounted (sign-in). */
  defaultPresence?: FlooPresence;
  restingMood?: FlooMood;
}

let idSeq = 0;
const nextId = () => `floo-${Date.now().toString(36)}-${(++idSeq).toString(36)}`;

/**
 * The one channel for warnings and basic notices. Sits inside `ToastProvider`: neutral system
 * confirmations (saved, deleted, undo) stay toasts; anything the user should notice or act on
 * comes from Floo. When the mascot is off, Floo's lines degrade to toasts so nothing is lost.
 */
export function FlooVoiceProvider({ children, enabled = true, defaultPresence = "hidden", restingMood = "happy" }: FlooVoiceProviderProps) {
  const [state, dispatch] = useReducer(reducer, EMPTY_QUEUE);
  const [reaction, setReaction] = useState<FlooVoice["reaction"]>(null);
  const [presenceStack, setPresenceStack] = useState<{ id: number; p: FlooPresence }[]>([]);
  const toast = useToast();
  const held = useRef(false);
  const remaining = useRef<number | null>(null);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactKey = useRef(0);

  const presence: FlooPresence = !enabled ? "hidden" : (presenceStack[presenceStack.length - 1]?.p ?? defaultPresence);
  const current = presence === "hidden" ? null : state.current;

  const stopTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const startTimer = useCallback(
    (ms: number) => {
      stopTimer();
      remaining.current = ms;
      startedAt.current = Date.now();
      timer.current = setTimeout(() => {
        timer.current = null;
        remaining.current = null;
        dispatch({ type: "advance", now: Date.now() });
      }, ms);
    },
    [stopTimer]
  );

  // A new message on screen: fire its beat, buzz for warnings, start its clock.
  useEffect(() => {
    stopTimer();
    if (!current) return;
    if (current.trigger) setReaction({ name: current.trigger, key: ++reactKey.current });
    if (current.tone === "warning") void haptic.warning();
    else if (current.tone === "success") void haptic.success();
    if (current.ttlMs != null && !held.current) startTimer(current.ttlMs);
    else remaining.current = current.ttlMs;
    return stopTimer;
    // Keyed on the id only: an in-place dedupe refresh must not restart the beat or the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, presence === "hidden"]);

  // Backgrounded: freeze the clock so a line is not "read" while the phone is in a pocket.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (!current || current.ttlMs == null) return;
      if (s !== "active") {
        if (timer.current) {
          remaining.current = Math.max(800, (remaining.current ?? 0) - (Date.now() - startedAt.current));
          stopTimer();
        }
      } else if (!timer.current && !held.current && remaining.current != null) {
        startTimer(remaining.current);
      }
    });
    return () => sub.remove();
  }, [current, startTimer, stopTimer]);

  // Mascot switched off mid-bubble: drop the queue rather than dumping it into toasts at once.
  useEffect(() => {
    if (!enabled) dispatch({ type: "clear" });
  }, [enabled]);

  // Failures that screens report as error toasts are warnings, and warnings are Floo's to deliver.
  // Only while Floo can actually be seen; otherwise the toast shows as before.
  const canSpeak = enabled && presence !== "hidden";
  useEffect(
    () =>
      toast.route((opts) => {
        if (!canSpeak || opts.kind !== "error") return false;
        dispatch({ type: "say", msg: { text: opts.message, priority: "high", tone: "warning", dedupeKey: `toast:${opts.message}` }, id: nextId(), now: Date.now() });
        return true;
      }),
    [toast, canSpeak]
  );

  const say = useCallback(
    (input: FlooMessage | string) => {
      const msg: FlooMessage = typeof input === "string" ? { text: input } : input;
      if (!msg.text?.trim()) return "";
      if (!enabled) {
        const warning = msg.tone === "warning" || msg.priority === "high" || msg.priority === "urgent";
        toast.show({ message: msg.text, kind: warning ? "error" : msg.tone === "success" ? "success" : "info" });
        return "";
      }
      const id = nextId();
      dispatch({ type: "say", msg, id, now: Date.now() });
      return id;
    },
    [enabled, toast]
  );

  const dismiss = useCallback(
    (id?: string) => {
      held.current = false;
      if (id) dispatch({ type: "remove", id, now: Date.now() });
      else dispatch({ type: "advance", now: Date.now() });
    },
    []
  );

  const react = useCallback((trigger: Trigger) => {
    setReaction({ name: trigger, key: ++reactKey.current });
  }, []);

  const poke = useCallback(() => {
    if (state.current) return;
    if (state.history.length) dispatch({ type: "replay", now: Date.now() });
    setReaction({ name: "tap", key: ++reactKey.current });
  }, [state.current, state.history.length]);

  const hold = useCallback(
    (h: boolean) => {
      held.current = h;
      if (!current || current.ttlMs == null) return;
      if (h && timer.current) {
        remaining.current = Math.max(800, (remaining.current ?? 0) - (Date.now() - startedAt.current));
        stopTimer();
      } else if (!h && !timer.current) {
        // Let go: give at least a beat to finish reading the line that was being held.
        startTimer(Math.max(1500, remaining.current ?? 1500));
      }
    },
    [current, startTimer, stopTimer]
  );

  const voice = useMemo<FlooVoice>(
    () => ({ say, dismiss, react, poke, hold, current, pendingCount: state.pending.length, enabled, presence, reaction, restingMood }),
    [say, dismiss, react, poke, hold, current, state.pending.length, enabled, presence, reaction, restingMood]
  );

  const push = useCallback((id: number, p: FlooPresence) => {
    setPresenceStack((s) => [...s.filter((e) => e.id !== id), { id, p }]);
    return () => setPresenceStack((s) => s.filter((e) => e.id !== id));
  }, []);
  const topId = presenceStack[presenceStack.length - 1]?.id ?? null;
  const presenceApi = useMemo<PresenceApi>(() => ({ push, topId }), [push, topId]);

  return (
    <PresenceContext.Provider value={presenceApi}>
      <VoiceContext.Provider value={voice}>{children}</VoiceContext.Provider>
    </PresenceContext.Provider>
  );
}

/**
 * Floo's voice. `say()` from anywhere under the root: mutations' `onError`, domain events, a
 * screen's own warnings. Outside the provider (isolated component tests) it is a harmless no-op.
 */
export function useFloo(): FlooVoice {
  return useContext(VoiceContext) ?? NOOP_VOICE;
}

let presenceSeq = 0;

/**
 * A screen declares how Floo should behave while it is mounted; the latest mounted one wins.
 * Returns whether this entry is the one in charge (hosts use it to decide who draws Floo).
 */
export function useFlooPresence(presence: FlooPresence): boolean {
  const api = useContext(PresenceContext);
  const [id] = useState(() => ++presenceSeq);
  const push = api?.push;
  useEffect(() => push?.(id, presence), [push, id, presence]);
  return api?.topId === id;
}

const noop = () => {};
const NOOP_VOICE: FlooVoice = {
  say: () => "",
  dismiss: noop,
  react: noop,
  poke: noop,
  hold: noop,
  current: null,
  pendingCount: 0,
  enabled: false,
  presence: "hidden",
  reaction: null,
  restingMood: "happy",
};
