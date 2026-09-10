import { searchKey } from "../utils/index";

/**
 * Food search ranking. Mongo does the coarse filtering (searchKey prefix / alias / $text);
 * this pure scorer decides the final order so the ranking is testable without a database.
 *
 * Tiers: exact name > name prefix > exact alias > alias prefix > word-start > contains > text score.
 * Popularity and `verified` only break ties (max +12 combined, i.e. never enough to jump a tier).
 */
export interface RankableFood {
  searchKey: string;
  aliases: string[];
  popularity: number;
  verified?: boolean;
  /** Mongo `$meta: "textScore"` when the candidate came from the text index. */
  textScore?: number;
}

const TIER_EXACT = 100;
const TIER_PREFIX = 80;
const TIER_ALIAS_EXACT = 70;
const TIER_ALIAS_PREFIX = 55;
const TIER_WORD_START = 45;
const TIER_CONTAINS = 30;
const TIER_TEXT = 15;

/** Turkish-folded, punctuation-stripped, whitespace-collapsed form used for every comparison. */
export function normalizeQuery(q: string): string {
  return searchKey(q ?? "");
}

export function queryTokens(q: string): string[] {
  const n = normalizeQuery(q);
  return n === "" ? [] : n.split(" ");
}

function wordStarts(haystack: string, token: string): boolean {
  return haystack.split(" ").some((w) => w.startsWith(token));
}

function baseScore(food: RankableFood, q: string, tokens: string[]): number {
  const key = food.searchKey ?? "";
  if (key === q) return TIER_EXACT;
  if (key.startsWith(q)) return TIER_PREFIX;

  const aliases = (food.aliases ?? []).map(normalizeQuery);
  if (aliases.includes(q)) return TIER_ALIAS_EXACT;
  if (aliases.some((a) => a.startsWith(q))) return TIER_ALIAS_PREFIX;

  if (tokens.every((t) => wordStarts(key, t))) return TIER_WORD_START;
  if (tokens.every((t) => aliases.some((a) => wordStarts(a, t)))) return TIER_WORD_START;
  if (tokens.every((t) => key.includes(t) || aliases.some((a) => a.includes(t)))) return TIER_CONTAINS;

  return (food.textScore ?? 0) > 0 ? TIER_TEXT : 0;
}

/** Relevance of `food` for `query`; 0 means "no match, drop it". */
export function foodScore(food: RankableFood, query: string): number {
  const q = normalizeQuery(query);
  if (q === "") return 0;
  const tokens = q.split(" ");
  const base = baseScore(food, q, tokens);
  if (base === 0) return 0;
  const popularity = Math.min(Math.max(food.popularity ?? 0, 0), 500) / 50; // 0..10
  const verified = food.verified ? 2 : 0;
  const text = Math.min(Math.max(food.textScore ?? 0, 0), 3);
  return base + popularity + verified + text;
}

/** Sort by relevance (descending), dropping non-matches. An empty query falls back to popularity. */
export function rankFoods<T extends RankableFood>(foods: readonly T[], query: string, limit?: number): T[] {
  const q = normalizeQuery(query);
  const ranked =
    q === ""
      ? [...foods].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      : foods
          .map((food) => ({ food, score: foodScore(food, q) }))
          .filter((r) => r.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((r) => r.food);
  return typeof limit === "number" ? ranked.slice(0, Math.max(0, limit)) : ranked;
}
