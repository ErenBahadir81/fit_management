import { useQuery } from "@tanstack/react-query";
import type { MascotMessage, Mood } from "@fitfloow/core";
import { getApi } from "../lib/api";

export type MascotContext = "home" | "report" | "scan" | "workout" | "body" | "goal";

export interface MascotLine {
  mood: Mood;
  text: string;
  key: string | null;
  isLoading: boolean;
}

/** Calm, non-shaming fallbacks used while loading or when the API is unreachable. */
export const MASCOT_FALLBACK: Record<MascotContext, MascotLine> = {
  home: { mood: "happy", text: "Bugün küçük bir adım bile sayılır.", key: null, isLoading: false },
  report: { mood: "happy", text: "Haftanın özeti hazırlanıyor.", key: null, isLoading: false },
  scan: { mood: "happy", text: "Bakalım tabakta ne var…", key: null, isLoading: false },
  workout: { mood: "happy", text: "Hazır olduğunda başlayalım.", key: null, isLoading: false },
  body: { mood: "happy", text: "Ölçümlerin hikâyeni anlatır.", key: null, isLoading: false },
  goal: { mood: "happy", text: "Hedefe adım adım.", key: null, isLoading: false },
};

/**
 * Floo's line for a screen. Pass the composite's message (e.g. `home.mascot`) as `seed` to avoid a
 * second request; otherwise `/mascot/message?context=` is fetched (5 min stale, offline-tolerant).
 */
export function useMascot(context: MascotContext, seed?: MascotMessage | null): MascotLine {
  const q = useQuery({
    queryKey: ["mascot", context],
    queryFn: () => getApi().mascot.message(context),
    enabled: !seed,
    staleTime: 5 * 60_000,
    retry: 0,
  });
  if (seed) return { mood: seed.mood, text: seed.text, key: seed.key, isLoading: false };
  if (q.data) return { mood: q.data.mood, text: q.data.text, key: q.data.key, isLoading: false };
  const fb = MASCOT_FALLBACK[context];
  return { ...fb, isLoading: q.isPending && !q.isError };
}
