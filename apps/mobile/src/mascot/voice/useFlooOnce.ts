import { useEffect } from "react";
import { STORAGE_KEYS, getJSON, setJSON } from "../../lib/storage";
import { useFloo } from "./FlooVoiceProvider";
import type { FlooMessage } from "./queue";

/** Remembered keys expire after this; a "once" is per day at most in practice (keys carry dates). */
const KEEP_MS = 3 * 24 * 60 * 60_000;
const MAX_KEYS = 200;

type Said = Record<string, number>;

/** Pure: has `key` been said, and the map with `key` recorded and old keys pruned. */
export function markSaid(said: Said, key: string, now: number): Said {
  const fresh = Object.entries(said).filter(([, at]) => now - at < KEEP_MS);
  fresh.push([key, now]);
  return Object.fromEntries(fresh.slice(-MAX_KEYS));
}

export function wasSaid(key: string): boolean {
  return Boolean(getJSON<Said>(STORAGE_KEYS.flooSaid)?.[key]);
}

/**
 * Say `message` once per `key`, ever (well, for three days). For lines that come from state rather
 * than an event: "you're over target today", the day's greeting, a weekly nudge. Put the date in
 * the key when the line is daily (`over:2026-09-24`). Pass `null` while there is nothing to say.
 * Screens mount and remount constantly; without this the same warning would pop on every visit.
 */
export function useFlooOnce(key: string | null, message: FlooMessage | null): void {
  const { say, enabled, presence } = useFloo();
  const ready = enabled && presence !== "hidden";
  const text = message?.text;
  useEffect(() => {
    if (!ready || !key || !message || !text) return;
    const said = getJSON<Said>(STORAGE_KEYS.flooSaid) ?? {};
    if (said[key]) return;
    setJSON(STORAGE_KEYS.flooSaid, markSaid(said, key, Date.now()));
    say({ dedupeKey: key, ...message });
    // `message` is a fresh object each render; the key and text are what identify the line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, text, say]);
}
